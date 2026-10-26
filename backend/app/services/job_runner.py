import uuid
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
from app.core.config import settings
from app.database.supabase import (
    get_admin_client,
    get_supabase_client,
    download_dataset_bytes,
    upload_processed_file,
)
from app.schemas.preprocessing import PreprocessingConfig, PreprocessingReport
from app.services.preprocessor import execute_preprocessing

logger = logging.getLogger(__name__)


def run_preprocessing_job(
    config: PreprocessingConfig,
    raw_csv_bytes: Optional[bytes] = None,
    storage_path: Optional[str] = None,
    token: Optional[str] = None,
) -> PreprocessingReport:
    """
    Executes a preprocessing job, recording job state into public.preprocessing_jobs
    and storing processed outputs in both local cache and private Supabase Storage.
    
    Guarantees:
    - Status is 'running' during computation.
    - Status is 'completed' ONLY after file output succeeds.
    - Status is 'failed' if any processing or storage step fails.
    """
    job_id = str(uuid.uuid4())
    client = None

    try:
        client = get_supabase_client(token=token)
    except Exception as exc:
        logger.warning(f"Supabase client unavailable for job {job_id}: {exc}")

    # 1. Record initial 'running' status in public.preprocessing_jobs
    if client:
        try:
            client.from_("preprocessing_jobs").insert({
                "id": job_id,
                "dataset_id": config.dataset_id,
                "status": "running",
                "result": {"status": "running", "stage": "Starting data preprocessing pipeline"},
            }).execute()
        except Exception as exc:
            logger.warning(f"Could not record initial job row in DB: {exc}")

    # 2. Retrieve raw CSV content if not provided in-memory
    if raw_csv_bytes is None:
        if not storage_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either raw CSV content or storage_path must be provided to run preprocessing.",
            )
        raw_csv_bytes = download_dataset_bytes(storage_path, token=token)

    # 3. Execute leak-free scikit-learn preprocessing
    try:
        report, full_bytes, train_bytes, test_bytes = execute_preprocessing(
            raw_content=raw_csv_bytes,
            config=config,
            job_id=job_id,
        )

        # 4. Save processed artifacts securely to local cache
        job_dir = settings.PROCESSED_CACHE_DIR / config.dataset_id
        job_dir.mkdir(parents=True, exist_ok=True)

        full_file_path = job_dir / f"{job_id}_processed.csv"
        full_file_path.write_bytes(full_bytes)

        if train_bytes:
            (job_dir / f"{job_id}_train.csv").write_bytes(train_bytes)
        if test_bytes:
            (job_dir / f"{job_id}_test.csv").write_bytes(test_bytes)

        # 5. Save to private Supabase Storage if configured
        if client:
            storage_dest = f"processed/{config.dataset_id}/{job_id}_processed.csv"
            upload_processed_file(storage_dest, full_bytes, "text/csv", token=token)
            if train_bytes:
                upload_processed_file(f"processed/{config.dataset_id}/{job_id}_train.csv", train_bytes, "text/csv", token=token)
            if test_bytes:
                upload_processed_file(f"processed/{config.dataset_id}/{job_id}_test.csv", test_bytes, "text/csv", token=token)
            report.processed_file_path = storage_dest

        # 6. Update database record to 'completed' with structured report
        if client:
            try:
                client.from_("preprocessing_jobs").update({
                    "status": "completed",
                    "result": report.model_dump(),
                }).eq("id", job_id).execute()
            except Exception as exc:
                logger.error(f"Failed to record completed job status in DB: {exc}")

        return report

    except Exception as exc:
        logger.error(f"Preprocessing job {job_id} failed: {exc}", exc_info=True)
        # Update database record to 'failed'
        if client:
            try:
                client.from_("preprocessing_jobs").update({
                    "status": "failed",
                    "result": {
                        "status": "failed",
                        "error": str(exc),
                    },
                }).eq("id", job_id).execute()
            except Exception as db_exc:
                logger.error(f"Failed to update failed job status in DB: {db_exc}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preprocessing pipeline failed: {str(exc)}",
        )


def get_job_result(job_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    """Retrieves job status and result from database or local cache."""
    try:
        client = get_supabase_client(token=token)
        res = client.from_("preprocessing_jobs").select("*").eq("id", job_id).maybe_single().execute()
        if res and res.data:
            return res.data
    except Exception as exc:
        logger.warning(f"Failed to fetch job {job_id} from database: {exc}")

    # Fallback to local files if DB unavailable
    for ds_dir in settings.PROCESSED_CACHE_DIR.glob("*"):
        target_file = ds_dir / f"{job_id}_processed.csv"
        if target_file.exists():
            return {
                "id": job_id,
                "dataset_id": ds_dir.name,
                "status": "completed",
                "result": {"message": "Job completed locally", "file_path": str(target_file)},
            }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Preprocessing job '{job_id}' not found.",
    )


def get_processed_file_path(job_id: str, split: str = "full") -> Path:
    """Returns the local path to the processed CSV for download."""
    suffix = "_processed.csv" if split == "full" else f"_{split}.csv"
    for ds_dir in settings.PROCESSED_CACHE_DIR.glob("*"):
        candidate = ds_dir / f"{job_id}{suffix}"
        if candidate.exists():
            return candidate
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Processed artifact for job '{job_id}' (split: {split}) not found on server.",
    )
