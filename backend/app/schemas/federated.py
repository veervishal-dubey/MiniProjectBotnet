from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class FLStatusResponse(BaseModel):
    status: str
    active_job_id: Optional[str] = None
    available_scenarios: List[str]
    clients_count: int
    total_completed_runs: int
    algorithm: str = "FedAvg (Sample-Weighted)"
    model_architecture: str = "FLMLP (39 -> 128 -> 64 -> 32 -> 7)"


class FLTrainRequest(BaseModel):
    scenario: str = Field("A_iid", description="Partition scenario (A_iid, A_dir0.5, A_dir0.1, B_filehold_iid)")
    rounds: int = Field(1, ge=1, le=50, description="Number of communication rounds")
    local_epochs: int = Field(1, ge=1, le=20, description="Local training epochs per client")
    batch_size: int = Field(512, ge=16, le=2048, description="Batch size for client SGD/Adam")
    lr: float = Field(0.001, gt=0, le=0.1, description="Client learning rate")
    seed: int = Field(42, description="Random seed")
    num_clients: int = Field(10, ge=1, le=10, description="Number of participating edge clients")
    max_samples_per_client: Optional[int] = Field(None, description="Optional cap on samples per client for fast rounds")


class FLJobStatusResponse(BaseModel):
    job_id: str
    status: str  # 'queued', 'running', 'completed', 'failed'
    scenario: str
    current_round: int
    total_rounds: int
    history: List[Dict[str, Any]] = []
    latest_metrics: Optional[Dict[str, Any]] = None
    started_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None


class FLRunDetailResponse(BaseModel):
    run_id: str
    scenario: str
    rounds_total: int
    current_round: int
    status: str
    config: Dict[str, Any]
    round_history: List[Dict[str, Any]]
    clients: List[Dict[str, Any]]
    metrics: Dict[str, Any]
