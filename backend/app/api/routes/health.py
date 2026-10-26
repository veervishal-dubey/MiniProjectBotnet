import sys
import time
from typing import Dict, Any
from fastapi import APIRouter
from app.core.config import settings
from app.database.supabase import get_admin_client

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=Dict[str, Any])
async def health_check():
    """
    Health check endpoint reporting actual backend application and dependency status.
    """
    database_status = "unconfigured"
    database_latency_ms = None

    if settings.is_supabase_configured():
        try:
            start_ping = time.time()
            client = get_admin_client()
            # Perform a lightweight ping to the database
            client.from_("workspaces").select("id").limit(1).execute()
            database_latency_ms = round((time.time() - start_ping) * 1000, 2)
            database_status = "connected"
        except Exception as exc:
            database_status = f"degraded: {str(exc)}"

    return {
        "status": "healthy" if database_status in ["connected", "unconfigured"] else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "python_version": sys.version.split()[0],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "database": {
            "status": database_status,
            "latency_ms": database_latency_ms,
            "supabase_url": settings.SUPABASE_URL or "not_set",
        },
        "storage": {
            "bucket": settings.STORAGE_BUCKET_NAME,
            "local_cache_available": settings.PROCESSED_CACHE_DIR.exists(),
        },
    }
