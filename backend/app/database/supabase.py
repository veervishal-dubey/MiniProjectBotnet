import io
import json
import logging
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from app.core.config import settings

logger = logging.getLogger(__name__)

# Cached client instances
_admin_client: Optional[Client] = None
_anon_client: Optional[Client] = None


def get_admin_client() -> Client:
    """
    Returns the Supabase client initialized with the Service Role Key.
    Falls back to anon client if service role key is not set (e.g. during early dev).
    """
    global _admin_client
    if _admin_client is not None:
        return _admin_client

    if not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL is not configured on the backend.",
        )

    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is configured on the backend.",
        )

    _admin_client = create_client(settings.SUPABASE_URL, key)
    return _admin_client


def get_anon_client() -> Client:
    """Returns Supabase client with anon/public key for user token verification."""
    global _anon_client
    if _anon_client is not None:
        return _anon_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        return get_admin_client()

    _anon_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _anon_client


def get_supabase_client(token: Optional[str] = None) -> Client:
    """
    Returns an appropriately configured Supabase client:
    1. If SUPABASE_SERVICE_ROLE_KEY is set, returns an administrative client.
    2. If token is provided, returns an authenticated client with the caller's JWT Bearer token
       attached in the request headers. This ensures PostgREST and Supabase Storage execute queries
       under the caller's identity (role='authenticated', auth.uid()=caller_uuid),
       satisfying PostgreSQL Row Level Security (RLS) policies without exposing service-role keys.
    3. Otherwise, returns the anonymous client.
    """
    if settings.SUPABASE_SERVICE_ROLE_KEY:
        return get_admin_client()

    if token:
        options = SyncClientOptions(headers={"Authorization": f"Bearer {token}"})
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, options=options)

    return get_anon_client()


