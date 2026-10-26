import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.core.security import get_current_user, AuthenticatedUser
from app.database.supabase import verify_dataset_access
from app.schemas.preprocessing import PreprocessingConfig, PreprocessingReport, JobStatusResponse
from app.schemas.contracts import DatasetMetadataContract
from app.services.job_runner import run_preprocessing_job, get_job_result, get_processed_file_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/preprocessing", tags=["Preprocessing"])


@router.post("/jobs", response_model=PreprocessingReport)
async def create_preprocessing_job(
    config: PreprocessingConfig,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Initiates a leak-free scikit-learn and pandas preprocessing pipeline job.
    Enforces dataset workspace authorization and records job status in public.preprocessing_jobs.
    """
    # 1. Authorize dataset access using caller's verified user ID and token
    try:
        dataset_record = verify_dataset_access(
            user_id=current_user.id,
            dataset_id=config.dataset_id,
            token=current_user.token,
        )
    except TypeError:
        dataset_record = verify_dataset_access(user_id=current_user.id, dataset_id=config.dataset_id)
    storage_path = dataset_record.get("storage_path")

    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset '{config.dataset_id}' has no storage path.",
        )

    # 2. Run the preprocessing job
    try:
        report = run_preprocessing_job(
            config=config,
            storage_path=storage_path,
            token=current_user.token,
        )
    except TypeError:
        report = run_preprocessing_job(config=config, storage_path=storage_path)
    return report


@router.get("/jobs/{job_id}", response_model=Dict[str, Any])
async def get_preprocessing_job_status(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieves the status, configuration, and report of a preprocessing job.
    """
    job_data = get_job_result(job_id, token=current_user.token)

    # Authorize caller against dataset workspace
    dataset_id = job_data.get("dataset_id")
    if dataset_id:
        try:
            verify_dataset_access(
                user_id=current_user.id,
                dataset_id=dataset_id,
                token=current_user.token,
            )
        except TypeError:
            verify_dataset_access(user_id=current_user.id, dataset_id=dataset_id)

    return job_data


@router.get("/jobs/{job_id}/download")
async def download_processed_dataset(
    job_id: str,
    split: str = Query("full", pattern="^(full|train|test)$", description="Split to download: full, train, or test"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Downloads the processed CSV artifact after verifying user authorization.
    """
    job_data = get_job_result(job_id, token=current_user.token)
    dataset_id = job_data.get("dataset_id")
    if dataset_id:
        verify_dataset_access(
            user_id=current_user.id,
            dataset_id=dataset_id,
            token=current_user.token,
        )

    file_path = get_processed_file_path(job_id=job_id, split=split)
    return FileResponse(
        path=str(file_path),
        media_type="text/csv",
        filename=f"sentinelfl_{job_id}_{split}.csv",
    )


@router.get("/contract", response_model=Dict[str, Any])
async def get_ml_fl_contract():
    """
    Returns the formal contract specification for future ML and Federated Learning integration.
    """
    return {
        "title": "SentinelFL ML & Federated Learning Integration Contract",
        "description": "Standardized input/output interface for downstream centralized ML models and Federated Learning algorithms.",
        "data_representation": {
            "format": "CSV (RFC 4180 compliant) and pandas.DataFrame / numpy.ndarray",
            "feature_matrix": "Matrix X of shape (n_samples, n_features), floating-point 32/64 bit, strictly scaled without data leakage.",
            "target_vector": "Vector y of shape (n_samples,), discrete class identifiers or one-hot encoded vectors.",
            "missing_values": "Guaranteed 0 missing values after preprocessing.",
            "infinite_values": "Guaranteed 0 infinite values (+/- inf replaced and imputed).",
        },
        "leakage_prevention_guarantee": "Transformers (RobustScaler, StandardScaler, Imputers) are fitted exclusively on the training partition (X_train). Validation and test partitions are transformed using the pre-fitted parameters.",
        "split_protocol": {
            "default_train_ratio": 0.70,
            "default_val_ratio": 0.15,
            "default_test_ratio": 0.15,
            "stratification": "Maintains label class proportions across partitions.",
        },
        "ml_service_handoff": {
            "file_delivery": "GET /api/v1/preprocessing/jobs/{job_id}/download?split=train (or val, test)",
            "metadata_endpoint": "GET /api/v1/preprocessing/jobs/{job_id}",
        },
    }
