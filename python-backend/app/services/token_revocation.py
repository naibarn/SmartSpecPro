"""Shared PostgreSQL-backed JWT revocation checks."""

from hashlib import sha256
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, String, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base


class RevokedTokenJti(Base):
    """Shared Web/Python JWT revocation record; only the JTI digest is stored."""

    __tablename__ = "revoked_token_jtis"

    jti_hash = Column(String(64), primary_key=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("revoked_token_jtis_expires_at_idx", "expires_at"),)

def hash_jti(jti: str) -> str:
    """Return the SHA-256 digest used by the Web revocation store."""
    if not isinstance(jti, str) or not jti or len(jti.encode("utf-8")) > 512:
        raise ValueError("Invalid token identifier")
    return sha256(jti.encode("utf-8")).hexdigest()


async def is_jti_revoked(db: AsyncSession, jti: str) -> bool:
    """Check the canonical shared revocation table; database errors propagate."""
    try:
        digest = hash_jti(jti)
    except ValueError:
        # Match the Web auth contract: malformed identifiers never authorize.
        return True
    result = await db.execute(
        text(
            "SELECT EXISTS ("
            "SELECT 1 FROM revoked_token_jtis "
            "WHERE jti_hash = :jti_hash "
            "AND (expires_at IS NULL OR expires_at > :now)"
            ")"
        ),
        {"jti_hash": digest, "now": datetime.now(timezone.utc)},
    )
    return bool(result.scalar_one())


async def revoke_jti(db: AsyncSession, jti: str, expires_at: datetime | None) -> None:
    """Persist a token revocation in the shared PostgreSQL authority.

    Repeated writes are idempotent. A permanent revoke stays permanent, and a
    later expiry can never shorten an existing revocation window.
    """
    digest = hash_jti(jti)
    await db.execute(
        text(
            "INSERT INTO revoked_token_jtis (jti_hash, expires_at) "
            "VALUES (:jti_hash, :expires_at) "
            "ON CONFLICT (jti_hash) DO UPDATE SET expires_at = CASE "
            "WHEN revoked_token_jtis.expires_at IS NULL OR excluded.expires_at IS NULL THEN NULL "
            "WHEN excluded.expires_at > revoked_token_jtis.expires_at THEN excluded.expires_at "
            "ELSE revoked_token_jtis.expires_at END"
        ),
        {"jti_hash": digest, "expires_at": expires_at},
    )
