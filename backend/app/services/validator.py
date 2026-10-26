import io
import csv
import logging
from typing import Optional, List, Dict, Any, Tuple
import pandas as pd
import numpy as np

from app.schemas.validation import (
    ColumnDetail,
    ClassDistributionItem,
    ValidationReport,
)

logger = logging.getLogger(__name__)

# Heuristic keyword matchers for candidate label columns in IoT/network datasets
LABEL_KEYWORDS = [
    "label",
    "attack",
    "attack_cat",
    "attack_type",
    "class",
    "category",
    "sub_category",
    "target",
    "malicious",
    "threat",
    "is_botnet",
    "verdict",
]

BENIGN_KEYWORDS = [
    "benign",
    "normal",
    "clean",
    "0",
    "false",
    "none",
    "regular",
    "safe",
]


def detect_duplicate_headers(raw_header_line: str, delimiter: str = ",") -> List[str]:
    """Inspects the raw CSV header line to identify duplicate column names."""
    reader = csv.reader(io.StringIO(raw_header_line), delimiter=delimiter)
    try:
        headers = next(reader)
    except StopIteration:
        return []
    
    seen = set()
    duplicates = []
    for h in headers:
        clean_name = h.strip()
        if clean_name in seen:
            if clean_name not in duplicates:
                duplicates.append(clean_name)
        seen.add(clean_name)
    return duplicates


def suggest_label_columns(df: pd.DataFrame) -> List[str]:
    """
    Heuristically identifies candidate target/label columns.
    Prioritizes columns matching cybersecurity/IoT label keywords,
    then low-cardinality categorical/discrete columns at the tail of the dataset.
    """
    candidates = []
    lower_cols = {col: col.lower().strip() for col in df.columns}

    # 1. Direct or partial keyword match in column name
    for col, lower in lower_cols.items():
        for kw in LABEL_KEYWORDS:
            if kw in lower:
                if col not in candidates:
                    candidates.append(col)
                break

    # 2. Check remaining columns with low cardinality (2 to 30 unique classes)
    for col in df.columns:
        if col not in candidates:
            unique_cnt = df[col].nunique(dropna=True)
            if 2 <= unique_cnt <= 30 and (df[col].dtype == "object" or df[col].dtype == "category" or df[col].dtype == "int64"):
                candidates.append(col)

    return candidates


def compute_class_distribution(series: pd.Series) -> List[ClassDistributionItem]:
    """Computes distribution of classes for a prospective or confirmed label column."""
    total = len(series)
    if total == 0:
        return []

    val_counts = series.fillna("Unknown").value_counts()
    items = []
    for class_val, count in val_counts.items():
        class_str = str(class_val)
        lower_val = class_str.lower().strip()
        is_malicious = not any(b in lower_val for b in BENIGN_KEYWORDS)
        items.append(
            ClassDistributionItem(
                class_name=class_str,
                count=int(count),
                percentage=round((float(count) / total) * 100, 2),
                is_malicious=is_malicious,
            )
        )
    return items


