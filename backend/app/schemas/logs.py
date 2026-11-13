from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field


LogSeverity = Literal["INFO", "WARN", "ERROR", "DEBUG"]
LogCategory = Literal["SYSTEM", "DATASET", "PREPROCESSING", "TRAINING", "FEDERATED", "DETECTION"]


class LogEntrySchema(BaseModel):
    id: str = Field(..., description="Unique UUID or event identifier")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    severity: LogSeverity = Field(..., description="Log severity level")
    category: LogCategory = Field(..., description="System subsystem category")
    message: str = Field(..., description="Human-readable log description")
    component: str = Field(..., description="Component or module originating the event")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Structured event metadata")
    experimentId: Optional[str] = Field(default=None, description="Associated experiment or run ID")
    isSyntheticDemo: bool = Field(default=False, description="Whether event is synthetic or genuine")


class CreateLogRequest(BaseModel):
    severity: LogSeverity = "INFO"
    category: LogCategory = "SYSTEM"
    message: str
    component: str = "WebClient"
    details: Optional[Dict[str, Any]] = None
    experimentId: Optional[str] = None


class LogListResponse(BaseModel):
    logs: List[LogEntrySchema]
    total: int
    limit: int
    offset: int
    categories_count: Dict[str, int]
    severities_count: Dict[str, int]

