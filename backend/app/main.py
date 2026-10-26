import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.routes import (
    health_router,
    root_router,
    datasets_router,
    preprocessing_router,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sentinelfl")

# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "SentinelFL — Federated IoT Threat Intelligence API.\n\n"
        "Provides dataset ingestion, structural CSV validation, and "
        "leak-free preprocessing for IoT botnet detection."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Configure CORS using environment-configured origins (never wildcards in production)
logger.info(f"Configuring CORS with origins: {settings.cors_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred.",
            "error_type": exc.__class__.__name__,
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=(settings.ENVIRONMENT == "development"),
    )
