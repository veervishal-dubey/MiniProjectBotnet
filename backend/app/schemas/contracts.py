"""
SentinelFL — ML & Federated Learning Integration Contracts

This module defines the explicit data representation contracts between
the data preprocessing pipeline (our responsibility) and the downstream
centralized ML model and Federated Learning implementations (teammate's responsibility).
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class DatasetMetadataContract(BaseModel):
    """
    Contract for how a prepared dataset is represented and delivered to ML/FL models.
    """
    dataset_id: str
    job_id: str
    feature_names: List[str] = Field(
        ...,
        description="Ordered list of numerical input features. Model inputs must follow this exact order."
    )
    target_column: Optional[str] = Field(
        None,
        description="Name of the ground truth label column."
    )
    target_classes: Optional[List[str]] = Field(
        None,
        description="Categorical class names corresponding to integer encodings (0, 1, 2...)."
    )
    n_features: int = Field(..., description="Number of feature columns (X.shape[1])")
    n_samples_total: int = Field(..., description="Total number of cleaned records")
    split_info: Dict[str, int] = Field(
        default_factory=dict,
        description="Row counts for 'train', 'val', and 'test' subsets."
    )


class SplitDatasetContract(BaseModel):
    """
    Contract specifying file pointers or memory structures for ML/FL training.
    """
    train_file: str = Field(..., description="Relative or absolute path to train split CSV")
    val_file: Optional[str] = Field(None, description="Path to validation split CSV")
    test_file: Optional[str] = Field(None, description="Path to test evaluation split CSV")
    features_contract: DatasetMetadataContract


class PreprocessingTransformationState(BaseModel):
    """
    State of fitted transformations so the ML/FL worker can reproduce identical
    feature scaling and encoding on unseen test/edge client IoT traffic without data leakage.
    """
    scaling_method: str  # "robust", "standard", "minmax", "none"
    scaling_params: Dict[str, Dict[str, float]] = Field(
        default_factory=dict,
        description="Per-feature parameters (e.g., median & IQR for RobustScaler, mean & std for StandardScaler)"
    )
    imputation_strategy: str
    imputation_values: Dict[str, float] = Field(
        default_factory=dict,
        description="Imputed fill value per numerical feature"
    )
    categorical_encodings: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Categories learned for one-hot or ordinal encoding"
    )
    dropped_columns: List[str] = Field(
        default_factory=list,
        description="Columns stripped due to constant variance or identifier leakage"
    )


class ModelInferenceInputContract(BaseModel):
    """
    Contract for raw or pre-scaled IoT network flows submitted to the ML/FL inference service.
    """
    records: List[Dict[str, Any]] = Field(
        ...,
        description="List of raw or preprocessed IoT flow dictionaries conforming to features_contract."
    )


class ModelInferenceOutputContract(BaseModel):
    """
    Expected output returned by the teammate's ML or FL detection model.
    """
    model_id: str
    predictions: List[str] = Field(..., description="Class name prediction for each input flow")
    probabilities: Optional[List[Dict[str, float]]] = Field(
        None,
        description="Confidence scores per class"
    )
    anomaly_detected: List[bool] = Field(
        ...,
        description="Boolean flag indicating whether the flow was flagged as a botnet/malicious pattern"
    )


class ModelRunMetricsContract(BaseModel):
    """
    Contract for evaluation metrics and metadata stored in public.model_runs.metrics JSONB column.
    Compatible with existing public.model_runs database schema.
    All metric fields are optional and nullable to avoid fabricating synthetic results
    when training is staged, running, or failed.
    """
    accuracy: Optional[float] = Field(None, ge=0.0, le=1.0, description="Test classification accuracy [0.0, 1.0]")
    precision: Optional[float] = Field(None, ge=0.0, le=1.0, description="Test macro precision [0.0, 1.0]")
    recall: Optional[float] = Field(None, ge=0.0, le=1.0, description="Test macro recall [0.0, 1.0]")
    f1_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Test macro F1-score [0.0, 1.0]")
    loss: Optional[float] = Field(None, ge=0.0, description="Evaluation loss (cross-entropy / log loss)")
    inference_latency_ms: Optional[float] = Field(None, ge=0.0, description="Single-sample batch average inference duration in milliseconds")
    training_time_sec: Optional[float] = Field(None, ge=0.0, description="Wall-clock training execution duration in seconds")

    # Optional architectural and provenance metadata
    algorithm: Optional[str] = Field(None, description="Algorithm name e.g. random_forest, logistic_regression, fedavg")
    version: Optional[str] = Field(None, description="Model version tag or run ID")
    hyperparameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Hyperparameters dictionary")
    artifact_path: Optional[str] = Field(None, description="Storage pointer to trained model artifact")
    features_used: Optional[List[str]] = Field(default_factory=list, description="List of feature names used for training")
    top_features: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Feature importance rankings")
    error: Optional[str] = Field(None, description="Error message if run status is failed")

