from app.api.routes.health import router as health_router
from app.api.routes.root import router as root_router
from app.api.routes.datasets import router as datasets_router
from app.api.routes.preprocessing import router as preprocessing_router

__all__ = [
    "health_router",
    "root_router",
    "datasets_router",
    "preprocessing_router",
]
