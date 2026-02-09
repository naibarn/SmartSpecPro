"""Secrets Vault Executor - Retrieve secrets from multiple providers.

Supports environment variables, encrypted database storage, and external vault
integrations. Secrets are never exposed in logs or error messages.
"""
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.security_executors.secret_providers import (
    AwsSecretsProvider,
    DatabaseSecretProvider,
    EnvironmentSecretProvider,
    SecretProvider,
    SecretResult,
    VaultSecretProvider,
)

logger = structlog.get_logger()


class SecretsVaultExecutor:
    """Executor for secrets_vault nodes.

    Retrieves secrets from configurable providers (environment, database, vault, AWS).
    Supports fallback chains and default values. All secret values are masked in logs.

    Output ports:
        - secretValue (text): The retrieved secret value (masked in SSE events)
        - found (boolean): Whether the secret was found
        - source (text): Which provider returned the secret
    """

    def __init__(self) -> None:
        """Initialize the secrets vault executor with all providers."""
        self._providers: dict[str, SecretProvider] = {
            "environment": EnvironmentSecretProvider(),
            "database": DatabaseSecretProvider(),
            "vault": VaultSecretProvider(),
            "aws": AwsSecretsProvider(),
        }

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute secret retrieval from configured providers.

        Args:
            data: Node execution data with inputs containing:
                - secretName: Name/key of the secret to retrieve
                - provider: Which provider to use (environment, database, vault, aws)
                - defaultValue: Optional fallback if secret not found
                - path: Optional path/namespace for hierarchical providers
            context: Execution context with tenant_id and user_id for scoping.

        Returns:
            Dictionary with:
              - secretValue: The secret value (or defaultValue if not found)
              - found: Whether the secret was found
              - source: Which provider returned the secret

        Raises:
            ValueError: If secretName is missing or provider is invalid.
        """
        secret_name = data.inputs.get("secretName")
        provider_name = data.inputs.get("provider", "environment")
        default_value = data.inputs.get("defaultValue")
        path = data.inputs.get("path")

        # Validation
        if not secret_name or not isinstance(secret_name, str):
            raise ValueError("secretName is required and must be a non-empty string")

        if provider_name not in self._providers:
            raise ValueError(
                f"Invalid provider '{provider_name}'. "
                f"Must be one of: {', '.join(self._providers.keys())}"
            )

        # Get the provider
        provider = self._providers[provider_name]

        # Retrieve the secret
        try:
            result: SecretResult = await provider.get_secret(
                secret_name,
                path=path,
                tenant_id=context.tenant_id,
                user_id=context.user_id,
            )
        except Exception as e:
            logger.error(
                "secret_retrieval_error",
                node_id=data.node_id,
                provider=provider_name,
                secret_name="*****",  # Never log actual secret name in error
                error=str(e),
            )
            # If retrieval fails and we have a default, use it
            if default_value is not None:
                logger.info(
                    "secret_using_default",
                    node_id=data.node_id,
                    provider=provider_name,
                )
                return {
                    "secretValue": default_value,
                    "found": False,
                    "source": "default",
                }
            # Otherwise, re-raise the error
            raise

        # Check if secret was found
        if not result.found:
            if default_value is not None:
                logger.info(
                    "secret_not_found_using_default",
                    node_id=data.node_id,
                    provider=provider_name,
                )
                return {
                    "secretValue": default_value,
                    "found": False,
                    "source": "default",
                }
            else:
                logger.warning(
                    "secret_not_found",
                    node_id=data.node_id,
                    provider=provider_name,
                )
                return {
                    "secretValue": None,
                    "found": False,
                    "source": result.source,
                }

        # Secret found - log success WITHOUT the value
        logger.info(
            "secret_retrieved",
            node_id=data.node_id,
            provider=provider_name,
            source=result.source,
            has_metadata=result.metadata is not None,
        )

        return {
            "secretValue": result.value,  # IMPORTANT: Masked by SSE stream wrapper
            "found": True,
            "source": result.source,
        }