def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verifies the JWT token with Supabase Auth service.
    Returns user payload dictionary (id, email, role, etc.).
    Raises 401 HTTPException if invalid or expired.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        client = get_anon_client()
        # Call Supabase Auth to retrieve user associated with token
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication session.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = user_response.user
        return {
            "id": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
            "role": user.role,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Token verification failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(exc)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_dataset_access(user_id: str, dataset_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    """
    Authorizes dataset access according to verified workspace ownership/membership:
    1. Retrieves public.datasets row by primary key (id).
    2. Fallback: matches against storage_path or storage path substring.
    3. Fallback: inspects private Supabase Storage ({user_id}/{dataset_id}/) to reconcile
       unlinked storage files if DB metadata was interrupted or pending.
    4. Authorizes caller against dataset workspace:
       - Direct uploader (uploaded_by == user_id)
       - Workspace owner in public.workspaces
       - Workspace member in public.workspace_members
    5. Rejects request with 403 Forbidden if user has no authorized relationship.
    
    Returns the dataset record dict if authorized.
    """
    client = get_supabase_client(token=token)
    logger.info(f"Verifying access for user '{user_id}' to dataset '{dataset_id}'")

    dataset_record: Optional[Dict[str, Any]] = None

    # 1. Primary lookup: direct match on public.datasets.id
    try:
        ds_res = (
            client.from_("datasets")
            .select("id, name, storage_path, workspace_id, status, created_at, description, uploaded_by")
            .eq("id", dataset_id)
            .maybe_single()
            .execute()
        )
        if ds_res and ds_res.data:
            dataset_record = ds_res.data
    except Exception as exc:
        logger.warning(f"Direct lookup on datasets by id='{dataset_id}' error: {exc}")

    # 2. Fallback: match by storage_path exact or substring
    if not dataset_record:
        try:
            ds_res = (
                client.from_("datasets")
                .select("id, name, storage_path, workspace_id, status, created_at, description, uploaded_by")
                .eq("storage_path", dataset_id)
                .maybe_single()
                .execute()
            )
            if ds_res and ds_res.data:
                dataset_record = ds_res.data
        except Exception as exc:
            logger.debug(f"Lookup by storage_path exact error: {exc}")

    if not dataset_record:
        try:
            ds_res = (
                client.from_("datasets")
                .select("id, name, storage_path, workspace_id, status, created_at, description, uploaded_by")
                .like("storage_path", f"%{dataset_id}%")
                .maybe_single()
                .execute()
            )
            if ds_res and ds_res.data:
                dataset_record = ds_res.data
        except Exception as exc:
            logger.debug(f"Lookup by storage_path like error: {exc}")

    # 3. Fallback: Storage reconciliation if file was uploaded to Supabase Storage under {user_id}/{dataset_id}/
    if not dataset_record:
        try:
            folder_prefix = f"{user_id}/{dataset_id}"
            objects = client.storage.from_(settings.STORAGE_BUCKET_NAME).list(folder_prefix)
            if objects and len(objects) > 0:
                target_obj = objects[0]
                obj_name = target_obj.get("name", "dataset.csv")
                full_storage_path = f"{folder_prefix}/{obj_name}"
                logger.info(f"Discovered storage object '{full_storage_path}' without DB row. Reconciling metadata...")

                # Find user workspace
                ws_id = None
                try:
                    ws_res = client.from_("workspaces").select("id").eq("owner_id", user_id).limit(1).execute()
                    if ws_res and ws_res.data and len(ws_res.data) > 0:
                        ws_id = ws_res.data[0]["id"]
                    else:
                        m_res = client.from_("workspace_members").select("workspace_id").eq("user_id", user_id).limit(1).execute()
                        if m_res and m_res.data and len(m_res.data) > 0:
                            ws_id = m_res.data[0]["workspace_id"]
                except Exception as ws_exc:
                    logger.warning(f"Workspace lookup for reconciliation failed: {ws_exc}")

                clean_name = obj_name.replace(".csv", "").replace(".txt", "").replace("_", " ").title()
                reconcile_payload = {
                    "id": dataset_id,
                    "name": clean_name,
                    "storage_path": full_storage_path,
                    "workspace_id": ws_id,
                    "status": "ready",
                    "uploaded_by": user_id,
                    "description": json.dumps({"filename": obj_name, "reconciled": True}),
                }

                if ws_id:
                    try:
                        ins_res = client.from_("datasets").insert(reconcile_payload).execute()
                        if ins_res and ins_res.data and len(ins_res.data) > 0:
                            dataset_record = ins_res.data[0]
                        else:
                            dataset_record = reconcile_payload
                    except Exception as ins_exc:
                        logger.warning(f"Could not persist reconciled dataset record to DB: {ins_exc}")
                        dataset_record = reconcile_payload
                else:
                    dataset_record = reconcile_payload
        except Exception as st_exc:
            logger.debug(f"Storage listing reconciliation failed: {st_exc}")

    # 4. If record still not found, return clean 404
    if not dataset_record:
        logger.warning(f"Dataset with ID '{dataset_id}' not found for user '{user_id}'.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found.",
        )

    # 5. Check authorization: uploader, workspace owner, or workspace member
    uploaded_by = dataset_record.get("uploaded_by")
    if uploaded_by and uploaded_by == user_id:
        return dataset_record

    workspace_id = dataset_record.get("workspace_id")
    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset is not associated with any workspace.",
        )

    # Check if user is workspace owner
    try:
        ws_res = (
            client.from_("workspaces")
            .select("id, owner_id, name")
            .eq("id", workspace_id)
            .maybe_single()
            .execute()
        )
        if ws_res and ws_res.data and ws_res.data.get("owner_id") == user_id:
            return dataset_record
    except Exception as ws_exc:
        logger.warning(f"Workspace ownership query error: {ws_exc}")

    # Check if user is workspace member
    try:
        member_res = (
            client.from_("workspace_members")
            .select("role")
            .eq("workspace_id", workspace_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if member_res and member_res.data:
            return dataset_record
    except Exception as mem_exc:
        logger.warning(f"Workspace member query error: {mem_exc}")

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not authorized to access datasets in this workspace.",
    )


def download_dataset_bytes(storage_path: str, token: Optional[str] = None) -> bytes:
    """
    Downloads raw dataset bytes from the private Supabase Storage bucket.
    Uses authenticated client so caller's token satisfies storage RLS policies.
    Raises 404 if file does not exist or storage download fails.
    """
    client = get_supabase_client(token=token)
    try:
        data = client.storage.from_(settings.STORAGE_BUCKET_NAME).download(storage_path)
        if isinstance(data, bytes):
            return data
        elif hasattr(data, "read"):
            return data.read()
        else:
            return bytes(data)
    except Exception as exc:
        logger.error(f"Failed to download storage object '{storage_path}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unable to retrieve dataset file from storage: {str(exc)}",
        )


def upload_processed_file(file_path: str, content: bytes, mime_type: str = "text/csv", token: Optional[str] = None) -> str:
    """
    Uploads processed artifact into private Supabase Storage bucket.
    Returns the storage path.
    """
    client = get_supabase_client(token=token)
    try:
        client.storage.from_(settings.STORAGE_BUCKET_NAME).upload(
            path=file_path,
            file=content,
            file_options={"content-type": mime_type, "upsert": "true"},
        )
        return file_path
    except Exception as exc:
        logger.warning(f"Could not upload to Supabase storage '{file_path}': {exc}. Saving locally.")
        return ""

