# SentinelFL — Federated IoT Threat Intelligence

A research-grade cybersecurity platform engineered to detect malicious IoT network flow traffic using machine learning and privacy-preserving federated learning (Flower / FedAvg).

---

## 1. Project Overview

**SentinelFL** is an end-to-end IoT threat intelligence platform designed to address botnet attacks and DDoS campaigns against edge devices without centralizing raw network telemetry. The system ingests network flow captures, validates and preprocesses data without data leakage, executes centralized ML and distributed Federated Learning (FedAvg), classifies batch network flows, and computes both local ground-truth evaluation and comparative benchmark analytics against 175,669 IoT flows.

### Core Capabilities
1. **Dataset Ingestion & Storage**: Private Supabase storage with workspace isolation (RLS).
2. **Empirical CSV Validation**: Automatic schema verification, missing values, duplicates, and infinite value detection.
3. **Leak-Free Preprocessing**: Train-only parameter fitting (scalers/encoders), reproducible seed configuration, and artifact persistence.
4. **PyTorch ML Model Integration**: Canonical 39 → 128 → 64 → 32 → 7 multi-layer perceptron (FLMLP) detecting 7 distinct traffic classes.
5. **Flower / FedAvg Federated Learning**: Multi-client data partitioning (IID and Dirichlet Non-IID $\alpha \in \{0.5, 0.1\}$), sample-weighted parameter aggregation, and checkpoint serialization.
6. **Full Dataset Batch Inference**: Memory-safe chunked batch inference processing complete datasets (not limited to previews), with pagination, search, sorting, class filtering, and CSV export.
7. **Single-Flow Simulator**: Interactive socket & 39-feature vector simulator for real-time risk triage.
8. **Dual-Scope Evaluation**: Distinct separation of current active dataset evaluation (7×7 confusion matrix, macro metrics, FPR, FNR) and historical benchmark experiments (175,669 flows across IID and non-IID scenarios).
9. **Granular Service Health Checks**: Readiness probing across backend, database, storage, model artifacts, inference service, and FL worker.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SentinelFL React Frontend                         │
│   (Vite + TypeScript + TailwindCSS / Lucide Icons / Active Dataset Context) │
└──────────────┬──────────────────────────────┬───────────────────────────────┘
               │ Supabase JWT                 │ Supabase Auth & Storage API
               ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────────┐
│       FastAPI Backend        │   │          Supabase Cloud Platform         │
│  - /health (Detailed Probes) │   │  - GoTrue Auth (JWT verification)        │
│  - /api/v1/datasets          │   │  - PostgreSQL with Row-Level Security    │
│  - /api/v1/preprocessing     │◄──┤  - Private Storage:                      │
│  - /api/v1/models            │   │    'sentinelfl-datasets'                 │
│  - /api/v1/federated         │   └──────────────────────────────────────────┘
│  - /api/v1/evaluation        │
└──────────────┬───────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ML & Federated Learning Engines                        │
│  - PyTorch Checkpoint: ml/artifacts/mlp_model.pth (FLMLP 39→128→64→32→7)    │
│  - Preprocessing Artifacts: scaler.joblib, label_encoder.joblib             │
│  - Federated Core: federated/fl_core.py (Flower NumPyClient & FedAvg)       │
│  - Partitions: federated/splits/ (IID, Dirichlet alpha=0.5, alpha=0.1)      │
│  - FL Checkpoint: ml/artifacts/global_model_final.pt                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Lucide React, TailwindCSS, Vitest.
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pydantic v2.
- **Data & Preprocessing**: Pandas, NumPy, Scikit-learn, Joblib.
- **Machine Learning**: PyTorch (CPU / CUDA compatible), Flower (`flwr` framework).
- **Security & Database**: Supabase Auth (JWT), Supabase Storage, PostgreSQL with RLS.
- **Containerization & Deployment**: Docker, Docker Compose, Vercel SPA routing.

---

## 4. Machine Learning & Federated Learning Specifications

