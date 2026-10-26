from typing import Dict, Any, List, Optional


def map_database_row_to_model(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Python reference mirror of frontend `mapDatabaseRowToModel` (frontend/src/lib/modelService.ts)
    validating adherence to the ML/FL integration contract.
    """
    raw_metrics = row.get("metrics") or {}
    dataset_info = row.get("datasets") or {}
    dataset_name = dataset_info.get("name", "")
    dataset_display = (
        f"{dataset_name} ({row.get('dataset_id', 'ID Unknown')})"
        if dataset_name
        else f"Dataset: {row.get('dataset_id')}"
        if row.get("dataset_id")
        else "Unassigned Dataset"
    )

    raw_status = str(row.get("status") or "").lower().strip()
    if raw_status in ("trained", "completed", "success"):
        normalized_status = "trained"
    elif raw_status in ("training", "running", "in_progress"):
        normalized_status = "training"
    elif raw_status in ("failed", "error"):
        normalized_status = "failed"
    elif raw_status == "archived":
        normalized_status = "archived"
    else:
        normalized_status = "staged"

    # Strict type checks: only floats/ints are accepted, never invented
    accuracy = raw_metrics.get("accuracy") if isinstance(raw_metrics.get("accuracy"), (int, float)) else None
    precision = raw_metrics.get("precision") if isinstance(raw_metrics.get("precision"), (int, float)) else None
    recall = raw_metrics.get("recall") if isinstance(raw_metrics.get("recall"), (int, float)) else None
    f1_score = (
        raw_metrics.get("f1_score")
        if isinstance(raw_metrics.get("f1_score"), (int, float))
        else raw_metrics.get("f1Score")
        if isinstance(raw_metrics.get("f1Score"), (int, float))
        else None
    )
    loss = raw_metrics.get("loss") if isinstance(raw_metrics.get("loss"), (int, float)) else None
    training_time_sec = (
        raw_metrics.get("training_time_sec")
        if isinstance(raw_metrics.get("training_time_sec"), (int, float))
        else raw_metrics.get("trainingTimeSec")
        if isinstance(raw_metrics.get("trainingTimeSec"), (int, float))
        else None
    )
    inference_latency_ms = (
        raw_metrics.get("inference_latency_ms")
        if isinstance(raw_metrics.get("inference_latency_ms"), (int, float))
        else raw_metrics.get("inferenceLatencyMs")
        if isinstance(raw_metrics.get("inferenceLatencyMs"), (int, float))
        else None
    )

    return {
        "id": row.get("id"),
        "name": row.get("model_name", "Centralized Baseline Run"),
        "status": normalized_status,
        "dataset_display": dataset_display,
        "dataset_id": row.get("dataset_id"),
        "metrics": {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1_score,
            "loss": loss,
            "training_time_sec": training_time_sec,
            "inference_latency_ms": inference_latency_ms,
        },
    }


def filter_workspace_model_runs(rows: List[Dict[str, Any]], workspace_id: Optional[str]) -> List[Dict[str, Any]]:
    """
    Python mirror of `fetchWorkspaceModelRuns` workspace filtering logic.
    Guarantees:
    1. If workspace_id is empty/None, returns [] immediately.
    2. Model runs without matching datasets.workspace_id are strictly excluded.
    3. Unassigned model runs (null dataset_id or null datasets) are NEVER returned.
    """
    if not workspace_id or not str(workspace_id).strip():
        return []

    clean_ws_id = str(workspace_id).strip()
    filtered = []
    for r in rows:
        ds = r.get("datasets")
        if ds and isinstance(ds, dict) and ds.get("workspace_id") == clean_ws_id:
            filtered.append(map_database_row_to_model(r))
    return filtered


# ==============================================================================
# TEST SUITE
# ==============================================================================

def test_missing_workspace_id_returns_empty_list():
    """Verify that None, empty string, or whitespace workspace_id returns [] without querying."""
    assert filter_workspace_model_runs([], None) == []
    assert filter_workspace_model_runs([], "") == []
    assert filter_workspace_model_runs([], "   ") == []

    # Even if mock rows exist, a missing workspace_id must return empty list
    mock_rows = [
        {"id": "run-1", "model_name": "RF-1", "datasets": {"workspace_id": "ws-100"}}
    ]
    assert filter_workspace_model_runs(mock_rows, None) == []
    assert filter_workspace_model_runs(mock_rows, "") == []


def test_workspace_specific_filtering_isolates_records():
    """Verify that only model runs matching the specific active workspace are returned."""
    mock_rows = [
        {
            "id": "run-ws1",
            "model_name": "RF-Workspace-1",
            "status": "completed",
            "dataset_id": "ds-1",
            "datasets": {"id": "ds-1", "name": "IoT_Capture_A", "workspace_id": "ws-alpha"},
            "metrics": {"f1_score": 0.965, "accuracy": 0.971},
        },
        {
            "id": "run-ws2",
            "model_name": "LR-Workspace-2",
            "status": "completed",
            "dataset_id": "ds-2",
            "datasets": {"id": "ds-2", "name": "IoT_Capture_B", "workspace_id": "ws-beta"},
            "metrics": {"f1_score": 0.912, "accuracy": 0.925},
        },
    ]

    alpha_results = filter_workspace_model_runs(mock_rows, "ws-alpha")
    assert len(alpha_results) == 1
    assert alpha_results[0]["id"] == "run-ws1"
    assert alpha_results[0]["name"] == "RF-Workspace-1"

    beta_results = filter_workspace_model_runs(mock_rows, "ws-beta")
    assert len(beta_results) == 1
    assert beta_results[0]["id"] == "run-ws2"
    assert beta_results[0]["name"] == "LR-Workspace-2"

    gamma_results = filter_workspace_model_runs(mock_rows, "ws-gamma")
    assert len(gamma_results) == 0


def test_unassigned_dataset_runs_never_leak_into_workspaces():
    """Verify that runs with null dataset_id or missing datasets foreign key are excluded."""
    mock_rows = [
        {
            "id": "run-unassigned-1",
            "model_name": "Orphan-Run-Null-Dataset",
            "status": "staged",
            "dataset_id": None,
            "datasets": None,
            "metrics": {},
        },
        {
            "id": "run-unassigned-2",
            "model_name": "Orphan-Run-Empty-Dataset",
            "status": "staged",
            "dataset_id": "non-existent-ds",
            "datasets": {},
            "metrics": {},
        },
    ]

    # Must NOT leak into any workspace
    assert filter_workspace_model_runs(mock_rows, "ws-alpha") == []
    assert filter_workspace_model_runs(mock_rows, "ws-beta") == []
    assert filter_workspace_model_runs(mock_rows, "any-random-ws") == []


def test_missing_metrics_do_not_fabricate_values():
    """Verify that missing metrics remain None/null and are never filled with fake default numbers."""
    staged_row = {
        "id": "run-staged-1",
        "model_name": "RF-Baseline-Staged",
        "status": "staged",
        "dataset_id": "ds-1",
        "datasets": {"id": "ds-1", "name": "IoT_Data", "workspace_id": "ws-1"},
        "metrics": {
            "algorithm": "random_forest",
            # evaluation metrics omitted because training hasn't run
        },
    }

    model = map_database_row_to_model(staged_row)
    assert model["status"] == "staged"
    assert model["metrics"]["accuracy"] is None
    assert model["metrics"]["precision"] is None
    assert model["metrics"]["recall"] is None
    assert model["metrics"]["f1_score"] is None
    assert model["metrics"]["loss"] is None
    assert model["metrics"]["inference_latency_ms"] is None
    assert model["metrics"]["training_time_sec"] is None

    # Failed run with error message in metrics
    failed_row = {
        "id": "run-failed-1",
        "model_name": "RF-Baseline-Failed",
        "status": "failed",
        "dataset_id": "ds-1",
        "datasets": {"id": "ds-1", "name": "IoT_Data", "workspace_id": "ws-1"},
        "metrics": {"error": "Out of memory during tree split"},
    }
    failed_model = map_database_row_to_model(failed_row)
    assert failed_model["status"] == "failed"
    assert failed_model["metrics"]["f1_score"] is None


def test_status_completed_requires_persisted_confirmation():
    """Verify that a model is only marked as trained if its persisted status confirms it."""
    row_staged = {"status": "staged", "metrics": {}}
    row_running = {"status": "training", "metrics": {}}
    row_failed = {"status": "failed", "metrics": {}}
    row_completed = {"status": "completed", "metrics": {"f1_score": 0.97}}

    assert map_database_row_to_model(row_staged)["status"] == "staged"
    assert map_database_row_to_model(row_running)["status"] == "training"
    assert map_database_row_to_model(row_failed)["status"] == "failed"
    assert map_database_row_to_model(row_completed)["status"] == "trained"


def test_staging_modal_is_purely_informational():
    """
    Verify that frontend modelService no longer exports any insert function,
    guaranteeing the staging modal cannot write unverified rows to public.model_runs.
    """
    import inspect
    from pathlib import Path

    model_service_path = (
        Path(__file__).resolve().parent.parent.parent
        / "frontend"
        / "src"
        / "lib"
        / "modelService.ts"
    )
    content = model_service_path.read_text(encoding="utf-8")

    # Confirm createStagedModelRun was removed
    assert "createStagedModelRun" not in content
    # Confirm no .insert( call exists in modelService
    assert ".insert(" not in content
    # Confirm inner join filter is used
    assert "datasets!inner" in content
    assert ".eq('datasets.workspace_id', cleanWsId)" in content
