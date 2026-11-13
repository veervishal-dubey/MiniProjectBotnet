import logging
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, status

from app.schemas.logs import LogListResponse, CreateLogRequest, LogEntrySchema
from app.services.audit_service import audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/logs", tags=["System Audit Logs"])


@router.get("", response_model=LogListResponse)
async def get_audit_logs(
    query: Optional[str] = Query(default=None, description="Free-text search across message, component, or category"),
    severity: Optional[str] = Query(default=None, description="Severity filter (ALL, INFO, WARN, ERROR, DEBUG)"),
    category: Optional[str] = Query(default=None, description="Category filter (ALL, SYSTEM, DATASET, PREPROCESSING, TRAINING, FEDERATED, DETECTION)"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
):
    """
    Retrieves filtered audit logs from the durable SQLite ledger.
    Supports substring search, category filtering, severity filtering, and pagination.
    """
    try:
        logs, total, cat_counts, sev_counts = audit_service.get_logs(
            query=query,
            severity=severity,
            category=category,
            limit=limit,
            offset=offset,
        )
        return LogListResponse(
            logs=[LogEntrySchema(**item) for item in logs],
            total=total,
            limit=limit,
            offset=offset,
            categories_count=cat_counts,
            severities_count=sev_counts,
        )
    except Exception as exc:
        logger.error(f"Error fetching audit logs: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not retrieve audit logs: {str(exc)}",
        )


@router.post("", response_model=LogEntrySchema, status_code=status.HTTP_201_CREATED)
async def create_audit_log(payload: CreateLogRequest):
    """
    Records an application or client-side event into the durable audit ledger.
    """
    try:
        event = audit_service.record_event(
            severity=payload.severity,
            category=payload.category,
            message=payload.message,
            component=payload.component,
            details=payload.details,
            experiment_id=payload.experimentId,
        )
        return LogEntrySchema(**event)
    except Exception as exc:
        logger.error(f"Error recording audit log: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not record audit log: {str(exc)}",
        )


@router.delete("", status_code=status.HTTP_200_OK)
async def clear_audit_logs():
    """
    Clears all recorded audit logs.
    """
    try:
        count = audit_service.clear_logs()
        return {"status": "cleared", "deleted_count": count}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not clear audit logs: {str(exc)}",
        )

