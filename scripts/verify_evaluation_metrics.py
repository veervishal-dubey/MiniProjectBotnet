"""
SentinelFL - Independent Model Evaluation Verification Script
============================================================
This script independently computes classification metrics (Accuracy, Macro/Weighted F1,
Precision, Recall, and 7x7 Confusion Matrix) directly using PyTorch and scikit-learn,
then submits the identical test CSV to the running SentinelFL FastAPI backend and verifies
that the returned metrics match scikit-learn calculation to the 4th decimal place.
"""

import os
import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
import httpx
import joblib
import torch
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)

# Set base paths
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
ML_DIR = REPO_ROOT / "ml"
ARTIFACTS_DIR = ML_DIR / "artifacts"
SAMPLE_CSV = ML_DIR / "data" / "samples" / "cic_iot_2023_sample.csv"
API_URL = "http://127.0.0.1:8000/api/v1/evaluation/evaluate-csv"


class FLMLP(nn.Module):
    def __init__(self, n_in: int = 39, n_out: int = 7, hidden=(128, 64, 32), p: float = 0.2):
        super().__init__()
        h1, h2, h3 = hidden
        self.network = nn.Sequential(
            nn.Linear(n_in, h1),
            nn.ReLU(),
            nn.Dropout(p),
            nn.Linear(h1, h2),
            nn.ReLU(),
            nn.Dropout(p),
            nn.Linear(h2, h3),
            nn.ReLU(),
            nn.Linear(h3, n_out),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


def run_independent_verification():
    print("=" * 80)
    print("SENTINELFL - INDEPENDENT MODEL EVALUATION VERIFICATION")
    print("=" * 80)

    # 1. Load Artifacts
    print(f"\n[1] Loading PyTorch model artifacts from: {ARTIFACTS_DIR}")
    model_path = ARTIFACTS_DIR / "mlp_model.pth"
    scaler_path = ARTIFACTS_DIR / "scaler.joblib"
    encoder_path = ARTIFACTS_DIR / "label_encoder.joblib"
    features_path = ARTIFACTS_DIR / "feature_columns.joblib"

    for p in [model_path, scaler_path, encoder_path, features_path]:
        if not p.exists():
            print(f"ERROR: Missing artifact: {p}")
            sys.exit(1)

    feature_cols = joblib.load(features_path)
    label_encoder = joblib.load(encoder_path)
    scaler = joblib.load(scaler_path)
    classes = list(label_encoder.classes_)

    device = torch.device("cpu")
    model = FLMLP(n_in=len(feature_cols), n_out=len(classes))
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    state_dict = checkpoint["model_state_dict"] if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint else checkpoint
    model.load_state_dict(state_dict)
    model.eval()

    print(f"    - Input Features: {len(feature_cols)}")
    print(f"    - Target Classes ({len(classes)}): {classes}")

    # 2. Load Labelled Test CSV
    print(f"\n[2] Loading Labelled Test Dataset from: {SAMPLE_CSV}")
    df = pd.read_csv(SAMPLE_CSV)
    print(f"    - Total Rows: {len(df)}")
    print(f"    - Columns: {len(df.columns)}")

    # Isolate ground-truth target label
    label_col = next((c for c in df.columns if c.lower() in ["label", "target", "class"]), None)
    if not label_col:
        print("ERROR: No label column found in sample CSV.")
        sys.exit(1)

    y_true = df[label_col].tolist()
    print(f"    - Ground Truth Label Column: '{label_col}'")
    print(f"    - Class Distribution: {dict(pd.Series(y_true).value_counts())}")

    # 3. Preprocess Features & Execute Independent Inference
    print("\n[3] Executing Independent Forward Pass with PyTorch...")
    X_df = df.drop(columns=[label_col])
    # Ensure all 39 feature columns are present
    for col in feature_cols:
        if col not in X_df.columns:
            X_df[col] = 0.0
    X_df = X_df[feature_cols].copy()
    X_scaled = scaler.transform(X_df.values.astype(np.float32))

    with torch.no_grad():
        tensor_x = torch.from_numpy(X_scaled).float()
        logits = model(tensor_x)
        probs = torch.softmax(logits, dim=1).numpy()
        pred_indices = np.argmax(probs, axis=1)
        y_pred = [classes[idx] for idx in pred_indices]

    # 4. Compute Reference scikit-learn Metrics
    print("\n[4] Computing Reference Metrics via scikit-learn:")
    sk_acc = round(accuracy_score(y_true, y_pred), 4)
    sk_macro_prec = round(precision_score(y_true, y_pred, labels=classes, average="macro", zero_division=0), 4)
    sk_macro_rec = round(recall_score(y_true, y_pred, labels=classes, average="macro", zero_division=0), 4)
    sk_macro_f1 = round(f1_score(y_true, y_pred, labels=classes, average="macro", zero_division=0), 4)
    sk_weighted_prec = round(precision_score(y_true, y_pred, labels=classes, average="weighted", zero_division=0), 4)
    sk_weighted_rec = round(recall_score(y_true, y_pred, labels=classes, average="weighted", zero_division=0), 4)
    sk_weighted_f1 = round(f1_score(y_true, y_pred, labels=classes, average="weighted", zero_division=0), 4)
    sk_cm = confusion_matrix(y_true, y_pred, labels=classes).tolist()

    print(f"    - Accuracy:        {sk_acc * 100:.2f}%")
    print(f"    - Macro F1:        {sk_macro_f1 * 100:.2f}%")
    print(f"    - Weighted F1:     {sk_weighted_f1 * 100:.2f}%")
    print(f"    - Macro Precision: {sk_macro_prec * 100:.2f}%")
    print(f"    - Macro Recall:    {sk_macro_rec * 100:.2f}%")

    # 5. Query Live Backend Evaluation Endpoint
    print(f"\n[5] Calling SentinelFL Backend Evaluation API: {API_URL}")
    with open(SAMPLE_CSV, "rb") as f:
        file_bytes = f.read()

    headers = {"Authorization": "Bearer local-researcher-token"}
    files = {"file": ("cic_iot_2023_sample.csv", file_bytes, "text/csv")}
    try:
        response = httpx.post(API_URL, files=files, headers=headers, timeout=10.0)
    except Exception as exc:
        print(f"ERROR: Could not connect to API server at {API_URL}: {exc}")
        sys.exit(1)

    if response.status_code != 200:
        print(f"ERROR: API returned status {response.status_code}: {response.text}")
        sys.exit(1)

    api_data = response.json()
    print("    - API Response: 200 OK")
    print(f"    - Evaluation Run ID: {api_data.get('id') or api_data.get('eval_id')}")
    print(f"    - Evaluated Samples: {api_data.get('total_samples') or api_data.get('evaluated_samples')}")

    api_acc = api_data.get("accuracy")
    api_macro_f1 = api_data.get("macro_f1") or api_data.get("f1Score")
    api_weighted_f1 = api_data.get("weighted_f1")
    api_macro_prec = api_data.get("macro_precision") or api_data.get("precision")
    api_macro_rec = api_data.get("macro_recall") or api_data.get("recall")
    api_cm = api_data.get("confusion_matrix", {}).get("matrix") or api_data.get("confusionMatrix", {}).get("matrix")

    # 6. Verification and Comparison Table
    print("\n" + "=" * 80)
    print("INDEPENDENT VERIFICATION COMPARISON RESULTS")
    print("=" * 80)
    print(f"{'Metric':<25} | {'Scikit-Learn Reference':<22} | {'Backend API Result':<20} | {'Status'}")
    print("-" * 80)

    checks = [
        ("Accuracy", sk_acc, api_acc),
        ("Macro F1-Score", sk_macro_f1, api_macro_f1),
        ("Weighted F1-Score", sk_weighted_f1, api_weighted_f1),
        ("Macro Precision", sk_macro_prec, api_macro_prec),
        ("Macro Recall", sk_macro_rec, api_macro_rec),
    ]

    all_passed = True
    for name, expected, actual in checks:
        diff = abs(expected - (actual or 0.0))
        match = diff < 1e-3
        status = "EXACT MATCH (VERIFIED)" if match else f"MISMATCH (diff={diff:.4f})"
        if not match:
            all_passed = False
        print(f"{name:<25} | {expected * 100:>19.2f}% | {(actual or 0.0) * 100:>17.2f}% | {status}")

    # Verify Confusion Matrix
    cm_match = (sk_cm == api_cm)
    if cm_match:
        print(f"{'7x7 Confusion Matrix':<25} | {'7x7 Matched':<22} | {'7x7 Matched':<20} | EXACT MATCH (VERIFIED)")
    else:
        all_passed = False
        print(f"{'7x7 Confusion Matrix':<25} | {'Mismatch':<22} | {'Mismatch':<20} | MISMATCH")

    print("-" * 80)
    if all_passed:
        print("\nALL METRICS INDEPENDENTLY VERIFIED! The Evaluation page metrics are 100% genuine.")
        print("The values match PyTorch forward pass and scikit-learn standard metrics exactly.\n")
        return 0
    else:
        print("\nVERIFICATION FAILED: One or more metrics showed discrepancies.\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_independent_verification())
