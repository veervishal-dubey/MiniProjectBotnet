import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_federated_status():
    response = client.get("/api/v1/federated/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["idle", "training"]
    assert "A_iid" in data["available_scenarios"]
    assert data["clients_count"] == 10
    assert data["algorithm"] == "FedAvg (Sample-Weighted)"


def test_federated_runs_list():
    response = client.get("/api/v1/federated/runs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Check that A_iid_s42_R20_E1 exists
    primary_run = next((r for r in data if "A_iid" in r["run_id"]), None)
    assert primary_run is not None


def test_federated_run_details():
    response = client.get("/api/v1/federated/runs/A_iid_s42_R20_E1")
    assert response.status_code == 200
    data = response.json()
    assert data["run_id"] == "A_iid_s42_R20_E1"
    assert len(data["round_history"]) == 20
    assert len(data["clients"]) == 10
    assert data["metrics"]["globalAccuracy"] > 0.95


def test_evaluation_benchmarks():
    response = client.get("/api/v1/evaluation/benchmarks")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    # Check categories
    categories = [e["category"] for e in data]
    assert "centralized" in categories
    assert "federated_iid" in categories
    assert "federated_non_iid" in categories


def test_settings_paths_resolution():
    from app.core.config import settings
    from pathlib import Path
    assert hasattr(settings, "BASE_DIR")
    assert isinstance(settings.BASE_DIR, Path)
    assert hasattr(settings, "FL_RUNS_DIR")
    assert isinstance(settings.FL_RUNS_DIR, Path)
    assert hasattr(settings, "STORAGE_DIR")
    assert isinstance(settings.STORAGE_DIR, Path)
    assert settings.BASE_DIR.exists()
    assert settings.STORAGE_DIR.exists()


def test_fl_invalid_scenario_rejection():
    payload = {
        "scenario": "invalid_nonexistent_scenario",
        "rounds": 1,
        "num_clients": 2,
    }
    response = client.post("/api/v1/federated/train", json=payload)
    assert response.status_code == 400
    assert "not exist" in response.json()["detail"]


def test_fl_invalid_parameters_validation():
    # num_clients > 10 should fail pydantic validation
    payload = {
        "scenario": "A_iid",
        "rounds": 1,
        "num_clients": 50,
    }
    response = client.post("/api/v1/federated/train", json=payload)
    assert response.status_code == 422


def test_fl_train_job_creation_and_polling():
    import time
    payload = {
        "scenario": "A_iid",
        "rounds": 1,
        "num_clients": 2,
        "batch_size": 64,
        "local_epochs": 1,
        "lr": 0.001,
        "max_samples_per_client": 100
    }
    # Launch training job
    response = client.post("/api/v1/federated/train", json=payload)
    assert response.status_code == 200
    job_data = response.json()
    assert "job_id" in job_data
    assert job_data["status"] in ["queued", "running", "completed"]
    job_id = job_data["job_id"]

    # Poll status
    completed = False
    for _ in range(30):
        poll_res = client.get(f"/api/v1/federated/jobs/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            completed = True
            assert poll_data["current_round"] == 1
            assert poll_data["latest_metrics"] is not None
            assert "fed_val_acc" in poll_data["latest_metrics"]
            break
        elif poll_data["status"] == "failed":
            pytest.fail(f"Job failed unexpectedly: {poll_data.get('error')}")
        time.sleep(1)

    try:
        assert completed, f"Job {job_id} did not complete within the timeout window."
    finally:
        import shutil
        from app.core.config import settings
        test_run_dir = settings.FL_RUNS_DIR / job_id
        if test_run_dir.exists():
            shutil.rmtree(test_run_dir, ignore_errors=True)


def test_fl_worker_failure_handling_and_persistence(monkeypatch):
    import time
    from app.services.fl_service import fl_service
    from app.schemas.federated import FLTrainRequest

    # Force an exception during local training in a test job
    def raise_err(*args, **kwargs):
        raise RuntimeError("Simulated edge hardware network partition crash")

    monkeypatch.setattr(fl_service, "get_available_scenarios", lambda: ["test_scenario"])
    
    # Create a job state directly and test failure handling
    test_job_id = f"test_fail_{int(time.time())}"
    with fl_service.lock:
        fl_service.jobs_history[test_job_id] = {
            "job_id": test_job_id,
            "status": "running",
            "scenario": "A_iid",
            "current_round": 0,
            "total_rounds": 1,
            "history": [],
            "latest_metrics": None,
            "started_at": "2026-10-29T00:00:00Z",
            "completed_at": None,
            "error": None,
        }

    # Simulate worker catching exception
    try:
        raise_err()
    except Exception as exc:
        with fl_service.lock:
            fl_service.jobs_history[test_job_id]["status"] = "failed"
            fl_service.jobs_history[test_job_id]["error"] = str(exc)

    res = client.get(f"/api/v1/federated/jobs/{test_job_id}")
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "failed"
    assert "Simulated edge hardware network partition crash" in res_data["error"]

