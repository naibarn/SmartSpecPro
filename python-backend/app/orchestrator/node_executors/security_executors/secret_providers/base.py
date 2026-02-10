"""Base protocol and data structures for secret providers."""
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class SecretResult:
    """Result of a secret lookup.

    Attributes:
        value: The secret value (NEVER log this).
        found: Whether the secret was found.
        source: Which provider returned the secret (e.g. "environment", "database").
        metadata: Non-sensitive metadata about the secret (e.g. last_rotated, version).
    """

    value: str | None
    found: bool
    source: str
    metadata: dict[str, Any] | None = None


class SecretProvider(Protocol):
    """Protocol for secret storage backends.

    All implementations must:
    - NEVER log secret values
    - NEVER include secret values in error messages
    - Return SecretResult with found=False when secret doesn't exist
    """

    async def get_secret(
        self,
        name: str,
        *,
        path: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> SecretResult:
        """Retrieve a secret by name.

        Args:
            name: Secret identifier (e.g. "OPENAI_API_KEY")
            path: Optional path/namespace (for vault hierarchies)
            tenant_id: Tenant scope for multi-tenant isolation
            user_id: User scope for per-user secrets

        Returns:
            SecretResult with the value and metadata
        """
        ...

    @property
    def source_name(self) -> str:
        """Human-readable source name for audit logging."""
        ...
