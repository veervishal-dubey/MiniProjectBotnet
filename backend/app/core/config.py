import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Locate .env file in backend directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
else:
    load_dotenv()


class Settings:
    PROJECT_NAME: str = "SentinelFL Backend"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    STORAGE_BUCKET_NAME: str = os.getenv("STORAGE_BUCKET_NAME", "sentinelfl-datasets")

    # CORS Origins (comma separated)
    FRONTEND_ORIGINS_RAW: str = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
    )

    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # File size limits (Default: 100MB)
    MAX_FILE_SIZE_BYTES: int = int(os.getenv("MAX_FILE_SIZE_BYTES", str(100 * 1024 * 1024)))

    # Local storage cache for processed outputs
    PROCESSED_CACHE_DIR: Path = BASE_DIR / "storage" / "processed"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS_RAW.split(",") if origin.strip()]

    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and (self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_ANON_KEY))


settings = Settings()
# Ensure local processed cache dir exists
settings.PROCESSED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
