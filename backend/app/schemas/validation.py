from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ColumnDetail(BaseModel):
    name: str
    data_type: str  # "numerical", "categorical", "datetime", "boolean", "text"
    inferred_pandas_type: str
    missing_count: int
    missing_percentage: float
    unique_count: int
    is_constant: bool
    sample_values: List[Any] = Field(default_factory=list)


class ClassDistributionItem(BaseModel):
    class_name: str
    count: int
    percentage: float
    is_malicious: Optional[bool] = None


class ValidationReport(BaseModel):
    file_name: str
    file_size_bytes: int
    is_valid: bool
    error_message: Optional[str] = None
    total_rows: int = 0
    total_columns: int = 0
    columns: List[ColumnDetail] = Field(default_factory=list)
    duplicate_column_names: List[str] = Field(default_factory=list)
    duplicate_row_count: int = 0
    constant_columns: List[str] = Field(default_factory=list)
    missing_values_total: int = 0
    missing_values_percentage: float = 0.0
    numerical_columns: List[str] = Field(default_factory=list)
    categorical_columns: List[str] = Field(default_factory=list)
    suggested_label_columns: List[str] = Field(default_factory=list)
    detected_label_column: Optional[str] = None
    class_distribution: Optional[List[ClassDistributionItem]] = None
    warnings: List[str] = Field(default_factory=list)
    preview_rows: List[Dict[str, Any]] = Field(default_factory=list)
