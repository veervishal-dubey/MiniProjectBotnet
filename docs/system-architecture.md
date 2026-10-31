# SentinelFL — System Architecture & Component Specification

This document provides the technical architecture and component data contracts for **SentinelFL (Federated IoT Threat Intelligence)**.

---

## 1. High-Level Architecture Overview

SentinelFL comprises four interconnected subsystems:
1. **Presentation Layer (React + Vite SPA)**: Single-Page Application with centralized `ActiveDatasetContext`, real-time validation telemetry, multi-page workflow navigation, paginated batch inspection tables, and SVG-rendered 7×7 confusion matrices.
2. **Microservice API Layer (FastAPI)**: REST API handling structural CSV inspection, leak-free transformation pipelines, chunked batch inference, and federated orchestration.
3. **Data & Security Layer (Supabase Cloud)**: GoTrue JWT authentication, PostgreSQL with Row Level Security (RLS) for tenant isolation, and private object storage for original and preprocessed dataset blobs.
4. **Machine Learning & Federated Layer (PyTorch & Flower)**: Canonical 39-feature feedforward network (FLMLP), federated client partition engines, FedAvg sample-weighted aggregation workers, and job telemetry collectors.

---

## 2. Component Communication Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Vite Frontend                             │
│                  (Active Dataset Context, React Query)                 │
└───────┬──────────────────────────────┬──────────────────────────┬──────┘
        │                              │                          │
        │ 1. Supabase Auth (JWT)       │ 2. Direct Storage Upload │ 3. API Requests (Bearer JWT)
        ▼                              ▼                          ▼
┌───────────────┐              ┌───────────────┐          ┌───────────────┐
│ Supabase Auth │              │Private Storage│          │FastAPI Service│
│ (Users & Orgs)│              │('sentinelfl') │          │ (Port 8000)   │
└───────┬───────┘              └───────┬───────┘          └───────┬───────┘
        │                              ▲                          │
        │ Enforces RLS Policies        │ Validates Workspace Token│
        ▼                              │                          ▼
┌──────────────────────────────────────┴────────┐         ┌───────────────┐
│              PostgreSQL Database              │         │ PyTorch FLMLP │
│ (workspaces, datasets, preprocessing_jobs)    │         │& Flower FedAvg│
└───────────────────────────────────────────────┘         └───────────────┘
```

---

## 3. Data Contracts & Isolation

### 3.1. Supabase Database Schema
- **`public.workspaces`**: Tenancy root (`id`, `name`, `created_at`, `owner_id`).
- **`public.workspace_members`**: User association (`workspace_id`, `user_id`, `role`).
- **`public.datasets`**: Uploaded metadata (`id`, `workspace_id`, `name`, `storage_path`, `row_count`, `column_count`, `file_size_bytes`, `status`).
- **`public.preprocessing_jobs`**: Job configurations (`id`, `dataset_id`, `workspace_id`, `status`, `target_column`, `scaler_type`, `imputation_strategy`, `split_ratios`, `feature_count`).

### 3.2. Dataset Isolation & Storage Security
1. All client-side file uploads stream directly to Supabase Storage using private bucket policies.
2. The FastAPI backend validates the caller's JWT token on every route using `verify_supabase_jwt(token)`.
3. The dataset's `workspace_id` is verified against the user's active workspace membership prior to streaming or computing predictions.
4. Raw user datasets are never modified; preprocessing pipelines output derived artifacts to separate storage keys.

---

## 4. Machine Learning & Preprocessing Pipeline

### 4.1. Leak-Free Preprocessing Sequence
```
Raw Dataset CSV
      │
      ▼
Target Column Separation (Ground Truth isolated from X)
      │
      ▼
Train / Validation / Test Splitting (e.g. 70% / 15% / 15%)
      │
      ├───────────────────────────────┐
      ▼                               ▼
Fit Scaler & Imputer on X_train     Transform X_val & X_test
(Zero parameters learned on test)   (Using X_train parameters only)
      │                               │
      └──────────────┬────────────────┘
                     ▼
        Persist Processed Matrices:
        - X_train, y_train
        - X_val, y_val
        - X_test, y_test
        - Scaler artifact (.joblib)
        - Preprocessing metadata JSON
```

### 4.2. Inference Pipeline (Chunked Batch Classification)
- When evaluating datasets with up to 100,000+ rows, the backend executes chunked batch inference ($N=1024$ rows per chunk) using PyTorch `torch.no_grad()`.
- Feature alignment guarantees:
  1. If ground-truth labels exist in the uploaded file, they are isolated and preserved for empirical evaluation.
  2. Input columns are strictly re-indexed to match the canonical 39 features in `feature_columns.joblib`.
  3. Continuous features are transformed using `scaler.joblib`.
  4. Probabilities are generated via Softmax; argmax produces predicted class IDs.
  5. Class IDs are mapped to human-readable strings via `label_encoder.joblib`.

---

## 5. Federated Learning Engine (Flower / FedAvg)

### 5.1. Data Partitioning
- **IID (Independent and Identically Distributed)**: Random uniform partitioning across $K$ simulated edge clients.
- **Dirichlet Non-IID**: Partitioning using Dirichlet distribution $\text{Dir}(\alpha)$ to induce real-world label skewness observed in heterogeneous IoT networks ($\alpha = 0.5$ moderate skew, $\alpha = 0.1$ extreme skew).

### 5.2. Aggregation Strategy (FedAvg)
At round $t$, the central server distributes global weights $w_t$ to selected clients $S_t$. Each client $k \in S_t$ trains locally on private dataset $D_k$ with $n_k = |D_k|$ samples, producing local parameters $w_{t+1}^k$. The server computes:
$$w_{t+1} = \sum_{k \in S_t} \frac{n_k}{N} w_{t+1}^k \quad \text{where} \quad N = \sum_{k \in S_t} n_k$$

The updated weights $w_{t+1}$ are serialized to `ml/artifacts/global_model_final.pt` and made available for inference in the model registry.
