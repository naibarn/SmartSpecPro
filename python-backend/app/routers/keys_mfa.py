"""
SmartSpec Pro - Key MFA Router
Endpoints for MFA setup and verification for key operations.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.generation.key_mfa import (
    get_key_mfa_service,
    MFAType,
    MFAOperation,
)

router = APIRouter(prefix="/keys/mfa", tags=["API Keys MFA"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class SetupTOTPResponse(BaseModel):
    """Response from TOTP setup."""
    secret: str
    provisioning_uri: str
    backup_codes: List[str]
    message: str


class VerifySetupRequest(BaseModel):
    """Request to verify TOTP setup."""
    code: str = Field(..., min_length=6, max_length=6)


class CreateChallengeRequest(BaseModel):
    """Request to create MFA challenge."""
    operation: str = Field(..., description="Operation: rotate, revoke, delete, change_scopes")
    api_key_id: Optional[str] = None
    mfa_type: str = Field(default="totp", description="MFA type: totp, email, backup_code")


class ChallengeResponse(BaseModel):
    """MFA challenge response."""
    challenge_token: str
    challenge_type: str
    expires_at: str
    message: str


class VerifyChallengeRequest(BaseModel):
    """Request to verify MFA challenge."""
    challenge_token: str
    code: str = Field(..., min_length=6, max_length=8)


class VerifyResponse(BaseModel):
    """MFA verification response."""
    verified: bool
    error: Optional[str] = None
    attempts_remaining: Optional[int] = None


class BackupCodesResponse(BaseModel):
    """Backup codes response."""
    backup_codes: List[str]
    message: str = "Store these codes securely. Each code can only be used once."


class MFAStatusResponse(BaseModel):
    """MFA status response."""
    totp_enabled: bool
    backup_codes_remaining: int


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def parse_operation(operation: str) -> MFAOperation:
    """Parse operation string to enum."""
    try:
        return MFAOperation(operation)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid operation: {operation}. Valid: rotate, revoke, delete, change_scopes",
        )


def parse_mfa_type(mfa_type: str) -> MFAType:
    """Parse MFA type string to enum."""
    try:
        return MFAType(mfa_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MFA type: {mfa_type}. Valid: totp, email, backup_code",
        )


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/status", response_model=MFAStatusResponse)
async def get_mfa_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get MFA status for current user."""
    service = get_key_mfa_service(db)
    
    totp_enabled = await service.has_totp_enabled(current_user.id)
    backup_codes_remaining = await service.get_remaining_backup_codes_count(current_user.id)
    
    return MFAStatusResponse(
        totp_enabled=totp_enabled,
        backup_codes_remaining=backup_codes_remaining,
    )


@router.post("/totp/setup", response_model=SetupTOTPResponse)
async def setup_totp(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Set up TOTP (Time-based One-Time Password) for key operations.
    
    Returns a secret and QR code URI for authenticator apps.
    Store the backup codes securely - they can be used if you lose access to your authenticator.
    """
    service = get_key_mfa_service(db)
    
    result = await service.setup_totp(
        user_id=current_user.id,
        email=current_user.email,
    )
    
    return SetupTOTPResponse(**result)


@router.post("/totp/verify-setup", response_model=VerifyResponse)
async def verify_totp_setup(
    data: VerifySetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify TOTP setup with a code from your authenticator app.
    
    This confirms that TOTP is correctly configured.
    """
    service = get_key_mfa_service(db)
    
    verified = await service.verify_totp_setup(
        user_id=current_user.id,
        code=data.code,
    )
    
    if verified:
        return VerifyResponse(verified=True)
    else:
        return VerifyResponse(
            verified=False,
            error="Invalid verification code. Please try again.",
        )


@router.post("/challenge", response_model=ChallengeResponse)
async def create_mfa_challenge(
    request: Request,
    data: CreateChallengeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create an MFA challenge for a sensitive key operation.
    
    Returns a challenge token that must be verified before the operation can proceed.
    """
    service = get_key_mfa_service(db)
    
    operation = parse_operation(data.operation)
    mfa_type = parse_mfa_type(data.mfa_type)
    
    # Check if user has TOTP enabled for TOTP type
    if mfa_type == MFAType.TOTP:
        has_totp = await service.has_totp_enabled(current_user.id)
        if not has_totp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP is not set up. Please set up TOTP first.",
            )
    
    challenge = await service.create_challenge(
        user_id=current_user.id,
        operation=operation,
        mfa_type=mfa_type,
        api_key_id=data.api_key_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    
    return ChallengeResponse(
        challenge_token=challenge.challenge_token,
        challenge_type=challenge.challenge_type.value,
        expires_at=challenge.expires_at.isoformat(),
        message=challenge.message,
    )


@router.post("/verify", response_model=VerifyResponse)
async def verify_mfa_challenge(
    request: Request,
    data: VerifyChallengeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify an MFA challenge.
    
    After successful verification, the challenge token can be used
    to authorize the sensitive operation.
    """
    service = get_key_mfa_service(db)
    
    result = await service.verify_challenge(
        challenge_token=data.challenge_token,
        code=data.code,
        ip_address=get_client_ip(request),
    )
    
    return VerifyResponse(
        verified=result.verified,
        error=result.error,
        attempts_remaining=result.attempts_remaining,
    )


@router.post("/backup-codes/regenerate", response_model=BackupCodesResponse)
async def regenerate_backup_codes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate backup codes.
    
    This invalidates all existing backup codes and generates new ones.
    Store these codes securely - they can be used if you lose access to your authenticator.
    """
    service = get_key_mfa_service(db)
    
    # Verify user has TOTP enabled
    has_totp = await service.has_totp_enabled(current_user.id)
    if not has_totp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP must be set up before generating backup codes.",
        )
    
    backup_codes = await service.regenerate_backup_codes(current_user.id)
    
    return BackupCodesResponse(backup_codes=backup_codes)


@router.get("/backup-codes/count")
async def get_backup_codes_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the number of remaining backup codes."""
    service = get_key_mfa_service(db)
    
    count = await service.get_remaining_backup_codes_count(current_user.id)
    
    return {"remaining": count}
