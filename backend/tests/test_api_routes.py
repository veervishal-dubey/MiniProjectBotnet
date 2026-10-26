import io
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import get_current_user, AuthenticatedUser


def test_unauthenticated_requests_rejected(client: TestClient):
    # Missing Authorization header
    res_validate = client.post("/api/v1/datasets/ds-123/validate")
    assert res_validate.status_code == 401

    res_preview = client.get("/api/v1/datasets/ds-123/preview")
    assert res_preview.status_code == 401

    res_job = client.post("/api/v1/preprocessing/jobs", json={"dataset_id": "ds-123"})
    assert res_job.status_code == 401


def test_authenticated_validate_raw_csv(authenticated_client: TestClient, sample_csv_bytes):
    response = authenticated_client.post(
        "/api/v1/datasets/validate-raw",
        files={"file": ("test_iot.csv", io.BytesIO(sample_csv_bytes), "text/csv")},
        data={"label_column": "label"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is True
    assert data["total_rows"] == 12
    assert data["detected_label_column"] == "label"
    assert data["class_distribution"] is not None


def test_ml_contract_endpoint(client: TestClient):
    response = client.get("/api/v1/preprocessing/contract")
    assert response.status_code == 200
    data = response.json()
    assert "data_representation" in data
    assert "leakage_prevention_guarantee" in data
    assert "split_protocol" in data


def test_unauthorized_dataset_access_forbidden(authenticated_client: TestClient, monkeypatch):
    from fastapi import HTTPException
    import app.api.routes.datasets as ds_routes

    def mock_verify_fail(user_id, dataset_id):
        raise HTTPException(status_code=403, detail="You are not authorized to access datasets in this workspace.")

    monkeypatch.setattr(ds_routes, "verify_dataset_access", mock_verify_fail)

    response = authenticated_client.post("/api/v1/datasets/ds-unauthorized/validate")
    assert response.status_code == 403
    assert "not authorized" in response.json()["detail"].lower()


def test_nonexistent_dataset_not_found(authenticated_client: TestClient, monkeypatch):
    from fastapi import HTTPException
    import app.api.routes.datasets as ds_routes

    def mock_verify_404(user_id, dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    monkeypatch.setattr(ds_routes, "verify_dataset_access", mock_verify_404)

    response = authenticated_client.post("/api/v1/datasets/ds-nonexistent/validate")
    assert response.status_code == 404

