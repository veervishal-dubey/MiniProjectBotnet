import io
import pytest
import pandas as pd
import numpy as np
from app.schemas.preprocessing import PreprocessingConfig
from app.services.preprocessor import execute_preprocessing


def test_preprocessing_full_pipeline(sample_csv_bytes):
    config = PreprocessingConfig(
        dataset_id="test-ds-1",
        target_column="label",
        drop_columns=["flow_id", "timestamp", "src_ip", "dst_ip"],
        drop_duplicates=True,
        imputation_strategy="median",
        scaling_method="robust",
        categorical_encoding="onehot",
        remove_zero_variance=True,
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        random_seed=42,
    )

    report, full_bytes, train_bytes, test_bytes = execute_preprocessing(
        raw_content=sample_csv_bytes,
        config=config,
        job_id="job-test-01",
    )

    assert report.status == "completed"
    assert report.original_rows == 12
    assert report.target_name == "label"
    assert "is_constant" in report.columns_removed
    assert "flow_id" in report.columns_removed
    assert "src_ip" in report.columns_removed

    # Verify no data leakage: target column was isolated and preserved
    processed_df = pd.read_csv(io.StringIO(full_bytes.decode("utf-8")))
    assert "label" in processed_df.columns
    assert set(processed_df["label"].unique()) == {"Benign", "Mirai", "Bashlite"}

    # Target is NOT an input feature
    assert "label" not in report.feature_names

    # Check output integrity
    assert report.remaining_missing_values == 0
    assert full_bytes is not None
    assert train_bytes is not None
    assert test_bytes is not None


def test_preprocessing_imputation_and_infinite_handling(dirty_csv_bytes):
    config = PreprocessingConfig(
        dataset_id="test-ds-dirty",
        target_column="label",
        drop_duplicates=True,
        imputation_strategy="median",
        scaling_method="standard",
        categorical_encoding="onehot",
        remove_zero_variance=False,
        train_ratio=1.0,  # No split
        val_ratio=0.0,
        test_ratio=0.0,
    )

    report, full_bytes, _, _ = execute_preprocessing(
        raw_content=dirty_csv_bytes,
        config=config,
        job_id="job-dirty-01",
    )

    assert report.status == "completed"
    # Duplicates removed: dirty_csv had 6 rows with 2 duplicates -> 4 rows
    assert report.processed_rows == 4

    processed_df = pd.read_csv(io.StringIO(full_bytes.decode("utf-8")))
    # Check that infinite values (+/- inf) were handled safely and no NaNs remain
    assert not np.isinf(processed_df.select_dtypes(include=[np.number]).values).any()
    assert not processed_df.isna().values.any()


def test_preprocessing_drop_rows_strategy(dirty_csv_bytes):
    config = PreprocessingConfig(
        dataset_id="test-ds-dirty-drop",
        target_column="label",
        drop_duplicates=True,
        imputation_strategy="drop_rows",
        scaling_method="minmax",
        categorical_encoding="none",
        train_ratio=1.0,
        val_ratio=0.0,
        test_ratio=0.0,
    )

    report, full_bytes, _, _ = execute_preprocessing(
        raw_content=dirty_csv_bytes,
        config=config,
        job_id="job-drop-01",
    )

    assert report.status == "completed"
    processed_df = pd.read_csv(io.StringIO(full_bytes.decode("utf-8")))
    assert len(processed_df) < 6
    assert not processed_df.isna().values.any()


def test_preprocessing_failure_invalid_target(sample_csv_bytes):
    config = PreprocessingConfig(
        dataset_id="test-invalid-target",
        target_column="non_existent_column_xyz",
    )

    with pytest.raises(ValueError, match="does not exist"):
        execute_preprocessing(
            raw_content=sample_csv_bytes,
            config=config,
            job_id="job-fail-01",
        )


def test_preprocessing_failure_all_features_dropped(sample_csv_bytes):
    config = PreprocessingConfig(
        dataset_id="test-all-dropped",
        target_column="label",
        drop_columns=[
            "flow_id", "timestamp", "src_ip", "dst_ip",
            "packet_length", "packet_rate", "byte_rate",
            "protocol", "is_constant"
        ],
    )

    with pytest.raises(ValueError, match="All feature columns were removed"):
        execute_preprocessing(
            raw_content=sample_csv_bytes,
            config=config,
            job_id="job-fail-02",
        )
