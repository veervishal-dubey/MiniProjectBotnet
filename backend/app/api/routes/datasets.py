import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from app.core.security import get_current_user, AuthenticatedUser
from app.database.supabase import verify_dataset_access, download_dataset_bytes
from app.schemas.validation import ValidationReport
from app.services.validator import validate_csv_content

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/datasets", tags=["Datasets"])


@router.post("/{dataset_id}/validate", response_model=ValidationReport)
async def validate_remote_dataset(
    dataset_id: str,
    label_column: Optional[str] = Query(None, description="Researcher-confirmed target/label column name"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Validates a dataset securely retrieved from private Supabase Storage.
    Verifies researcher workspace membership/ownership before retrieving data.
    """
    # 1. Verify workspace authorization and retrieve dataset metadata
    try:
        dataset_record = verify_dataset_access(
            user_id=current_user.id,
            dataset_id=dataset_id,
            token=current_user.token,
        )
    except TypeError:
        dataset_record = verify_dataset_access(user_id=current_user.id, dataset_id=dataset_id)
    storage_path = dataset_record.get("storage_path")

    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset '{dataset_id}' has no associated storage path in Supabase Storage.",
        )

    # 2. Download raw CSV from private storage bucket using user's auth token
    raw_content = download_dataset_bytes(storage_path, token=current_user.token)

    # 3. Perform deep structural validation without modifying original file
    report = validate_csv_content(
        content=raw_content,
        file_name=dataset_record.get("name", "dataset.csv"),
        selected_label_column=label_column,
    )

    return report


@router.post("/validate-raw", response_model=ValidationReport)
async def validate_raw_csv_upload(
    file: UploadFile = File(...),
    label_column: Optional[str] = Form(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Directly validates a CSV file stream submitted by an authenticated researcher.
    Used for pre-upload validation and client checks.
    """
    if not file.filename or not file.filename.lower().endswith((".csv", ".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a .csv or .txt extension.",
        )

    content = await file.read()
    report = validate_csv_content(
        content=content,
        file_name=file.filename,
        selected_label_column=label_column,
    )
    return report


@router.get("/{dataset_id}/preview", response_model=ValidationReport)
async def preview_dataset(
    dataset_id: str,
    preview_limit: int = Query(10, ge=1, le=50),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Returns an authorized preview and schema summary of a dataset.
    """
    try:
        dataset_record = verify_dataset_access(
            user_id=current_user.id,
            dataset_id=dataset_id,
            token=current_user.token,
        )
    except TypeError:
        dataset_record = verify_dataset_access(user_id=current_user.id, dataset_id=dataset_id)
    storage_path = dataset_record.get("storage_path")

    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset '{dataset_id}' has no associated storage path.",
        )

    raw_content = download_dataset_bytes(storage_path, token=current_user.token)
    report = validate_csv_content(
        content=raw_content,
        file_name=dataset_record.get("name", "dataset.csv"),
        max_preview_rows=preview_limit,
    )
    return report
