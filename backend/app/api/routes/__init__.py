from app.api.routes.health import router as health_router
from app.api.routes.root import router as root_router
from app.api.routes.datasets import router as datasets_router
from app.api.routes.preprocessing import router as preprocessing_router
from app.api.routes.models import router as models_router
from app.api.routes.federated import router as federated_router
from app.api.routes.evaluation import router as evaluation_router

__all__ = [
    "health_router",
    "root_router",
    "datasets_router",
    "preprocessing_router",
    "models_router",
    "federated_router",
    "evaluation_router",
]
