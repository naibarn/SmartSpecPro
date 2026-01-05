"""
SmartSpec Pro - Authenticated Storage Router
API endpoints for R2 storage with API key authentication.
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.generation.authenticated_storage import (
    AuthenticatedStorageService,
    get_authenticated_storage,
)

router = APIRouter(prefix="/v2/storage", tags=["Storage API v2"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class UploadResponse(BaseModel):
    """File upload response."""
    success: bool
    url: Optional[str] = None
    key: Optional[str] = None
    size: Optional[int] = None
    content_type: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None


class UploadFromUrlRequest(BaseModel):
    """Request to upload from URL."""
    source_url: str = Field(..., description="URL to download from")
    key: str = Field(..., description="Storage key (path in R2)")
    content_type: Optional[str] = Field(default=None, description="MIME type")


class PresignedUrlRequest(BaseModel):
    """Request for presigned URL."""
    key: str = Field(..., description="Storage key")
    expires_in: int = Field(default=3600, ge=60, le=86400, description="URL expiration in seconds")
    method: str = Field(default="get_object", description="get_object for download, put_object for upload")


class PresignedUrlResponse(BaseModel):
    """Presigned URL response."""
    success: bool
    url: Optional[str] = None
    expires_in: Optional[int] = None
    error: Optional[str] = None
    message: Optional[str] = None


class DeleteResponse(BaseModel):
    """File delete response."""
    success: bool
    key: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None


class UsageInfoResponse(BaseModel):
    """Storage usage info response."""
    success: bool
    usage: Optional[dict] = None
    quota: Optional[dict] = None
    usage_percent: Optional[float] = None
    error: Optional[str] = None
    message: Optional[str] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
) -> str:
    """Extract API key from headers."""
    if x_api_key:
        return x_api_key
    
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="API key required. Provide via X-API-Key header or Authorization: Bearer <key>",
    )


# =============================================================================
# UPLOAD ENDPOINTS
# =============================================================================

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    key: Optional[str] = None,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a file to R2 storage.
    
    Requires API key with `storage:write` scope.
    If `key` is not provided, a unique key will be generated.
    """
    import tempfile
    import os
    from uuid import uuid4
    
    service = get_authenticated_storage(db)
    
    # Generate key if not provided
    if not key:
        ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
        key = f"uploads/{uuid4()}.{ext}"
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        result = await service.upload_file(
            api_key=api_key,
            file_path=tmp_path,
            key=key,
            content_type=file.content_type,
            ip_address=get_client_ip(request),
        )
    finally:
        os.unlink(tmp_path)
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "rate_limited":
            raise HTTPException(status_code=429, detail=result["message"])
        elif result["error"] == "quota_exceeded":
            raise HTTPException(status_code=413, detail=result)
        elif result["error"] == "file_too_large":
            raise HTTPException(status_code=413, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return UploadResponse(**result)


@router.post("/upload-from-url", response_model=UploadResponse)
async def upload_from_url(
    request: Request,
    data: UploadFromUrlRequest,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Download from URL and upload to R2 storage.
    
    Requires API key with `storage:write` scope.
    """
    service = get_authenticated_storage(db)
    
    result = await service.upload_from_url(
        api_key=api_key,
        source_url=data.source_url,
        key=data.key,
        content_type=data.content_type,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "rate_limited":
            raise HTTPException(status_code=429, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return UploadResponse(**result)


# =============================================================================
# DOWNLOAD ENDPOINTS
# =============================================================================

@router.post("/presigned-url", response_model=PresignedUrlResponse)
async def get_presigned_url(
    request: Request,
    data: PresignedUrlRequest,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a presigned URL for upload or download.
    
    Requires API key with `storage:read` (for download) or `storage:write` (for upload) scope.
    """
    service = get_authenticated_storage(db)
    
    result = await service.generate_presigned_url(
        api_key=api_key,
        key=data.key,
        expires_in=data.expires_in,
        method=data.method,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return PresignedUrlResponse(**result)


# =============================================================================
# DELETE ENDPOINTS
# =============================================================================

@router.delete("/files/{key:path}", response_model=DeleteResponse)
async def delete_file(
    request: Request,
    key: str,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a file from R2 storage.
    
    Requires API key with `storage:delete` scope.
    """
    service = get_authenticated_storage(db)
    
    result = await service.delete_file(
        api_key=api_key,
        key=key,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "delete_failed":
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return DeleteResponse(**result)


# =============================================================================
# USAGE ENDPOINTS
# =============================================================================

@router.get("/usage", response_model=UsageInfoResponse)
async def get_storage_usage(
    request: Request,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Get storage usage information.
    
    Requires API key with `storage:read` scope.
    """
    service = get_authenticated_storage(db)
    
    result = await service.get_usage_info(
        api_key=api_key,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return UsageInfoResponse(**result)