def validate_csv_content(
    content: bytes,
    file_name: str,
    selected_label_column: Optional[str] = None,
    max_preview_rows: int = 10,
) -> ValidationReport:
    """
    Executes deep structural validation of CSV dataset bytes.
    Does NOT modify the source data.
    """
    file_size = len(content)

    # 1. Empty file detection
    if file_size == 0:
        return ValidationReport(
            file_name=file_name,
            file_size_bytes=0,
            is_valid=False,
            error_message="The uploaded file is completely empty (0 bytes).",
        )

    # 2. Decode text bytes safely
    text = ""
    for encoding in ["utf-8", "utf-8-sig", "latin-1"]:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if not text:
        return ValidationReport(
            file_name=file_name,
            file_size_bytes=file_size,
            is_valid=False,
            error_message="Unable to decode file content. Expected valid UTF-8 or Latin-1 encoded CSV text.",
        )

    first_line = text.split("\n", 1)[0].strip()
    if not first_line:
        return ValidationReport(
            file_name=file_name,
            file_size_bytes=file_size,
            is_valid=False,
            error_message="CSV contains no header line or record data.",
        )

    # 3. Delimiter detection
    delimiter = ","
    try:
        sample = text[:4096]
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample, delimiters=",\t;|")
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ","

    # 4. Check duplicate headers in raw text
    duplicate_headers = detect_duplicate_headers(first_line, delimiter=delimiter)

    # 5. Parse using pandas
    try:
        df = pd.read_csv(
            io.StringIO(text),
            sep=delimiter,
            engine="python",  # handles irregular lines more gracefully
            on_bad_lines="warn",
        )
    except Exception as exc:
        logger.error(f"Failed to parse CSV '{file_name}': {exc}")
        return ValidationReport(
            file_name=file_name,
            file_size_bytes=file_size,
            is_valid=False,
            error_message=f"Malformed CSV: {str(exc)}",
        )

    if df.empty:
        return ValidationReport(
            file_name=file_name,
            file_size_bytes=file_size,
            is_valid=False,
            error_message="CSV parsed into an empty table (no records found).",
        )

    total_rows, total_columns = df.shape
    duplicate_rows = int(df.duplicated().sum())

    # 6. Analyze columns
    column_details: List[ColumnDetail] = []
    constant_columns: List[str] = []
    numerical_columns: List[str] = []
    categorical_columns: List[str] = []
    total_missing_values = int(df.isna().sum().sum())
    total_cells = max(total_rows * total_columns, 1)
    missing_pct = round((total_missing_values / total_cells) * 100, 2)
    warnings: List[str] = []

    if duplicate_headers:
        warnings.append(f"Duplicate header names detected in raw file: {', '.join(duplicate_headers)}.")

    if duplicate_rows > 0:
        warnings.append(
            f"Dataset contains {duplicate_rows} duplicate rows ({round((duplicate_rows / total_rows) * 100, 2)}%)."
        )

    for col in df.columns:
        col_series = df[col]
        missing_cnt = int(col_series.isna().sum())
        col_missing_pct = round((missing_cnt / total_rows) * 100, 2)
        unique_cnt = int(col_series.nunique(dropna=True))

        is_const = (unique_cnt <= 1)
        if is_const:
            constant_columns.append(col)

        # Classify high-level data type
        pandas_dtype = str(col_series.dtype)
        if pd.api.types.is_numeric_dtype(col_series):
            data_type = "numerical"
            numerical_columns.append(col)
        elif pd.api.types.is_bool_dtype(col_series):
            data_type = "boolean"
            categorical_columns.append(col)
        elif pd.api.types.is_datetime64_any_dtype(col_series):
            data_type = "datetime"
        else:
            data_type = "categorical"
            categorical_columns.append(col)

        # Sample values (up to 3 distinct non-null values)
        non_null_samples = col_series.dropna().unique()[:3].tolist()
        sample_values = [str(v) if not isinstance(v, (int, float, bool)) else v for v in non_null_samples]

        column_details.append(
            ColumnDetail(
                name=str(col),
                data_type=data_type,
                inferred_pandas_type=pandas_dtype,
                missing_count=missing_cnt,
                missing_percentage=col_missing_pct,
                unique_count=unique_cnt,
                is_constant=is_const,
                sample_values=sample_values,
            )
        )

    if constant_columns:
        warnings.append(f"{len(constant_columns)} column(s) have zero variance (constant value): {', '.join(constant_columns[:5])}.")

    # 7. Candidate label heuristics
    suggested_labels = suggest_label_columns(df)
    detected_label = selected_label_column if selected_label_column in df.columns else (suggested_labels[0] if suggested_labels else None)

    # 8. Class distribution analysis
    class_dist = None
    if detected_label and detected_label in df.columns:
        class_dist = compute_class_distribution(df[detected_label])

    # 9. JSON preview rows
    preview_df = df.head(max_preview_rows).replace({np.nan: None, np.inf: None, -np.inf: None})
    preview_rows = preview_df.to_dict(orient="records")

    return ValidationReport(
        file_name=file_name,
        file_size_bytes=file_size,
        is_valid=True,
        total_rows=total_rows,
        total_columns=total_columns,
        columns=column_details,
        duplicate_column_names=duplicate_headers,
        duplicate_row_count=duplicate_rows,
        constant_columns=constant_columns,
        missing_values_total=total_missing_values,
        missing_values_percentage=missing_pct,
        numerical_columns=numerical_columns,
        categorical_columns=categorical_columns,
        suggested_label_columns=suggested_labels,
        detected_label_column=detected_label,
        class_distribution=class_dist,
        warnings=warnings,
        preview_rows=preview_rows,
    )
