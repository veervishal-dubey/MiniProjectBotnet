import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.ml_service import ml_service

client = TestClient(app)


def test_model_health_endpoint():
    response = client.get("/api/v1/models/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["checkpoint_loaded"] is True
    assert data["input_features_count"] == 39
    assert data["num_classes"] == 7
    assert "Benign" in data["classes"]
    assert "Mirai-udpplain" in data["classes"]
    assert "psh_flag_number" in data["feature_columns"]


def test_model_info_endpoint():
    response = client.get("/api/v1/models/info")
    assert response.status_code == 200
    data = response.json()
    assert data["architecture"].startswith("FLMLP")
    assert len(data["classes"]) == 7


def test_models_list_endpoint():
    response = client.get("/api/v1/models/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Check Centralized model presence
    centralized = next((m for m in data if m["paradigm"] == "centralized"), None)
    assert centralized is not None
    assert centralized["name"] == "Centralized PyTorch MLP Baseline"
    assert centralized["metrics"]["accuracy"] > 0.95


def test_predict_single_flow_simulated():
    req_payload = {
        "src_ip": "192.168.1.180",
        "dst_ip": "198.51.100.44",
        "src_port": 48200,
        "dst_port": 23,
        "protocol": "TCP",
        "flow_duration_ms": 120.4,
        "tot_fwd_pkts": 480,
        "flags": "SYN",
    }
    response = client.post("/api/v1/models/predict", json=req_payload)
    assert response.status_code == 200
    data = response.json()
    assert "predicted_class" in data
    assert data["predicted_class"] in ml_service.classes
    assert 0.0 <= data["confidence"] <= 1.0
    assert "probabilities" in data
    assert len(data["probabilities"]) == 7
    # Sum of softmax probabilities should be approximately 1.0
    total_prob = sum(data["probabilities"].values())
    assert 0.99 <= total_prob <= 1.01


def test_predict_single_flow_benign_features():
    # Pass direct features for a typical benign web session
    features = {col: 0.0 for col in ml_service.feature_columns}
    features["HTTP"] = 1.0
    features["TCP"] = 1.0
    features["Protocol Type"] = 6.0
    features["Tot sum"] = 640.0
    features["AVG"] = 64.0

    response = client.post("/api/v1/models/predict", json={"features": features})
    assert response.status_code == 200
    data = response.json()
    assert data["predicted_class"] in ml_service.classes
    assert data["confidence"] > 0.5


def test_predict_csv_upload():
    import io
    import pandas as pd

    # Generate a mini test CSV with expected 39 features
    df = pd.DataFrame([
        {col: 0.0 for col in ml_service.feature_columns},
        {col: 1.0 for col in ml_service.feature_columns},
    ])
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    files = {"file": ("test_flows.csv", io.BytesIO(csv_bytes), "text/csv")}
    response = client.post("/api/v1/models/predict-csv", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["total_flows"] == 2
    assert len(data["flows"]) == 2
    assert data["malicious_count"] + data["benign_count"] == 2


def test_predict_csv_missing_columns_error():
    import io
    # CSV missing required columns
    bad_csv = b"col1,col2,col3\n1,2,3\n4,5,6"
    files = {"file": ("bad_flows.csv", io.BytesIO(bad_csv), "text/csv")}
    response = client.post("/api/v1/models/predict-csv", files=files)
    assert response.status_code == 400
    assert "Missing" in response.json()["detail"]


def test_predict_csv_with_ground_truth_labels():
    import io
    import pandas as pd

    # Generate test CSV with expected 39 features + ground truth label
    row1 = {col: 0.0 for col in ml_service.feature_columns}
    row1["label"] = "Benign"
    row2 = {col: 1.0 for col in ml_service.feature_columns}
    row2["label"] = "DDoS-ACK"

    df = pd.DataFrame([row1, row2])
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    files = {"file": ("ground_truth_flows.csv", io.BytesIO(csv_bytes), "text/csv")}
    response = client.post("/api/v1/models/predict-csv", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["total_flows"] == 2
    assert "per_class_counts" in data
    assert len(data["per_class_counts"]) == 7
    # Evaluation metrics must be present since ground truth was provided
    assert data["evaluation"] is not None
    assert data["evaluation"]["hasGroundTruth"] is True
    assert "confusionMatrix" in data["evaluation"]
    assert len(data["evaluation"]["confusionMatrix"]["matrix"]) == 7
    assert data["flows"][0]["actual_label"] == "Benign"
    assert data["flows"][1]["actual_label"] == "DDoS-ACK"


def test_classify_active_dataset_flow(authenticated_client, monkeypatch):
    import io
    import pandas as pd

    dataset_id = "test-active-ds-001"
    row1 = {col: 0.0 for col in ml_service.feature_columns}
    row1["label"] = "Benign"
    df = pd.DataFrame([row1])
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    verify_mock = lambda user_id, dataset_id, token=None: {
        "id": dataset_id,
        "name": "Synthetic Active IoT Flow",
        "storage_path": f"user/{dataset_id}/data.csv",
        "uploaded_by": user_id,
    }
    monkeypatch.setattr("app.api.routes.models.verify_dataset_access", verify_mock)
    monkeypatch.setattr("app.api.routes.evaluation.verify_dataset_access", verify_mock)
    monkeypatch.setattr(
        "app.api.routes.models.download_dataset_bytes",
        lambda storage_path, token=None: csv_bytes,
    )



    response = authenticated_client.post(f"/api/v1/models/classify-dataset/{dataset_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_id"] == dataset_id
    assert data["total_flows"] == 1
    assert data["flows"][0]["predicted_class"] in ml_service.classes

    # Test retrieving evaluation endpoint
    eval_resp = authenticated_client.get(f"/api/v1/evaluation/dataset/{dataset_id}")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["hasGroundTruth"] is True
    assert "confusionMatrix" in eval_data

    # Test retrieving stored predictions endpoint
    pred_resp = authenticated_client.get(f"/api/v1/models/predictions/{dataset_id}")
    assert pred_resp.status_code == 200
    pred_data = pred_resp.json()
    assert pred_data["dataset_id"] == dataset_id
    assert pred_data["total_flows"] == 1
    assert len(pred_data["flows"]) == 1


def test_predict_csv_with_infinities_and_large_floats():
    import io
    import pandas as pd
    import numpy as np

    # Build rows with Infinity, -Infinity, NaN, and extreme values
    rows = []
    for i in range(5):
        row = {col: 10.0 for col in ml_service.feature_columns}
        row["Label"] = "Benign"
        rows.append(row)

    rows[0]["Rate"] = "Infinity"
    rows[1]["IAT"] = "-Infinity"
    rows[2]["Min"] = 1e308
    rows[3]["Max"] = np.nan

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    response = client.post(
        "/api/v1/models/predict-csv",
        files={"file": ("dirty_inf.csv", buf.getvalue(), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_flows"] == 5
    assert len(data["flows"]) == 5
    # All 5 flows must be successfully processed without crashing on inf/nan
    for f in data["flows"]:
        assert f["predicted_class"] in ml_service.classes or f["status"] == "rejected"


