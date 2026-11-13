import io
from pathlib import Path
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.adapters.registry import adapter_registry
from app.adapters.base import DatasetType, DatasetCompatibilityError
from app.adapters.cic_iot_2023 import CICIoT2023Adapter
from app.adapters.edge_iiotset import EdgeIIoTsetAdapter
from app.adapters.n_iot import NIoTAdapter
from app.services.ml_service import ml_service

client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLES_DIR = REPO_ROOT / "ml" / "data" / "samples"


def test_adapter_registry_listing():
    adapters = adapter_registry.list_adapters()
    assert len(adapters) >= 3
    types = [a["dataset_type"] for a in adapters]
    assert "cic_iot_2023" in types
    assert "edge_iiotset" in types
    assert "n_iot" in types

    cic = next(a for a in adapters if a["dataset_type"] == "cic_iot_2023")
    assert cic["supported_by_flmlp"] is True
    assert cic["expected_features_count"] == 39

    edge = next(a for a in adapters if a["dataset_type"] == "edge_iiotset")
    assert edge["supported_by_flmlp"] is False

    niot = next(a for a in adapters if a["dataset_type"] == "n_iot")
    assert niot["supported_by_flmlp"] is False


def test_cic_iot_2023_adapter_identification_and_alignment():
    sample_path = SAMPLES_DIR / "cic_iot_2023_sample.csv"
    assert sample_path.exists(), f"Sample missing at {sample_path}"

    df = pd.read_csv(sample_path)
    adapter = CICIoT2023Adapter()

    assert adapter.identify(df) is True
    report = adapter.validate_schema(df)
    assert report.is_compatible_with_flmlp is True
    assert len(report.matched_features) == 39
    assert len(report.missing_mandatory_features) == 0
    assert len(report.supported_classes) > 0

    X_scaled, labels, val_rep = adapter.align_and_preprocess(df, scaler=ml_service.scaler)
    assert X_scaled.shape == (len(df), 39)
    assert labels is not None
    assert len(labels) == len(df)


def test_edge_iiotset_adapter_identification_and_safe_rejection():
    sample_path = SAMPLES_DIR / "edge_iiotset_sample.csv"
    assert sample_path.exists(), f"Sample missing at {sample_path}"

    df = pd.read_csv(sample_path)
    adapter, report = adapter_registry.detect_adapter(df)

    assert adapter.dataset_type == DatasetType.EDGE_IIOTSET
    assert report.is_compatible_with_flmlp is False
    assert len(report.missing_mandatory_features) == 39
    assert "Normal" in report.detected_classes or "DDoS_TCP" in report.detected_classes
    assert report.rejection_reason is not None

    with pytest.raises(DatasetCompatibilityError):
        adapter.align_and_preprocess(df)


def test_n_iot_adapter_identification_and_safe_rejection():
    sample_path = SAMPLES_DIR / "n_iot_sample.csv"
    assert sample_path.exists(), f"Sample missing at {sample_path}"

    df = pd.read_csv(sample_path)
    adapter, report = adapter_registry.detect_adapter(df)

    assert adapter.dataset_type == DatasetType.N_IOT
    assert report.is_compatible_with_flmlp is False
    assert len(report.missing_mandatory_features) == 39
    assert report.rejection_reason is not None

    with pytest.raises(DatasetCompatibilityError):
        adapter.align_and_preprocess(df)


def test_predict_csv_rejects_edge_iiotset_safely():
    sample_path = SAMPLES_DIR / "edge_iiotset_sample.csv"
    content = sample_path.read_bytes()

    files = {"file": ("edge_sample.csv", io.BytesIO(content), "text/csv")}
    response = client.post("/api/v1/models/predict-csv", files=files)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "incompatible" in detail.lower()
    assert "Edge-IIoTset" in detail


def test_predict_csv_rejects_n_iot_safely():
    sample_path = SAMPLES_DIR / "n_iot_sample.csv"
    content = sample_path.read_bytes()

    files = {"file": ("n_iot_sample.csv", io.BytesIO(content), "text/csv")}
    response = client.post("/api/v1/models/predict-csv", files=files)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "incompatible" in detail.lower()
    assert "N-BaIoT" in detail or "N-IoT" in detail


def test_api_list_adapters_endpoint():
    response = client.get("/api/v1/datasets/adapters")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3


def test_api_detect_adapter_endpoint():
    sample_path = SAMPLES_DIR / "cic_iot_2023_sample.csv"
    content = sample_path.read_bytes()

    files = {"file": ("cic_sample.csv", io.BytesIO(content), "text/csv")}
    response = client.post("/api/v1/datasets/detect-adapter", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_type"] == "cic_iot_2023"
    assert data["is_compatible_with_flmlp"] is True
    assert data["matched_features_count"] == 39

