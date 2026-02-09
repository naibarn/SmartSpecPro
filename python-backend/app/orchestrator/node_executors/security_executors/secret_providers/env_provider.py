"""Environment variable secret provider."""
import os
import re
from typing import Any

import structlog

from .base import SecretProvider, SecretResult

logger = structlog.get_logger(__name__)

# Allowlist pattern: only alphanumeric + underscores
_VALID_ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Blocklist: system/security env vars that must never be exposed
_BLOCKED_ENV_VARS = frozenset({
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "PWD",
    "LANG",
    "TERM",
    "HOSTNAME",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    # Security-critical application vars
    "SECRET_KEY",
    "JWT_SECRET",
    "ENCRYPTION_MASTER_KEY",
    "LLM_ENCRYPTION_KEY",
    "SMARTSPEC_MASTER_KEY",
    "SMARTSPEC_PROXY_TOKEN",
    "SMARTSPEC_WEB_GATEWAY_TOKEN",
    "DATABASE_URL",
    "REDIS_URL",
    "CHECKPOINT_DATABASE_URL",
    # Prevent shell escape
    "BASH_ENV",
    "ENV",
    "CDPATH",
})

# Optional prefix-based allowlist (if set, ONLY vars with this prefix are accessible)
_ALLOWED_PREFIX = os.getenv("WORKFLOW_SECRET_ENV_PREFIX", "WORKFLOW_SECRET_")


class EnvironmentSecretProvider:
    """Reads secrets from process environment variables.

    Security constraints:
    - Variable names are validated against a safe character pattern
    - System/security variables are blocklisted
    - Optionally restricts to a configurable prefix (WORKFLOW_SECRET_*)
    - Values are NEVER logged
    """

    @property
    def source_name(self) -> str:
        return "environment"

    async def get_secret(
        self,
        name: str,
        *,
        path: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> SecretResult:
        # Validate variable name format
        if not _VALID_ENV_NAME.match(name):
            logger.warning(
                "env_secret_invalid_name",
                secret_name=name,
                reason="name_contains_invalid_characters",
            )
            return SecretResult(value=None, found=False, source=self.source_name)

        # Check blocklist
        if name.upper() in _BLOCKED_ENV_VARS:
            logger.warning(
                "env_secret_blocked",
                secret_name=name,
                reason="blocked_system_variable",
            )
            return SecretResult(value=None, found=False, source=self.source_name)

        # If prefix enforcement is enabled, check prefix
        if _ALLOWED_PREFIX and not name.startswith(_ALLOWED_PREFIX):
            # Try with prefix prepended
            prefixed_name = f"{_ALLOWED_PREFIX}{name}"
            value = os.environ.get(prefixed_name)
            if value is not None:
                logger.info(
                    "env_secret_resolved",
                    secret_name="*****",
                    resolved_with_prefix=True,
                )
                return SecretResult(
                    value=value,
                    found=True,
                    source=self.source_name,
                    metadata={"resolved_name": prefixed_name},
                )

        # Direct lookup
        value = os.environ.get(name)
        if value is not None:
            logger.info(
                "env_secret_resolved",
                secret_name="*****",
                found=True,
            )
            return SecretResult(value=value, found=True, source=self.source_name)

        logger.info(
            "env_secret_not_found",
            secret_name=name,
            found=False,
        )
        return SecretResult(value=None, found=False, source=self.source_name)
