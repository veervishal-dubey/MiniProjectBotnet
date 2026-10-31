from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class ModelHealthResponse(BaseModel):
    status: str
    model_name: str
    model_version: str
    architecture: str
    device: str
    input_features_count: int
    num_classes: int
    classes: List[str]
    feature_columns: List[str]
    scaler_type: str
    checkpoint_loaded: bool
    error: Optional[str] = None


class SingleFlowPredictRequest(BaseModel):
    flow_id: Optional[str] = None
    src_ip: Optional[str] = "192.168.1.180"
    dst_ip: Optional[str] = "198.51.100.44"
    src_port: Optional[int] = 48200
    dst_port: Optional[int] = 23
    protocol: Optional[str] = "TCP"
    flow_duration_ms: Optional[float] = 120.4
    tot_fwd_pkts: Optional[int] = 480
    flags: Optional[str] = "SYN"
    features: Optional[Dict[str, float]] = None


class PredictionResult(BaseModel):
    id: str
    timestamp: str
    src_ip: Optional[str] = None
    src_port: Optional[int] = None
    dst_ip: Optional[str] = None
    dst_port: Optional[int] = None
    protocol: Optional[str] = None
    flow_duration_ms: Optional[float] = None
    tot_fwd_pkts: Optional[int] = None
    flags: Optional[str] = None
    predicted_class: str
    class_index: int
    actual_label: Optional[str] = None
    status: str = "classified"
    is_malicious: bool
    confidence: float
    risk_level: str
    probabilities: Dict[str, float]
    model_version: str
    inference_latency_ms: float


class BatchPredictionResponse(BaseModel):
    total_flows: int
    malicious_count: int
    benign_count: int
    failed_count: int = 0
    flows: List[PredictionResult]
    model_version: str
    dataset_id: Optional[str] = None
    dataset_name: Optional[str] = None
    per_class_counts: Dict[str, int] = Field(default_factory=dict)
    per_class_percentages: Dict[str, float] = Field(default_factory=dict)
    evaluation: Optional[Dict[str, Any]] = None

