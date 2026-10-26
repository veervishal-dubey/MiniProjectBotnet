import time
from typing import Dict, Any
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(tags=["Discovery"])


@router.get("/api/v1", response_model=Dict[str, Any])
async def api_v1_discovery():
    """
    API v1 Discovery and Capability Index.
    """
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "api_version": "v1",
        "description": "SentinelFL Data Ingestion, Validation, and Preprocessing Backend for Federated IoT Threat Intelligence.",
        "documentation_url": "/docs",
        "openapi_url": "/openapi.json",
        "endpoints": {
            "health": "/health",
            "discovery": "/api/v1",
            "validate_dataset": "POST /api/v1/datasets/{dataset_id}/validate",
            "validate_raw_csv": "POST /api/v1/datasets/validate-raw",
            "preview_dataset": "GET /api/v1/datasets/{dataset_id}/preview",
            "create_preprocessing_job": "POST /api/v1/preprocessing/jobs",
            "get_preprocessing_job": "GET /api/v1/preprocessing/jobs/{job_id}",
            "download_processed_dataset": "GET /api/v1/preprocessing/jobs/{job_id}/download",
            "ml_contract": "GET /api/v1/preprocessing/contract",
        },
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
