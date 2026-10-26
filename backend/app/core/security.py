import logging
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.supabase import verify_supabase_token, verify_dataset_access

logger = logging.getLogger(__name__)

# Security scheme for FastAPI OpenAPI docs
security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    def __init__(
        self,
        user_id: str,
        email: str,
        role: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        token: Optional[str] = None,
    ):
        self.id = user_id
        self.email = email
        self.role = role or "authenticated"
        self.metadata = metadata or {}
        self.token = token

    def __repr__(self) -> str:
        return f"<AuthenticatedUser id={self.id} email={self.email}>"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> AuthenticatedUser:
    """
    FastAPI dependency to extract and verify Supabase JWT token.
    Throws 401 Unauthorized if missing, malformed, or invalid.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header with Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    user_data = verify_supabase_token(token)

    return AuthenticatedUser(
        user_id=user_data["id"],
        email=user_data.get("email", ""),
        role=user_data.get("role", "authenticated"),
        metadata=user_data.get("user_metadata", {}),
        token=token,
    )


def require_dataset_access(dataset_id: str, current_user: AuthenticatedUser) -> Dict[str, Any]:
    """
    Helper to check if the authenticated user has access to the specified dataset
    through their workspace ownership or membership.
    """
    return verify_dataset_access(user_id=current_user.id, dataset_id=dataset_id, token=current_user.token)

