# SentinelFL Frontend

> **Federated IoT Threat Intelligence Platform**  
> Empirical research environment for collaborative IoT botnet intrusion detection using sample-weighted Federated Averaging (FedAvg).

---

## 1. Quick Start

### Prerequisites
- Node.js `v18+` or `v20+` (Tested on `v26.9.0`)
- npm `v9+` (Tested on `v11.19.1`)

### Run Development Server
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173/`** in your browser.

### Build Production Bundle
```bash
npm run build
```
Generates optimized static assets in `dist/`.

---

## 2. Implemented Routes & Navigation

| Route | Page | Purpose |
|---|---|---|
| `/` | **Landing Page** | Editorial research introduction, architecture scope, and workspace launcher. |
| `/login` | **Researcher Login** | Real Supabase email/password authentication (demo shortcuts and guest logins removed). |
| `/signup` | **Researcher Signup** | User registration with least-privileged role assignment and Supabase Auth credentials. |
| `/forgot-password` | **Forgot Key** | Supabase password recovery link dispatch flow. |
| `/reset-password` | **Reset Password** | Recovery session handler to establish a new password. |
| `/dashboard` | **Dashboard** | Protected workspace: telemetry, FedAvg convergence curves, threat distribution bar, and IoT silo status. |
| `/datasets` | **Datasets** | Protected workspace: CSV ingestion, in-browser parsing, schema inspection, and raw flow table preview. |
| `/preprocessing` | **Preprocessing** | Protected workspace: feature selection checklist, scaling, data splitting, and class imbalance handling. |
| `/models` | **Model Registry** | Protected workspace: centralized baselines (Random Forest, Logistic Regression) & FedAvg global model checkpoints. |
| `/federated-learning`| **Federated Learning** | Protected workspace: 3 simulated IoT clients (Home, Industrial, Campus), FedAvg diagram, and 15 rounds audit log. |
| `/detection` | **Flow Detection** | Protected workspace: batch flow classification, single-flow interactive simulator, IP/Port filters, and CSV export. |
| `/evaluation` | **Evaluation** | Protected workspace: comparative benchmark matrix, interactive confusion matrix heatmap, and per-class metrics. |
| `/logs` | **System Logs** | Protected workspace: searchable audit logger with severity filters (INFO, WARN, ERROR, DEBUG) and detail inspection. |
| `/settings` | **Settings** | Protected workspace: FastAPI health ping monitor, Supabase Auth configuration, research defaults, and privacy policy. |

---

## 3. Architecture & Design Direction

- **Core Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS tailored around a restrained research palette:
  - Deep botanical forest green (`#1C3B2C`)
  - Warm off-white / light stone (`#F9F9F7`)
  - Deep charcoal text (`#16191D`)
  - Soft sage (`#698173`)
  - Warm amber warnings (`#C98A28`)
  - Muted red malicious attack indicators (`#C44E4E`)
- **Typography**: Inter (interface body) and JetBrains Mono (technical attributes, IP addresses, ports, loss values).
- **Visualization**: Recharts (multi-line convergence curves, class distribution bars, confusion matrices).
- **Icons**: Lucide React.
- **Client CSV Engine**: In-browser streaming CSV parser (`src/lib/csvParser.ts`) capable of extracting data types, null counts, and class balances without server roundtrips.
- **Backend Readiness**: Typed API abstraction (`src/api/client.ts`) prepared for seamless connection to FastAPI endpoints (`/api/v1/health`, `/api/v1/datasets`, `/api/v1/models`, `/api/v1/federated`).