### 4.1. Feature Contract (39 Features)
The canonical PyTorch MLP expects 39 network flow features in exact order:
```
Protocol Type, Duration, Rate, Srate, Drate, Fin Flag Number, Syn Flag Number,
Rst Flag Number, Psh Flag Number, Ack Flag Number, Ece Flag Number, Cwr Flag Number,
Ack Count, Syn Count, Fin Count, Urg Count, Rst Count, HTTP, HTTPS, DNS, Telnet,
SMTP, SSH, IRC, TCP, UDP, DHCP, ARP, ICMP, IPv, LLC, Tot sum, Min, Max, AVG,
Std, Tot size, IAT, Magnitude
```

### 4.2. Target Classes (7 Classes)
Categorical encoding maps labels to 7 canonical threat categories:
1. `Benign`
2. `DDoS-ACK`
3. `DDoS-SYN`
4. `DDoS-TCP`
5. `Mirai-greeth_flood`
6. `Mirai-greip_flood`
7. `Mirai-udpplain`

### 4.3. Model Checkpoints & Artifact Directory
Located in `ml/artifacts/`:
- `mlp_model.pth`: Pretrained PyTorch FLMLP state dictionary.
- `scaler.joblib`: Fitted Scikit-learn scaler (RobustScaler / StandardScaler).
- `label_encoder.joblib`: Fitted LabelEncoder for the 7 canonical classes.
- `feature_columns.joblib`: Pickled list of the 39 feature names in canonical order.
- `global_model_final.pt`: Persisted model state resulting from Federated Averaging rounds.

---

## 5. Getting Started & Installation

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Supabase project (URL and keys)

### 5.1. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start FastAPI server
python -m app.main
# Server runs on http://localhost:8000
```

### 5.2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Set VITE_API_BASE_URL=http://localhost:8000

# Start Vite development server
npm run dev
# Accessible on http://localhost:5173
```

---

## 6. Environment Variables

### Backend (`backend/.env`)
```ini
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
STORAGE_BUCKET_NAME=sentinelfl-datasets
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8000
```

### Frontend (`frontend/.env.local`)
```ini
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 7. Testing Suite

SentinelFL includes comprehensive unit and integration tests across both backend and frontend.

### 7.1. Running Backend Tests (pytest)
```bash
cd backend
python -m pytest -v
```
**Results**: 49 passed tests covering:
- CSV validation, malformed input handling, missing values, duplicates, infinite values.
- Leak-free preprocessing, train/val/test splits, scaler preservation.
- PyTorch model checkpoint loading, single-flow inference, chunked batch classification.
- Evaluation metrics (7×7 confusion matrix, macro precision/recall/F1, FPR, FNR, ground-truth isolation).
- Federated data partitioning (IID, Dirichlet non-IID), FedAvg aggregation.
- Supabase JWT authentication, workspace isolation, and security scopes.
- Health readiness endpoints (`/health` readiness breakdown).

### 7.2. Running Frontend Tests (Vitest)
```bash
cd frontend
npm test -- --run
```
**Results**: 39 passed unit tests across UI components, active dataset context, batch detection controls, and evaluation tabs.

### 7.3. Production Build Validation
```bash
cd frontend
npm run build
```
Type checks and bundles the client application with 0 TypeScript errors.

---

## 8. Deployment

### 8.1. Docker Compose (Full Stack)
```bash
# From repository root:
docker-compose up -d --build
```
This builds and starts:
- `backend`: Container running Python 3.11 with PyTorch on port 8000.
- `frontend`: Container building React Vite and serving static assets on port 80.

### 8.2. Frontend Vercel Deployment
The frontend is configured with `vercel.json` for SPA routing:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 9. Current Scope & Known Boundaries

1. **Batch Flow vs. Live Network Sniffing**: SentinelFL performs memory-safe chunked batch classification on ingested network flow CSVs. Live continuous packet capture (e.g., direct Zeek/libpcap daemon tapping physical interfaces) requires local interface privileges and is not simulated as fake live streaming.
2. **Tabular Classical Baselines**: Dedicated Random Forest and Logistic Regression scripts are maintained as independent reference benchmarks in `experiments/`, while the primary production inference engine is the verified 7-class PyTorch FLMLP.
