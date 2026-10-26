from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class PreprocessingConfig(BaseModel):
    dataset_id: str
    target_column: Optional[str] = None
    selected_features: Optional[List[str]] = None
    drop_columns: Optional[List[str]] = Field(default_factory=list)
    drop_duplicates: bool = True
    imputation_strategy: str = "median"  # "mean", "median", "mode", "constant", "drop_rows", "none"
    imputation_constant: Optional[float] = 0.0
    scaling_method: str = "robust"  # "robust", "standard", "minmax", "none"
    categorical_encoding: str = "onehot"  # "onehot", "ordinal", "none"
    remove_zero_variance: bool = True
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    random_seed: int = 42
    stratify: bool = True


class PreprocessingReport(BaseModel):
    job_id: str
    dataset_id: str
    status: str  # "completed", "failed", "running"
    original_rows: int
    original_columns: int
    processed_rows: int
    processed_columns: int
    feature_names: List[str] = Field(default_factory=list)
    target_name: Optional[str] = None
    target_classes: Optional[List[str]] = None
    train_rows: int = 0
    val_rows: int = 0
    test_rows: int = 0
    operations_performed: List[str] = Field(default_factory=list)
    columns_removed: Dict[str, str] = Field(default_factory=dict)
    remaining_missing_values: int = 0
    warnings: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    processed_file_path: Optional[str] = None
    execution_time_seconds: float = 0.0
    created_at: str


class JobStatusResponse(BaseModel):
    job_id: str
    dataset_id: str
    status: str  # "pending", "running", "completed", "failed"
    created_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
