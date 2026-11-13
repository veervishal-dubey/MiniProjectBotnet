import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

import app.main
from app.services.ml_service import ml_service
from app.services.fl_service import fl_service

print("App main loaded:", app.main.app.title)
print("ML loaded:", ml_service.is_loaded)
print("FL status:", fl_service.get_status()["status"])

