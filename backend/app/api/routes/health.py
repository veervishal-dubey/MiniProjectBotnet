import sys
import time
import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter
from app.core.config import settings
from app.database.supabase import get_admin_client
from app.services.ml_service import ml_service
from app.services.fl_service import fl_service

logger = logging.getLogger("sentinelfl.health")
router = APIRouter(tags=["Health"])

# Cached database health check with TTL to prevent blocking event loop on every request
_db_cache: Dict[str, Any] = {
    "status": "unconfigured",
    "latency_ms": None,
    "last_checked": 0.0,
}
_DB_CACHE_TTL_SECONDS = 30.0


def _sync_ping_database() -> Dict[str, Any]:
    """Lightweight database ping executed in a worker thread."""
    if not settings.is_supabase_configured():
        return {"status": "unconfigured", "latency_ms": None}
    
    start_ping = time.time()
    try:
        client = get_admin_client()
        client.from_("workspaces").select("id").limit(1).execute()
        latency = round((time.time() - start_ping) * 1000, 2)
        return {"status": "connected", "latency_ms": latency}
    except Exception as exc:
        return {"status": f"degraded: {str(exc)}", "latency_ms": None}


async def _get_database_health() -> Dict[str, Any]:
    """Retrieves cached DB health or executes a thread-safe ping with a strict 1.5s timeout."""
    global _db_cache
    now = time.time()
    if now - _db_cache["last_checked"] < _DB_CACHE_TTL_SECONDS:
        return _db_cache

    try:
        # Strict 1.5s timeout so database latency spikes NEVER block /health
        result = await asyncio.wait_for(asyncio.to_thread(_sync_ping_database), timeout=1.5)
        _db_cache = {
            "status": result["status"],
            "latency_ms": result["latency_ms"],
            "last_checked": now,
        }
    except asyncio.TimeoutError:
        logger.warning("Supabase database health ping timed out (>1.5s). Operating with local storage.")
        _db_cache = {
            "status": "degraded: ping timeout (>1.5s)",
            "latency_ms": None,
            "last_checked": now,
        }
    except Exception as exc:
        logger.warning(f"Database health check failed: {exc}")
        _db_cache = {
            "status": f"degraded: {str(exc)}",
            "latency_ms": None,
            "last_checked": now,
        }

    return _db_cache


@router.get("/health", response_model=Dict[str, Any])
async def health_check():
    """
    Health check endpoint reporting actual backend application and dependency status,
    with separate readiness checks for database, storage, ML model artifacts,
    inference engine, and federated learning services.
    A database latency or outage does NOT block the endpoint or disable ML inference.
    """
    db_health = await _get_database_health()
    database_status = db_health["status"]
    database_latency_ms = db_health["latency_ms"]

    ml_health = ml_service.get_health()
    fl_status = fl_service.get_status()

    # Backend is healthy if inference engine and core services are active.
    # Database degradation is reported in component readiness without taking down ML inference.
    model_loaded = ml_health.get("checkpoint_loaded", False)
    is_inference_ready = ml_health.get("status") == "healthy"
    is_healthy = model_loaded and is_inference_ready

    return {
        "status": "healthy" if is_healthy else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "python_version": sys.version.split()[0],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "readiness": {
            "backend": True,
            "database": database_status == "connected",
            "storage": settings.PROCESSED_CACHE_DIR.exists(),
            "model_artifacts": model_loaded,
            "inference_service": is_inference_ready,
            "federated_execution_service": fl_status.get("status") in ["idle", "training"],
        },
        "database": {
            "status": database_status,
            "latency_ms": database_latency_ms,
            "supabase_url": settings.SUPABASE_URL or "not_set",
        },
        "storage": {
            "bucket": settings.STORAGE_BUCKET_NAME,
            "local_cache_available": settings.PROCESSED_CACHE_DIR.exists(),
        },
        "ml_inference": {
            "status": ml_health.get("status"),
            "model_name": ml_health.get("model_name"),
            "checkpoint_loaded": model_loaded,
            "device": ml_health.get("device"),
            "features_count": ml_health.get("input_features_count"),
            "num_classes": ml_health.get("num_classes"),
        },
        "federated_service": {
            "status": fl_status.get("status"),
            "available_scenarios": fl_status.get("available_scenarios"),
            "clients_count": fl_status.get("clients_count"),
            "total_completed_runs": fl_status.get("total_completed_runs"),
        },
    }


@router.get("/health/live", response_model=Dict[str, Any])
async def liveness_check():
    """Ultra-fast liveness probe (<1ms) confirming the FastAPI event loop is running."""
    return {
        "status": "live",
        "service": settings.PROJECT_NAME,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/health/ready", response_model=Dict[str, Any])
async def readiness_check():
    """Readiness probe confirming ML model artifacts and storage are ready for inference."""
    ml_health = ml_service.get_health()
    model_ready = ml_health.get("checkpoint_loaded", False)
    storage_ready = settings.PROCESSED_CACHE_DIR.exists()
    
    return {
        "status": "ready" if (model_ready and storage_ready) else "not_ready",
        "model_loaded": model_ready,
        "storage_ready": storage_ready,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
