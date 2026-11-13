import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.services.ml_service import ml_service
from app.services.audit_service import audit_service
from app.adapters.registry import adapter_registry
from app.api.routes import (
    health_router,
    root_router,
    datasets_router,
    preprocessing_router,
    models_router,
    federated_router,
    evaluation_router,
    logs_router,
    system_router,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sentinelfl")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager to ensure model loading, storage readiness, and audit logging on startup."""
    logger.info("Initializing SentinelFL FastAPI Application Server...")
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    settings.PROCESSED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    settings.FL_RUNS_DIR.mkdir(parents=True, exist_ok=True)

    # Record startup event in durable audit ledger
    audit_service.record_event(
        severity="INFO",
        category="SYSTEM",
        message="SentinelFL FastAPI Backend service started successfully.",
        component="SystemEngine",
        details={
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "model_loaded": ml_service.is_loaded,
            "adapters": [a["dataset_type"] for a in adapter_registry.list_adapters()],
        },
    )

    if ml_service.is_loaded:
        logger.info(
            f"PyTorch Model '{ml_service.model_version}' loaded: {len(ml_service.feature_columns)} features, {len(ml_service.classes)} classes."
        )
    else:
        logger.warning(f"ML Model did not load on startup: {ml_service.load_error}")

    yield

    logger.info("SentinelFL application shutdown complete.")
    audit_service.record_event(
        severity="INFO",
        category="SYSTEM",
        message="SentinelFL FastAPI Backend service shutdown complete.",
        component="SystemEngine",
    )


# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "SentinelFL — Federated IoT Threat Intelligence API.\n\n"
        "Provides dataset ingestion, structural CSV validation, "
        "trained PyTorch MLP threat detection, and collaborative FedAvg orchestration."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS using environment-configured origins and local network dev regex
logger.info(f"Configuring CORS with origins: {settings.cors_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type"],
)

# Register API Routers
app.include_router(health_router)
app.include_router(root_router)
app.include_router(datasets_router)
app.include_router(preprocessing_router)
app.include_router(models_router)
app.include_router(federated_router)
app.include_router(evaluation_router)
app.include_router(logs_router)
app.include_router(system_router)


@app.get("/", tags=["Root"])
async def root_redirect():
    """Root redirect and system greeting."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "documentation": "/docs",
        "health": "/health",
        "api_v1": "/api/v1",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global catch-all exception handler to ensure clean JSON responses."""
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    audit_service.record_event(
        severity="ERROR",
        category="SYSTEM",
        message=f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}",
        component="HttpHandler",
        details={"path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "type": type(exc).__name__},
    )
