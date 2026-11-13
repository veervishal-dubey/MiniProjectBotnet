import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.audit_service import audit_service


@pytest.fixture
def client():
    return TestClient(app)


def test_audit_service_recording_and_retrieval():
    # 1. Record test events
    event = audit_service.record_event(
        severity="INFO",
        category="DETECTION",
        message="Test single-flow detection event",
        component="MLTest",
        details={"latency_ms": 0.35, "class": "Benign"},
    )
    assert event["id"].startswith("log_")
    assert event["category"] == "DETECTION"
    assert event["severity"] == "INFO"

    # 2. Retrieve logs with filtering
    logs, total, cat_counts, sev_counts = audit_service.get_logs(
        query="single-flow",
        category="DETECTION",
        severity="INFO",
    )
    assert total >= 1
    assert any("single-flow" in l["message"] for l in logs)
    assert cat_counts["DETECTION"] >= 1


def test_audit_logs_api_endpoint(client):
    res = client.get("/api/v1/logs?limit=50")
    assert res.status_code == 200
    data = res.json()
    assert "logs" in data
    assert "total" in data
    assert "categories_count" in data
    assert "severities_count" in data
    assert isinstance(data["logs"], list)
    assert len(data["logs"]) >= 1

    # Test severity filter
    res_info = client.get("/api/v1/logs?severity=INFO")
    assert res_info.status_code == 200
    info_logs = res_info.json()["logs"]
    for l in info_logs:
        assert l["severity"] == "INFO"

    # Test category filter
    res_system = client.get("/api/v1/logs?category=SYSTEM")
    assert res_system.status_code == 200
    sys_logs = res_system.json()["logs"]
    for l in sys_logs:
        assert l["category"] == "SYSTEM"


def test_system_summary_endpoint(client):
    res = client.get("/api/v1/system/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert "capabilities" in data
    assert data["capabilities"]["ml_inference"]["status"] == "operational"
    assert data["capabilities"]["ml_inference"]["features_count"] == 39
    assert data["capabilities"]["ml_inference"]["num_classes"] == 7
    assert data["capabilities"]["federated_learning"]["status"] == "operational"
    assert "counts" in data
    assert data["counts"]["model_count"] >= 1
    assert data["counts"]["audit_log_count"] >= 1

