from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ["healthy", "degraded"]
    assert "version" in data
    assert "timestamp" in data
    assert "python_version" in data
    assert "database" in data
    assert "storage" in data


def test_api_v1_discovery(client: TestClient):
    response = client.get("/api/v1")
    assert response.status_code == 200
    data = response.json()
    assert data["api_version"] == "v1"
    assert "endpoints" in data
    assert "health" in data["endpoints"]
    assert "validate_dataset" in data["endpoints"]
    assert "create_preprocessing_job" in data["endpoints"]


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "/docs" in data["documentation"]
