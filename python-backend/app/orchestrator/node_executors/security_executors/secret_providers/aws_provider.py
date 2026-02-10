"""AWS Secrets Manager provider (Phase 2 stub)."""
import structlog

from .base import SecretResult

logger = structlog.get_logger(__name__)


class AwsSecretsProvider:
    """AWS Secrets Manager secret provider.

    Phase 2 stub - not yet implemented.
    When implemented, will support:
    - GetSecretValue API
    - IAM role-based authentication
    - Automatic rotation detection
    - Cross-region failover
    """

    @property
    def source_name(self) -> str:
        return "aws_secrets"

    async def get_secret(
        self,
        name: str,
        *,
        path: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> SecretResult:
        logger.warning(
            "aws_secrets_provider_not_implemented",
            secret_name=name,
            message="AWS Secrets Manager integration is not yet available (Phase 2)",
        )
        return SecretResult(
            value=None,
            found=False,
            source=self.source_name,
            metadata={"status": "not_implemented", "phase": 2},
        )
