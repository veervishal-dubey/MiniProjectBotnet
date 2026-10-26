# SentinelFL — FastAPI Backend

FastAPI backend microservice for SentinelFL (Federated IoT Threat Intelligence). Provides authenticated dataset ingestion, structural CSV validation, and a leak-free scikit-learn & pandas data preprocessing pipeline for IoT botnet detection.

---

## Architecture & Modular Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application initialization & CORS
│   ├── core/
│   │   ├── config.py        # Environment settings & configuration loader
│   │   └── security.py      # Supabase JWT verification & workspace auth
│   ├── database/
│   │   └── supabase.py      # Admin client & storage download/upload
│   ├── schemas/
│   │   ├── validation.py    # Pydantic models for validation reports
│   │   ├── preprocessing.py # Preprocessing configs & execution reports
│   │   └── contracts.py     # Downstream ML/FL data handoff contracts
│   ├── services/
│   │   ├── validator.py     # Structural CSV validator & heuristics
│   │   ├── preprocessor.py  # Leak-free pandas & scikit-learn pipeline
│   │   └── job_runner.py    # Database job sync & artifact persistence
│   └── api/
│       └── routes/
│           ├── health.py    # GET /health (application & DB health)
│           ├── root.py      # GET /api/v1 (service discovery)
│           ├── datasets.py  # Dataset validation & preview endpoints
│           └── preprocessing.py # Pipeline execution & artifact download
├── tests/                   # Pytest test suite (100% passing)
├── .env.example             # Template for backend secrets
├── requirements.txt         # Pinned Python package dependencies
└── README.md
```

---

## Setup Instructions

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Supabase project credentials

### 2. Virtual Environment Setup
```bash
# In MiniProjectBotnet/backend:
python -m venv venv

# Activate on Windows:
venv\Scripts\activate

# Activate on Linux/macOS:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your project's configuration (never commit `.env` to Git):
```ini
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_confidential_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
STORAGE_BUCKET_NAME=sentinelfl-datasets
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8000
```

---

## Running the Backend

```bash
# Using uvicorn:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Or directly with Python:
python app/main.py
```

- **Interactive API Documentation (Swagger)**: http://localhost:8000/docs
- **ReDoc Documentation**: http://localhost:8000/redoc
- **Application Health Check**: http://localhost:8000/health
- **API Discovery Index**: http://localhost:8000/api/v1

---

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Reports actual server status and database connectivity | No |
| `GET` | `/api/v1` | Discovery index listing all endpoints and capabilities | No |
| `POST` | `/api/v1/datasets/{id}/validate` | Validates a dataset retrieved from private Supabase Storage | Bearer Token |
| `POST` | `/api/v1/datasets/validate-raw` | Validates a raw CSV file stream directly | Bearer Token |
| `GET` | `/api/v1/datasets/{id}/preview` | Returns preview records and attribute schema | Bearer Token |
| `POST` | `/api/v1/preprocessing/jobs` | Dispatches leak-free scikit-learn preprocessing | Bearer Token |
| `GET` | `/api/v1/preprocessing/jobs/{id}` | Retrieves status and report for a preprocessing job | Bearer Token |
| `GET` | `/api/v1/preprocessing/jobs/{id}/download` | Downloads full, train, or test CSV artifact | Bearer Token |
| `GET` | `/api/v1/preprocessing/contract` | Returns the formal ML/FL handoff contract | No |

---

## Security Model

1. **Authentication**: All protected endpoints require a Supabase JWT in the `Authorization: Bearer <token>` header.
2. **Identity Verification**: Caller identity is verified directly with Supabase Auth (`auth.get_user(token)`). Client-supplied user IDs are never trusted.
3. **Workspace Authorization**: Access to any dataset requires verified workspace ownership (`workspaces.owner_id == user.id`) or membership (`workspace_members.user_id == user.id`).
4. **Service-Role Isolation**: The `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to the backend and never exposed to the frontend.
5. **Private Storage**: Dataset objects in `sentinelfl-datasets` remain strictly private. Downloads occur via authenticated signed backend requests.

---

## Running Tests

Execute the automated test suite with pytest:

```bash
# Run all tests:
pytest tests -v

# Run with coverage:
pytest --cov=app tests -v
```
