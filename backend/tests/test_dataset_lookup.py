import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database.supabase import verify_dataset_access, download_dataset_bytes
from app.core.security import AuthenticatedUser
from app.main import app


def test_verify_dataset_access_direct_id_match(monkeypatch):
    """Verifies that a dataset is found directly by its primary key ID in public.datasets."""
    user_id = "user-123"
    dataset_id = "ba4cf0f1-d914-4028-9fa6-cdbd6e29dfe7"
    fake_record = {
        "id": dataset_id,
        "name": "Botnet_Sample",
        "storage_path": f"{user_id}/{dataset_id}/data.csv",
        "workspace_id": "ws-999",
        "status": "ready",
        "uploaded_by": user_id,
        "description": "{}",
    }

    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_select = MagicMock()
    mock_eq = MagicMock()
    mock_single = MagicMock()

    mock_client.from_.return_value = mock_query
    mock_query.select.return_value = mock_select
    mock_select.eq.return_value = mock_eq
    mock_eq.maybe_single.return_value = mock_single
    mock_single.execute.return_value = MagicMock(data=fake_record)

    monkeypatch.setattr("app.database.supabase.get_supabase_client", lambda token=None: mock_client)

    result = verify_dataset_access(user_id=user_id, dataset_id=dataset_id, token="fake_token")
    assert result["id"] == dataset_id
    assert result["storage_path"] == f"{user_id}/{dataset_id}/data.csv"
    assert result["uploaded_by"] == user_id


def test_verify_dataset_access_storage_path_fallback(monkeypatch):
    """Verifies fallback when dataset_id is found by storage_path."""
    user_id = "user-123"
    dataset_id = "ba4cf0f1-d914-4028-9fa6-cdbd6e29dfe7"
    fake_record = {
        "id": dataset_id,
        "name": "Botnet_Sample",
        "storage_path": f"{user_id}/{dataset_id}/data.csv",
        "workspace_id": "ws-999",
        "status": "ready",
        "uploaded_by": user_id,
        "description": "{}",
    }

    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_select = MagicMock()

    mock_client.from_.return_value = mock_query
    mock_query.select.return_value = mock_select

    # 1st call by id returns None, 2nd call by storage_path returns fake_record
    eq_mock1 = MagicMock()
    eq_mock1.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    eq_mock2 = MagicMock()
    eq_mock2.maybe_single.return_value.execute.return_value = MagicMock(data=fake_record)

    mock_select.eq.side_effect = [eq_mock1, eq_mock2]

    monkeypatch.setattr("app.database.supabase.get_supabase_client", lambda token=None: mock_client)

    result = verify_dataset_access(user_id=user_id, dataset_id=dataset_id, token="fake_token")
    assert result["id"] == dataset_id
    assert result["storage_path"] == f"{user_id}/{dataset_id}/data.csv"


def test_verify_dataset_access_storage_reconciliation(monkeypatch):
    """Verifies self-healing reconciliation when file is in storage but DB row was pending."""
    user_id = "user-123"
    dataset_id = "ba4cf0f1-d914-4028-9fa6-cdbd6e29dfe7"

    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_select = MagicMock()

    mock_client.from_.return_value = mock_query
    mock_query.select.return_value = mock_select

    # DB lookups by id and storage_path return None
    eq_mock = MagicMock()
    eq_mock.maybe_single.return_value.execute.return_value = MagicMock(data=None)
    mock_select.eq.return_value = eq_mock

    like_mock = MagicMock()
    like_mock.maybe_single.return_value.execute.return_value = MagicMock(data=None)
    mock_select.like.return_value = like_mock

    # Storage bucket list returns an existing object
    mock_storage_bucket = MagicMock()
    mock_storage_bucket.list.return_value = [{"name": "botnet_traffic.csv"}]
    mock_client.storage.from_.return_value = mock_storage_bucket

    # Workspace query returns user's personal workspace
    ws_exec_mock = MagicMock()
    ws_exec_mock.execute.return_value = MagicMock(data=[{"id": "ws-user-personal"}])
    mock_select.eq.return_value.limit.return_value = ws_exec_mock

    # Insert into datasets returns created record
    mock_query.insert.return_value.execute.return_value = MagicMock(data=[{
        "id": dataset_id,
        "name": "Botnet Traffic",
        "storage_path": f"{user_id}/{dataset_id}/botnet_traffic.csv",
        "workspace_id": "ws-user-personal",
        "status": "ready",
        "uploaded_by": user_id,
        "description": "{}",
    }])

    monkeypatch.setattr("app.database.supabase.get_supabase_client", lambda token=None: mock_client)

    result = verify_dataset_access(user_id=user_id, dataset_id=dataset_id, token="fake_token")
    assert result["id"] == dataset_id
    assert result["storage_path"] == f"{user_id}/{dataset_id}/botnet_traffic.csv"
    assert result["uploaded_by"] == user_id


