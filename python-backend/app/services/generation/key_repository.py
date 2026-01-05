"""
SmartSpec Pro - Key Management Repository
Database operations for API keys with versioning support.
"""

from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from uuid import uuid4

from sqlalchemy import select, update, delete, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_key_v2 import (
    APIKeyV2, APIKeyVersion, KeyAuditLog, KeyMFAVerification,
    KeyRotationSchedule, KeyStatus, KeyVersionStatus, KeyAuditEventType
)


class KeyRepository:
    """
    Repository for API key database operations.
    
    Provides CRUD operations with proper transaction handling.
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    # =========================================================================
    # API KEY CRUD
    # =========================================================================
    
    async def create_key(
        self,
        user_id: str,
        name: str,
        key_prefix: str,
        scopes: List[str],
        project_id: Optional[str] = None,
        description: Optional[str] = None,
        rate_limit_per_minute: int = 60,
        rate_limit_per_day: int = 10000,
        expires_at: Optional[datetime] = None,
        rotation_enabled: bool = False,
        rotation_interval_days: int = 90,
        mfa_required_for_rotation: bool = True,
        metadata: Optional[dict] = None,
    ) -> APIKeyV2:
        """Create a new API key."""
        key = APIKeyV2(
            id=str(uuid4()),
            user_id=user_id,
            project_id=project_id,
            name=name,
            key_prefix=key_prefix,
            description=description,
            scopes=scopes,
            rate_limit_per_minute=rate_limit_per_minute,
            rate_limit_per_day=rate_limit_per_day,
            expires_at=expires_at,
            rotation_enabled=rotation_enabled,
            rotation_interval_days=rotation_interval_days,
            mfa_required_for_rotation=mfa_required_for_rotation,
            metadata=metadata or {},
        )
        
        # Set next rotation if enabled
        if rotation_enabled:
            key.next_rotation_at = datetime.utcnow() + timedelta(days=rotation_interval_days)
        
        self.session.add(key)
        await self.session.flush()
        
        return key
    
    async def get_key_by_id(
        self,
        key_id: str,
        include_versions: bool = False,
    ) -> Optional[APIKeyV2]:
        """Get API key by ID."""
        query = select(APIKeyV2).where(APIKeyV2.id == key_id)
        
        if include_versions:
            query = query.options(selectinload(APIKeyV2.versions))
        
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_keys_by_user(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        status: Optional[KeyStatus] = None,
        include_versions: bool = False,
    ) -> List[APIKeyV2]:
        """Get all keys for a user."""
        conditions = [APIKeyV2.user_id == user_id]
        
        if project_id:
            conditions.append(APIKeyV2.project_id == project_id)
        
        if status:
            conditions.append(APIKeyV2.status == status)
        
        query = select(APIKeyV2).where(and_(*conditions)).order_by(APIKeyV2.created_at.desc())
        
        if include_versions:
            query = query.options(selectinload(APIKeyV2.versions))
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def update_key(
        self,
        key_id: str,
        **updates,
    ) -> Optional[APIKeyV2]:
        """Update API key fields."""
        updates["updated_at"] = datetime.utcnow()
        
        await self.session.execute(
            update(APIKeyV2)
            .where(APIKeyV2.id == key_id)
            .values(**updates)
        )
        
        return await self.get_key_by_id(key_id)
    
    async def revoke_key(
        self,
        key_id: str,
        reason: Optional[str] = None,
    ) -> bool:
        """Revoke an API key and all its versions."""
        # Update key status
        await self.session.execute(
            update(APIKeyV2)
            .where(APIKeyV2.id == key_id)
            .values(
                status=KeyStatus.REVOKED,
                revoked_at=datetime.utcnow(),
                revoked_reason=reason,
                updated_at=datetime.utcnow(),
            )
        )
        
        # Deactivate all versions
        await self.session.execute(
            update(APIKeyVersion)
            .where(APIKeyVersion.api_key_id == key_id)
            .values(
                status=KeyVersionStatus.INACTIVE,
                deactivated_at=datetime.utcnow(),
            )
        )
        
        return True
    
    async def delete_key(self, key_id: str) -> bool:
        """Permanently delete an API key."""
        await self.session.execute(
            delete(APIKeyV2).where(APIKeyV2.id == key_id)
        )
        return True
    
    # =========================================================================
    # KEY VERSION CRUD
    # =========================================================================
    
    async def create_version(
        self,
        api_key_id: str,
        version: int,
        key_hash: str,
        encrypted_key: str,
        salt: str,
        is_primary: bool = True,
    ) -> APIKeyVersion:
        """Create a new key version."""
        status = KeyVersionStatus.PRIMARY if is_primary else KeyVersionStatus.INACTIVE
        
        key_version = APIKeyVersion(
            id=str(uuid4()),
            api_key_id=api_key_id,
            version=version,
            status=status,
            key_hash=key_hash,
            encrypted_key=encrypted_key,
            salt=salt,
        )
        
        self.session.add(key_version)
        await self.session.flush()
        
        return key_version
    
    async def get_version_by_hash(self, key_hash: str) -> Optional[APIKeyVersion]:
        """Get key version by hash."""
        query = (
            select(APIKeyVersion)
            .where(APIKeyVersion.key_hash == key_hash)
            .options(selectinload(APIKeyVersion.api_key))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_active_versions(self, api_key_id: str) -> List[APIKeyVersion]:
        """Get all active versions for a key."""
        query = (
            select(APIKeyVersion)
            .where(
                and_(
                    APIKeyVersion.api_key_id == api_key_id,
                    APIKeyVersion.status != KeyVersionStatus.INACTIVE,
                )
            )
            .order_by(APIKeyVersion.version.desc())
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def set_version_grace_period(
        self,
        version_id: str,
        grace_period_hours: int,
    ) -> APIKeyVersion:
        """Set grace period for a key version."""
        grace_ends = datetime.utcnow() + timedelta(hours=grace_period_hours)
        
        await self.session.execute(
            update(APIKeyVersion)
            .where(APIKeyVersion.id == version_id)
            .values(
                status=KeyVersionStatus.GRACE_PERIOD,
                grace_period_ends_at=grace_ends,
            )
        )
        
        query = select(APIKeyVersion).where(APIKeyVersion.id == version_id)
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def deactivate_version(self, version_id: str) -> bool:
        """Deactivate a key version."""
        await self.session.execute(
            update(APIKeyVersion)
            .where(APIKeyVersion.id == version_id)
            .values(
                status=KeyVersionStatus.INACTIVE,
                deactivated_at=datetime.utcnow(),
            )
        )
        return True
    
    async def cleanup_expired_grace_periods(self) -> int:
        """Deactivate versions with expired grace periods."""
        result = await self.session.execute(
            update(APIKeyVersion)
            .where(
                and_(
                    APIKeyVersion.status == KeyVersionStatus.GRACE_PERIOD,
                    APIKeyVersion.grace_period_ends_at < datetime.utcnow(),
                )
            )
            .values(
                status=KeyVersionStatus.INACTIVE,
                deactivated_at=datetime.utcnow(),
            )
        )
        return result.rowcount
    
    # =========================================================================
    # AUDIT LOG
    # =========================================================================
    
    async def log_event(
        self,
        event_type: KeyAuditEventType,
        user_id: str,
        api_key_id: Optional[str] = None,
        key_version: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        details: Optional[dict] = None,
        success: bool = True,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        risk_score: int = 0,
        is_suspicious: bool = False,
    ) -> KeyAuditLog:
        """Log an audit event."""
        log = KeyAuditLog(
            id=str(uuid4()),
            event_type=event_type,
            user_id=user_id,
            api_key_id=api_key_id,
            key_version=key_version,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            details=details or {},
            success=success,
            error_code=error_code,
            error_message=error_message,
            risk_score=risk_score,
            is_suspicious=is_suspicious,
        )
        
        self.session.add(log)
        await self.session.flush()
        
        return log
    
    async def get_audit_logs(
        self,
        user_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        event_type: Optional[KeyAuditEventType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        suspicious_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[KeyAuditLog], int]:
        """Get audit logs with filters."""
        conditions = []
        
        if user_id:
            conditions.append(KeyAuditLog.user_id == user_id)
        
        if api_key_id:
            conditions.append(KeyAuditLog.api_key_id == api_key_id)
        
        if event_type:
            conditions.append(KeyAuditLog.event_type == event_type)
        
        if start_date:
            conditions.append(KeyAuditLog.timestamp >= start_date)
        
        if end_date:
            conditions.append(KeyAuditLog.timestamp <= end_date)
        
        if suspicious_only:
            conditions.append(KeyAuditLog.is_suspicious == True)
        
        # Count total
        count_query = select(func.count(KeyAuditLog.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        count_result = await self.session.execute(count_query)
        total = count_result.scalar()
        
        # Get logs
        query = select(KeyAuditLog)
        if conditions:
            query = query.where(and_(*conditions))
        query = query.order_by(KeyAuditLog.timestamp.desc()).limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        logs = list(result.scalars().all())
        
        return logs, total
    
    async def count_recent_events(
        self,
        user_id: str,
        event_type: KeyAuditEventType,
        hours: int = 1,
    ) -> int:
        """Count recent events of a type for rate limiting."""
        since = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(func.count(KeyAuditLog.id)).where(
            and_(
                KeyAuditLog.user_id == user_id,
                KeyAuditLog.event_type == event_type,
                KeyAuditLog.timestamp >= since,
            )
        )
        
        result = await self.session.execute(query)
        return result.scalar() or 0
    
    # =========================================================================
    # MFA VERIFICATION
    # =========================================================================
    
    async def create_mfa_challenge(
        self,
        user_id: str,
        operation: str,
        challenge_token: str,
        challenge_type: str,
        expires_in_minutes: int = 10,
        api_key_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> KeyMFAVerification:
        """Create an MFA challenge."""
        verification = KeyMFAVerification(
            id=str(uuid4()),
            user_id=user_id,
            api_key_id=api_key_id,
            operation=operation,
            challenge_token=challenge_token,
            challenge_type=challenge_type,
            challenge_expires_at=datetime.utcnow() + timedelta(minutes=expires_in_minutes),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        self.session.add(verification)
        await self.session.flush()
        
        return verification
    
    async def get_mfa_challenge(self, challenge_token: str) -> Optional[KeyMFAVerification]:
        """Get MFA challenge by token."""
        query = select(KeyMFAVerification).where(
            KeyMFAVerification.challenge_token == challenge_token
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def verify_mfa_challenge(self, challenge_token: str) -> bool:
        """Mark MFA challenge as verified."""
        await self.session.execute(
            update(KeyMFAVerification)
            .where(KeyMFAVerification.challenge_token == challenge_token)
            .values(
                verified=True,
                verified_at=datetime.utcnow(),
            )
        )
        return True
    
    async def increment_mfa_attempts(self, challenge_token: str) -> int:
        """Increment MFA attempt counter."""
        query = select(KeyMFAVerification).where(
            KeyMFAVerification.challenge_token == challenge_token
        )
        result = await self.session.execute(query)
        verification = result.scalar_one_or_none()
        
        if verification:
            verification.attempts += 1
            await self.session.flush()
            return verification.attempts
        
        return 0
    
    async def cleanup_expired_mfa_challenges(self) -> int:
        """Delete expired MFA challenges."""
        result = await self.session.execute(
            delete(KeyMFAVerification).where(
                KeyMFAVerification.challenge_expires_at < datetime.utcnow()
            )
        )
        return result.rowcount
    
    # =========================================================================
    # ROTATION SCHEDULE
    # =========================================================================
    
    async def schedule_rotation(
        self,
        api_key_id: str,
        scheduled_at: datetime,
    ) -> KeyRotationSchedule:
        """Schedule a key rotation."""
        schedule = KeyRotationSchedule(
            id=str(uuid4()),
            api_key_id=api_key_id,
            scheduled_at=scheduled_at,
        )
        
        self.session.add(schedule)
        await self.session.flush()
        
        return schedule
    
    async def get_pending_rotations(
        self,
        before: Optional[datetime] = None,
    ) -> List[KeyRotationSchedule]:
        """Get pending rotation schedules."""
        conditions = [KeyRotationSchedule.executed == False]
        
        if before:
            conditions.append(KeyRotationSchedule.scheduled_at <= before)
        
        query = (
            select(KeyRotationSchedule)
            .where(and_(*conditions))
            .order_by(KeyRotationSchedule.scheduled_at)
        )
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_keys_needing_notification(
        self,
        notify_before_days: int = 7,
    ) -> List[APIKeyV2]:
        """Get keys that need rotation notification."""
        notify_threshold = datetime.utcnow() + timedelta(days=notify_before_days)
        
        query = (
            select(APIKeyV2)
            .where(
                and_(
                    APIKeyV2.rotation_enabled == True,
                    APIKeyV2.status == KeyStatus.ACTIVE,
                    APIKeyV2.next_rotation_at <= notify_threshold,
                    APIKeyV2.next_rotation_at > datetime.utcnow(),
                )
            )
        )
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def mark_rotation_executed(
        self,
        schedule_id: str,
        success: bool,
        new_version: Optional[int] = None,
        error: Optional[str] = None,
    ) -> bool:
        """Mark a rotation schedule as executed."""
        await self.session.execute(
            update(KeyRotationSchedule)
            .where(KeyRotationSchedule.id == schedule_id)
            .values(
                executed=True,
                executed_at=datetime.utcnow(),
                execution_result="success" if success else "failed",
                execution_error=error,
                new_version=new_version,
            )
        )
        return True
