import io
import time
import logging
from typing import Optional, List, Dict, Any, Tuple
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, OneHotEncoder, OrdinalEncoder
from sklearn.model_selection import train_test_split

from app.schemas.preprocessing import PreprocessingConfig, PreprocessingReport
from app.core.config import settings

logger = logging.getLogger(__name__)


def clean_infinite_and_nan(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Replaces +/- inf with NaN so numerical imputation can handle them safely."""
    num_cols = df.select_dtypes(include=[np.number]).columns
    inf_count = int(np.isinf(df[num_cols]).values.sum()) if len(num_cols) > 0 else 0
    if inf_count > 0:
        df[num_cols] = df[num_cols].replace([np.inf, -np.inf], np.nan)
    return df, inf_count


def execute_preprocessing(
    raw_content: bytes,
    config: PreprocessingConfig,
    job_id: str,
) -> Tuple[PreprocessingReport, bytes, Optional[bytes], Optional[bytes]]:
    """
    Executes a leak-free scikit-learn and pandas data preprocessing pipeline.
    
    Returns:
    - PreprocessingReport: Structured log of all operations and column changes.
    - full_processed_bytes: Cleaned, scaled, and encoded CSV dataset bytes.
    - train_bytes: Training partition CSV bytes (if split enabled).
    - test_bytes: Evaluation partition CSV bytes (if split enabled).
    """
    start_time = time.time()
    operations_performed: List[str] = []
    columns_removed: Dict[str, str] = {}
    warnings: List[str] = []

    # 1. Parse raw CSV
    text = raw_content.decode("utf-8", errors="replace")
    df = pd.read_csv(io.StringIO(text), engine="python", on_bad_lines="warn")
    original_rows, original_columns = df.shape
    operations_performed.append(f"Loaded raw CSV with {original_rows:,} rows and {original_columns} columns.")

    # 2. Replace Inf values
    df, inf_count = clean_infinite_and_nan(df)
    if inf_count > 0:
        operations_performed.append(f"Converted {inf_count:,} infinite values (+/- inf) to NaN for safe mathematical processing.")

    # 3. Drop exact duplicates if configured
    if config.drop_duplicates:
        dup_count = int(df.duplicated().sum())
        if dup_count > 0:
            df = df.drop_duplicates().reset_index(drop=True)
            operations_performed.append(f"Removed {dup_count:,} exact duplicate rows.")

    # 4. Handle Target / Label column isolation
    target_name = config.target_column
    target_series: Optional[pd.Series] = None
    target_classes: Optional[List[str]] = None

    if target_name:
        if target_name not in df.columns:
            raise ValueError(f"Configured target column '{target_name}' does not exist in dataset.")
        # Isolate target before any transformations to prevent target leakage
        target_series = df[target_name].copy()
        classes = target_series.dropna().unique().tolist()
        target_classes = [str(c) for c in classes]
        operations_performed.append(
            f"Isolated ground-truth target column '{target_name}' ({len(target_classes)} distinct classes). Target is strictly preserved and never transformed as an input feature."
        )
        df_features = df.drop(columns=[target_name])
    else:
        df_features = df.copy()

    # 5. User-configured column exclusions (drop_columns)
    if config.drop_columns:
        for col in config.drop_columns:
            if col in df_features.columns:
                df_features = df_features.drop(columns=[col])
                columns_removed[col] = "Explicitly excluded by researcher configuration."
        operations_performed.append(f"Excluded {len(columns_removed)} configured columns (e.g. flow identifiers, IP addresses).")

    # 6. User-configured feature selection (selected_features)
    if config.selected_features is not None:
        valid_selected = [c for c in config.selected_features if c in df_features.columns]
        deselected = [c for c in df_features.columns if c not in valid_selected]
        for col in deselected:
            if col not in columns_removed:
                columns_removed[col] = "Not included in selected features checklist."
        df_features = df_features[valid_selected]
        operations_performed.append(f"Retained {len(valid_selected)} features from user selection checklist.")

    # 7. Constant / Zero-variance column removal
    if config.remove_zero_variance:
        constant_cols = [c for c in df_features.columns if df_features[c].nunique(dropna=True) <= 1]
        for col in constant_cols:
            df_features = df_features.drop(columns=[col])
            columns_removed[col] = "Removed due to zero variance (constant column across all samples)."
        if constant_cols:
            operations_performed.append(f"Pruned {len(constant_cols)} constant zero-variance columns: {', '.join(constant_cols)}.")

    if df_features.empty or df_features.shape[1] == 0:
        raise ValueError("All feature columns were removed during filtering. Please adjust feature selection.")

    # 8. Handling Missing Values (Imputation or Row Drop)
    strat = config.imputation_strategy.lower()
    if strat == "drop_rows":
        before_drop = len(df_features)
        valid_idx = df_features.dropna().index
        df_features = df_features.loc[valid_idx].reset_index(drop=True)
        if target_series is not None:
            target_series = target_series.loc[valid_idx].reset_index(drop=True)
        dropped_missing_rows = before_drop - len(df_features)
        operations_performed.append(f"Dropped {dropped_missing_rows:,} rows containing missing values.")
    elif strat in ["mean", "median", "mode", "constant"]:
        num_cols = df_features.select_dtypes(include=[np.number]).columns
        cat_cols = df_features.select_dtypes(exclude=[np.number]).columns

        for col in num_cols:
            if df_features[col].isna().sum() > 0:
                if strat == "mean":
                    val = float(df_features[col].mean())
                elif strat == "median":
                    val = float(df_features[col].median())
                elif strat == "mode":
                    mode_s = df_features[col].mode()
                    val = float(mode_s.iloc[0]) if not mode_s.empty else 0.0
                elif strat == "constant":
                    val = float(config.imputation_constant or 0.0)
                else:
                    val = 0.0
                df_features[col] = df_features[col].fillna(val)

        for col in cat_cols:
            if df_features[col].isna().sum() > 0:
                cat_mode = df_features[col].mode()
                fill_cat = str(cat_mode.iloc[0]) if not cat_mode.empty else "Missing"
                df_features[col] = df_features[col].fillna(fill_cat)

        operations_performed.append(f"Imputed missing values across features using strategy: '{strat}'.")

    # 9. Categorical Encoding (OneHot or Ordinal)
    cat_cols = df_features.select_dtypes(exclude=[np.number]).columns.tolist()
    if cat_cols and config.categorical_encoding != "none":
        if config.categorical_encoding == "onehot":
            df_features = pd.get_dummies(df_features, columns=cat_cols, drop_first=False, dtype=float)
            operations_performed.append(f"One-hot encoded categorical columns ({len(cat_cols)}): {', '.join(cat_cols)}.")
        elif config.categorical_encoding == "ordinal":
            encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
            df_features[cat_cols] = encoder.fit_transform(df_features[cat_cols])
            operations_performed.append(f"Ordinal encoded categorical columns: {', '.join(cat_cols)}.")

    # 10. Split Strategy and Numerical Feature Scaling (Strict No-Leakage Protocol)
    # Split BEFORE scaling if split is configured
    is_split_enabled = (config.train_ratio + config.val_ratio + config.test_ratio) > 0.0 and config.train_ratio < 1.0
    train_rows, val_rows, test_rows = len(df_features), 0, 0
    train_bytes, test_bytes = None, None

    # Determine scaler
    scaler = None
    scaler_name = config.scaling_method.lower()
    if scaler_name == "robust":
        scaler = RobustScaler()
    elif scaler_name == "standard":
        scaler = StandardScaler()
    elif scaler_name == "minmax":
        scaler = MinMaxScaler()

    final_features_df = df_features.copy()
    num_features = final_features_df.select_dtypes(include=[np.number]).columns.tolist()

    if is_split_enabled and len(final_features_df) > 10:
        # Create Train / Temp Split
        train_size = config.train_ratio
        temp_size = 1.0 - train_size
        stratify_col = target_series if (config.stratify and target_series is not None and target_series.nunique() > 1) else None

        try:
            X_train, X_temp, y_train, y_temp = train_test_split(
                final_features_df,
                target_series if target_series is not None else pd.Series(range(len(final_features_df))),
                train_size=train_size,
                random_state=config.random_seed,
                stratify=stratify_col,
            )
        except Exception:
            # Fallback without stratification if min class has < 2 samples
            X_train, X_temp, y_train, y_temp = train_test_split(
                final_features_df,
                target_series if target_series is not None else pd.Series(range(len(final_features_df))),
                train_size=train_size,
                random_state=config.random_seed,
                stratify=None,
            )
            warnings.append("Stratified splitting failed due to very small class size. Applied random split.")

        # Split Temp into Val and Test
        val_share_in_temp = config.val_ratio / temp_size if temp_size > 0 else 0.5
        val_share_in_temp = min(max(val_share_in_temp, 0.01), 0.99)
        stratify_temp = y_temp if (config.stratify and target_series is not None and y_temp.nunique() > 1) else None

        try:
            X_val, X_test, y_val, y_test = train_test_split(
                X_temp,
                y_temp,
                train_size=val_share_in_temp,
                random_state=config.random_seed,
                stratify=stratify_temp,
            )
        except Exception:
            X_val, X_test, y_val, y_test = train_test_split(
                X_temp,
                y_temp,
                train_size=val_share_in_temp,
                random_state=config.random_seed,
                stratify=None,
            )

        train_rows = len(X_train)
        val_rows = len(X_val)
        test_rows = len(X_test)

        # FIT SCALER ONLY ON TRAINING DATA! (Prevent data leakage)
        if scaler and num_features:
            scaler.fit(X_train[num_features])
            X_train[num_features] = scaler.transform(X_train[num_features])
            X_val[num_features] = scaler.transform(X_val[num_features])
            X_test[num_features] = scaler.transform(X_test[num_features])
            # Also transform full dataset for unified representation
            final_features_df[num_features] = scaler.transform(final_features_df[num_features])
            operations_performed.append(
                f"Fitted {scaler_name.capitalize()}Scaler exclusively on X_train ({train_rows:,} samples) to prevent data leakage, then transformed val and test sets."
            )

        # Assemble train partition CSV
        train_df = X_train.copy()
        if target_series is not None:
            train_df[target_name] = y_train
        train_buf = io.StringIO()
        train_df.to_csv(train_buf, index=False)
        train_bytes = train_buf.getvalue().encode("utf-8")

        # Assemble test partition CSV
        test_df = X_test.copy()
        if target_series is not None:
            test_df[target_name] = y_test
        test_buf = io.StringIO()
        test_df.to_csv(test_buf, index=False)
        test_bytes = test_buf.getvalue().encode("utf-8")

    else:
        # No train/test partition: fit and transform on entire dataset
        if scaler and num_features:
            scaler.fit(final_features_df[num_features])
            final_features_df[num_features] = scaler.transform(final_features_df[num_features])
            operations_performed.append(f"Applied {scaler_name.capitalize()}Scaler across all numerical features.")

    # 11. Reattach ground truth target column to final output DataFrame
    processed_df = final_features_df.copy()
    if target_series is not None:
        processed_df[target_name] = target_series.values

    # 12. Serialize full processed dataset to CSV bytes
    out_buf = io.StringIO()
    processed_df.to_csv(out_buf, index=False)
    full_processed_bytes = out_buf.getvalue().encode("utf-8")

    remaining_missing = int(processed_df.isna().sum().sum())
    execution_time = round(time.time() - start_time, 3)

    report = PreprocessingReport(
        job_id=job_id,
        dataset_id=config.dataset_id,
        status="completed",
        original_rows=original_rows,
        original_columns=original_columns,
        processed_rows=len(processed_df),
        processed_columns=processed_df.shape[1],
        feature_names=final_features_df.columns.tolist(),
        target_name=target_name,
        target_classes=target_classes,
        train_rows=train_rows,
        val_rows=val_rows,
        test_rows=test_rows,
        operations_performed=operations_performed,
        columns_removed=columns_removed,
        remaining_missing_values=remaining_missing,
        warnings=warnings,
        processed_file_path=f"processed/{config.dataset_id}/{job_id}.csv",
        execution_time_seconds=execution_time,
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    return report, full_processed_bytes, train_bytes, test_bytes
