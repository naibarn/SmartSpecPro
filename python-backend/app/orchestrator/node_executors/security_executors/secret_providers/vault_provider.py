"""HashiCorp Vault secret provider (Phase 2 stub)."""
import structlog

from .base import SecretResult

logger = structlog.get_logger(__name__)


class VaultSecretProvider:
    """HashiCorp Vault secret provider.

    Phase 2 stub - not yet implemented.
    When implemented, will support:
    - KV v2 secret engine
    - AppRole or Token authentication
    - Secret leasing and renewal
    - Dynamic secrets (database credentials)
    """

    @property
    def source_name(self) -> str:
        return "vault"

    async def get_secret(
        self,
        name: str,
        *,
        path: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> SecretResult:
        logger.warning(
            "vault_provider_not_implemented",
            secret_name=name,
            vault_path=path,
            message="HashiCorp Vault integration is not yet available (Phase 2)",
        )
        return SecretResult(
            value=None,
            found=False,
            source=self.source_name,
            metadata={"status": "not_implemented", "phase": 2},
        )