def test_verify_dataset_access_missing_returns_404(monkeypatch):
    """Verifies that an unknown dataset ID raises a clean 404 HTTPException."""
    user_id = "user-123"
    dataset_id = "nonexistent-id"

    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_select = MagicMock()

    mock_client.from_.return_value = mock_query
    mock_query.select.return_value = mock_select

    eq_mock = MagicMock()
    eq_mock.maybe_single.return_value.execute.return_value = MagicMock(data=None)
    mock_select.eq.return_value = eq_mock

    like_mock = MagicMock()
    like_mock.maybe_single.return_value.execute.return_value = MagicMock(data=None)
    mock_select.like.return_value = like_mock

    mock_storage_bucket = MagicMock()
    mock_storage_bucket.list.return_value = []
    mock_client.storage.from_.return_value = mock_storage_bucket

    monkeypatch.setattr("app.database.supabase.get_supabase_client", lambda token=None: mock_client)

    with pytest.raises(HTTPException) as exc_info:
        verify_dataset_access(user_id=user_id, dataset_id=dataset_id, token="fake_token")

    assert exc_info.value.status_code == 404
    assert f"Dataset with ID '{dataset_id}' not found" in exc_info.value.detail


def test_complete_preprocessing_flow(authenticated_client: TestClient, sample_csv_bytes, monkeypatch):
    """
    Tests complete end-to-end pipeline execution:
    POST /api/v1/preprocessing/jobs with dataset ID ->
    verifies access -> downloads CSV from private storage -> runs preprocessing -> returns 200 with report.
    """
    dataset_id = "ba4cf0f1-d914-4028-9fa6-cdbd6e29dfe7"
    storage_path = f"test-user-uuid-1111/{dataset_id}/traffic.csv"

    # Mock verify_dataset_access returning verified record
    import app.api.routes.preprocessing as prep_routes
    monkeypatch.setattr(
        prep_routes,
        "verify_dataset_access",
        lambda user_id, dataset_id, token=None: {
            "id": dataset_id,
            "name": "Traffic Capture",
            "storage_path": storage_path,
            "workspace_id": "ws-111",
            "status": "ready",
            "uploaded_by": user_id,
        },
    )

    # Mock download_dataset_bytes returning valid IoT CSV bytes
    import app.services.job_runner as runner_module
    monkeypatch.setattr(
        runner_module,
        "download_dataset_bytes",
        lambda path, token=None: sample_csv_bytes,
    )

    # Mock DB insert and update in job runner
    mock_client = MagicMock()
    mock_client.from_.return_value.insert.return_value.execute.return_value = MagicMock()
    mock_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    monkeypatch.setattr(runner_module, "get_supabase_client", lambda token=None: mock_client)

    # Send preprocessing request
    req_body = {
        "dataset_id": dataset_id,
        "target_column": "label",
        "drop_duplicates": True,
        "scaling_method": "robust",
        "categorical_encoding": "onehot",
        "train_ratio": 0.70,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
    }

    response = authenticated_client.post("/api/v1/preprocessing/jobs", json=req_body)
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
    report = response.json()

    assert report["dataset_id"] == dataset_id
    assert report["status"] == "completed"
    assert report["original_rows"] == 12
    assert report["train_rows"] > 0
    assert report["test_rows"] > 0
    assert len(report["feature_names"]) > 0
    assert report["remaining_missing_values"] == 0
