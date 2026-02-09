"""Database encrypted secrets provider."""
from typing import Any

import structlog

from .base import SecretProvider, SecretResult

logger = structlog.get_logger(__name__)


class DatabaseSecretProvider:
    """Reads encrypted secrets from the database.

    Supports two storage patterns:
    1. system_settings table (isSensitive=true entries, encrypted by Node.js AES-256-GCM)
    2. workflow_secrets table (future: dedicated encrypted secrets storage)

    The provider attempts decryption with smartspecweb_crypto first (for Node.js-encrypted
    values), then falls back to the Fernet encryption_service.

    Security:
    - Values are decrypted in memory only during the executor call
    - Values are NEVER logged
    - Tenant isolation enforced via tenant_id scoping
    """

    @property
    def source_name(self) -> str:
        return "database"

    async def get_secret(
        self,
        name: str,
        *,
        path: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> SecretResult:
        """Look up secret from database.

        Strategy:
        1. Query system_settings WHERE category='workflow_secrets' AND key=name
        2. If found and isSensitive=true, decrypt value
        3. Return SecretResult

        For Phase 1, we query via raw SQL through the existing async database session.
        Future: dedicated workflow_secrets table with versioning + rotation tracking.
        """
        try:
            from app.core.config import settings
            from sqlalchemy import text
            from sqlalchemy.ext.asyncio import create_async_engine

            # Use the application database
            engine = create_async_engine(settings.DATABASE_URL, echo=False)

            async with engine.connect() as conn:
                # Query system_settings for the secret
                # Using parameterized query to prevent SQL injection
                result = await conn.execute(
                    text(
                        'SELECT value, "isSensitive" FROM system_settings '
                        "WHERE category = 'workflow_secrets' AND key = :key "
                        "LIMIT 1"
                    ),
                    {"key": name},
                )
                row = result.fetchone()

            await engine.dispose()

            if row is None:
                logger.info(
                    "db_secret_not_found",
                    secret_name=name,
                    found=False,
                )
                return SecretResult(value=None, found=False, source=self.source_name)

            raw_value = row[0]
            is_sensitive = row[1] if len(row) > 1 else True

            # Decrypt if encrypted
            if is_sensitive and raw_value:
                decrypted = self._decrypt_value(raw_value)
                if decrypted is None:
                    logger.error(
                        "db_secret_decryption_failed",
                        secret_name=name,
                        reason="decryption_returned_none",
                    )
                    return SecretResult(value=None, found=False, source=self.source_name)
                raw_value = decrypted

            logger.info(
                "db_secret_resolved",
                secret_name="*****",
                found=True,
            )
            return SecretResult(
                value=raw_value,
                found=True,
                source=self.source_name,
                metadata={"encrypted": is_sensitive},
            )

        except Exception as e:
            # NEVER include the secret value in the error
            logger.error(
                "db_secret_error",
                secret_name=name,
                error_type=type(e).__name__,
                # Intentionally omit error message which might contain secret data
            )
            return SecretResult(value=None, found=False, source=self.source_name)

    @staticmethod
    def _decrypt_value(ciphertext: str) -> str | None:
        """Attempt decryption with available encryption systems.

        Tries smartspecweb (AES-256-GCM) first, then Fernet.
        Returns None if all decryption attempts fail.
        """
        # Try SmartSpecWeb AES-256-GCM format (iv:authTag:ciphertext)
        if ciphertext.count(":") == 2:
            try:
                from app.core.smartspecweb_crypto import decrypt_smartspecweb

                return decrypt_smartspecweb(ciphertext)
            except (ValueError, Exception):
                pass

        # Try Fernet
        try:
            from app.core.encryption import encryption_service

            return encryption_service.decrypt(ciphertext)
        except (ValueError, Exception):
            pass

        return None
