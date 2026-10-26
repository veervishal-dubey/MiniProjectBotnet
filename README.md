# SentinelFL — Federated IoT Threat Intelligence

A privacy-preserving, enterprise-grade Threat Intelligence platform engineered to ingest, validate, and preprocess IoT network flow traffic for decentralized Botnet detection.

---

## Division of Responsibilities

- **This Implementation (Our Responsibility)**:
  - React + TypeScript + Vite Frontend
  - Supabase Authentication & Workspace Management (Row Level Security)
  - Private Supabase Storage Dataset Management
  - Python FastAPI Backend Microservice
  - Empirical Structural CSV Validation Engine
  - Leak-Free Preprocessing Pipeline (Pandas & Scikit-Learn)
  - Preprocessing Job Management & Processed Artifact Storage
  - Formal Integration Contract for Centralized ML & Federated Learning
- **Teammate's Responsibility (Independent)**:
  - Centralized ML Model Architecture (e.g. Random Forest, Deep Neural Networks)
  - Federated Learning Orchestration (e.g. Federated Averaging, Flower / PySyft)
  - Edge Client Training & Local Loss Convergence
  - Model Evaluation & Detection Metrics

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              SentinelFL React Frontend (Vite)              │
│       Researchers manage workspaces, datasets, & jobs       │
└──────────────┬──────────────────────────────┬───────────────┘
               │ (Supabase JWT)               │ (Supabase Auth & Storage API)
               ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│        FastAPI Backend       │   │     Supabase Cloud       │
│  - GET /health               │   │  - Auth (JWT Tokens)     │
│  - GET /api/v1               │   │  - PostgreSQL RLS Tables │
│  - CSV Validator Service     │◄──┤  - Private Storage:      │
│  - Preprocessing Pipeline    │   │    'sentinelfl-datasets' │
│  - Job Manager & Exporter    │   └──────────────────────────┘
└──────────────┬───────────────┘
               │
               │ Standard RFC 4180 CSV & NumPy Matrix Handoff
               ▼
┌─────────────────────────────────────────────────────────────┐
│          Teammate's ML / Federated Learning Engine          │
│    Centralized Model Training & Federated Client Aggregation│
└─────────────────────────────────────────────────────────────┘
```

---

## Quickstart Guide

### 1. Backend Setup (FastAPI)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start FastAPI server
python app/main.py
# Server runs on http://localhost:8000
```

### 2. Frontend Setup (React + Vite)

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
# Frontend runs on http://localhost:5173 (or 5174)
```

---

## Environment Variables

### Backend (`backend/.env`)
```ini
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_confidential_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
STORAGE_BUCKET_NAME=sentinelfl-datasets

# CORS Configuration
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174

# Server Configuration
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8000
```

### Frontend (`frontend/.env.local`)
```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
VITE_API_BASE_URL=http://localhost:8000
```

---

## Dataset Validation & Preprocessing Workflow

1. **Upload**: A researcher uploads an IoT network traffic CSV (e.g. CICIoT2023 or BoT-IoT) via the frontend. The file is securely stored in the private Supabase Storage bucket `sentinelfl-datasets`, and metadata is registered in `public.datasets`.
2. **Structural Validation**:
   - The researcher clicks **"Validate with FastAPI"**.
   - The backend retrieves the dataset stream after verifying workspace permissions.
   - The validation engine checks:
     - Empty file & malformed format detection.
     - Row and column counts.
     - Duplicate column names in headers.
     - Duplicate rows.
     - Missing values per column (count and percentage).
     - Numerical vs categorical column classification.
     - Constant zero-variance columns.
     - Heuristic label candidate suggestions (`label`, `attack`, `category`, `class`).
     - Real class distribution breakdown.
3. **Configurable Preprocessing**:
   - The researcher selects the confirmed target column and features to retain.
   - Flow identifiers (IP addresses, timestamps, ports) can be pruned to prevent spatial overfitting.
   - Missing values are imputed (`median`, `mean`, `mode`, or row removal).
   - Infinite values ($+\infty, -\infty$) are sanitized safely.
   - Categorical columns are encoded (`onehot` or `ordinal`).
   - Numerical columns are scaled (`RobustScaler`, `StandardScaler`, or `MinMaxScaler`).
4. **Data Leakage Prevention**:
   - When train/validation/test partitions are requested (e.g. $70\% / 15\% / 15\%$), splitting occurs *before* transformations.
   - Scalers and encoders are fitted **exclusively on the training partition ($X_{\text{train}}$)**.
   - The target label is preserved in ground truth and is never encoded as an input feature.
5. **Artifact Download**:
   - Processed artifacts are stored in `storage/processed/{dataset_id}/` and private Supabase Storage.
   - The researcher or ML pipeline can download:
     - Full Processed CSV: `GET /api/v1/preprocessing/jobs/{job_id}/download?split=full`
     - Training Partition: `GET /api/v1/preprocessing/jobs/{job_id}/download?split=train`
     - Testing Partition: `GET /api/v1/preprocessing/jobs/{job_id}/download?split=test`

---

## Future ML / Federated Learning Integration

For full technical specifications on how the teammate should ingest processed data, please refer to:
- [`docs/ml_fl_integration_contract.md`](docs/ml_fl_integration_contract.md)
- `GET /api/v1/preprocessing/contract`

---

## Testing

Run the automated test suite from the `backend/` directory:

```bash
cd backend
py -m pytest tests -v
```

All 20 test suites pass with 100% success rate:
- Health and API discovery endpoints
- Valid, empty, and malformed CSV detection
- Missing values and duplicate rows inspection
- Numerical and categorical classification
- Target heuristics and class distributions
- Leak-free preprocessing and infinite value handling
- Partitioning integrity and target preservation
- Supabase token authentication and workspace authorization checks
