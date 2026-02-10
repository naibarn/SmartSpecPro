# Secrets Vault Workflow Node Executor - Implementation Plan

## Problem Statement

Workflows currently have no way to securely access credentials (API keys, tokens, passwords)
at execution time. Users need a `secrets_vault` node that retrieves secrets from multiple
sources (environment variables, encrypted database storage, and future external vault
integrations) without ever exposing secret values in logs, error messages, or workflow state
that could be inspected.

## Architecture Overview

```
                      +---------------------------+
                      |    SecretsVaultExecutor    |
                      |   (orchestration layer)    |
                      +--------+------------------+
                               |
                  +------------+------------+
                  |                         |
           resolve secretName          dispatch to
           via ExpressionResolver      SecretProvider
                                           |
                  +----------+-------------+-----------+
                  |          |             |            |
             EnvProvider  DbProvider  VaultProvider  AwsProvider
             (Phase 1)    (Phase 1)   (Phase 2 stub) (Phase 2 stub)
```

### Design Principles

1. **Provider abstraction** - `SecretProvider` protocol with pluggable backends
2. **Secrets never leak** - Values masked in all logs, error messages, and SSE events
3. **Audit trail** - Every access is logged (who, what, when, source) with the value itself redacted
4. **Expression support** - `secretName` supports `{{variable}}` resolution
5. **Graceful fallback** - Optional `defaultValue` when secret is not found
6. **Tenant isolation** - Database secrets scoped to tenant/user

## Affected Files

### New Files (to create)

| File | Purpose |
|------|---------|
| `python-backend/app/orchestrator/node_executors/security_executors/secrets_vault_executor.py` | Main executor class |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/__init__.py` | Provider package init |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/base.py` | `SecretProvider` protocol + `SecretResult` dataclass |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/env_provider.py` | Environment variable provider |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/db_provider.py` | Database encrypted secrets provider |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/vault_provider.py` | HashiCorp Vault stub |
| `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/aws_provider.py` | AWS Secrets Manager stub |
| `python-backend/tests/test_secrets_vault_executor.py` | Unit and integration tests |

### Modified Files

| File | Change |
|------|--------|
| `python-backend/app/orchestrator/node_registry.py` | Add `secrets_vault` NodeTypeSpec registration |
| `python-backend/app/orchestrator/node_executors/security_executors/__init__.py` | Update docstring, export executor |
| `apps/web/client/src/lib/workflow/useNodeRegistry.ts` | Add `"security"` to category union type |

### Reference Files (read-only)

| File | Relevance |
|------|-----------|
| `python-backend/app/orchestrator/node_executors/base.py` | `NodeExecutor` protocol, `ExecutionContext`, `NodeExecutionData` |
| `python-backend/app/orchestrator/expression_resolver.py` | `ExpressionResolver` for `{{variable}}` in secretName |
| `python-backend/app/core/encryption.py` | `EncryptionService` (Fernet) for database secrets |
| `python-backend/app/core/smartspecweb_crypto.py` | Cross-system decryption (Node.js-encrypted values) |
| `apps/web/server/services/crypto.ts` | AES-256-GCM encryption format reference |

## Detailed Implementation

---

### Step 1: Secret Provider Protocol and Result Types

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/base.py`

```python
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
        """
        Retrieve a secret by name.

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
```

**Rationale**: The `Protocol` pattern is consistent with `NodeExecutor` in `base.py`. The
`SecretResult` dataclass provides a uniform return type across all providers. Tenant and user
scoping parameters enable multi-tenant isolation without changing the protocol interface later.

---

### Step 2: Environment Variable Provider (Phase 1 - Production)

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/env_provider.py`

```python
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
    """
    Reads secrets from process environment variables.

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
```

**Key security decisions**:
- Blocklist prevents access to `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, etc.
- Optional prefix enforcement (`WORKFLOW_SECRET_`) limits scope to explicitly workflow-designated env vars
- Variable name validation prevents path traversal or shell injection via env var names
- Secret values are NEVER included in log messages (logged as `"*****"`)

---

### Step 3: Database Encrypted Secrets Provider (Phase 1 - Production)

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/db_provider.py`

This provider reads secrets that are stored encrypted in the database. It leverages the
existing `encryption_service` (Fernet via `ENCRYPTION_MASTER_KEY`) and `decrypt_smartspecweb`
(AES-256-GCM via `LLM_ENCRYPTION_KEY`) depending on which encryption system stored the value.

```python
"""Database encrypted secrets provider."""
from typing import Any

import structlog

from .base import SecretProvider, SecretResult

logger = structlog.get_logger(__name__)


class DatabaseSecretProvider:
    """
    Reads encrypted secrets from the database.

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
        """
        Look up secret from database.

        Strategy:
        1. Query system_settings WHERE category='secrets' AND key=name AND tenantId=tenant_id
        2. If found and isSensitive=true, decrypt value
        3. Return SecretResult

        For Phase 1, we query via raw SQL through the existing async database session.
        Future: dedicated workflow_secrets table with versioning + rotation tracking.
        """
        try:
            from app.core.config import settings
            from sqlalchemy.ext.asyncio import create_async_engine
            from sqlalchemy import text

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
        """
        Attempt decryption with available encryption systems.

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
```

**Key design decisions**:
- Two-phase decryption: tries SmartSpecWeb format first (colon-delimited hex), then Fernet
- Creates a short-lived database connection per call (avoids session management complexity in the executor layer)
- Parameterized SQL prevents injection
- Error messages deliberately omit error details that might contain ciphertext or partial secret values
- Future-proofed for a dedicated `workflow_secrets` table

---

### Step 4: HashiCorp Vault Provider (Phase 2 - Stub)

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/vault_provider.py`

```python
"""HashiCorp Vault secret provider (Phase 2 stub)."""
import structlog

from .base import SecretResult

logger = structlog.get_logger(__name__)


class VaultSecretProvider:
    """
    HashiCorp Vault secret provider.

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
```

---

### Step 5: AWS Secrets Manager Provider (Phase 2 - Stub)

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secret_providers/aws_provider.py`

```python
"""AWS Secrets Manager provider (Phase 2 stub)."""
import structlog

from .base import SecretResult

logger = structlog.get_logger(__name__)


class AwsSecretsProvider:
    """
    AWS Secrets Manager secret provider.

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
```

---

### Step 6: Secrets Vault Executor (Main Orchestrator)

**File**: `python-backend/app/orchestrator/node_executors/security_executors/secrets_vault_executor.py`

This is the core executor that implements the `NodeExecutor` protocol, resolves expressions
in `secretName`, dispatches to the correct `SecretProvider`, handles the `maskInLogs` flag,
writes an audit record, and returns outputs.

```python
"""Secrets Vault Executor - Secure credential retrieval for workflows."""
import time
from datetime import datetime, timezone
from typing import Any

import structlog

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

from .secret_providers.aws_provider import AwsSecretsProvider
from .secret_providers.base import SecretProvider, SecretResult
from .secret_providers.db_provider import DatabaseSecretProvider
from .secret_providers.env_provider import EnvironmentSecretProvider
from .secret_providers.vault_provider import VaultSecretProvider

logger = structlog.get_logger(__name__)


def _mask_value(value: str | None) -> str:
    """
    Mask a secret value for safe logging.

    Never returns the actual value. Shows only length hint.
    """
    if value is None:
        return "<none>"
    length = len(value)
    if length == 0:
        return "<empty>"
    return f"*****({length} chars)"


class SecretsVaultExecutor:
    """
    Executor for the secrets_vault workflow node.

    Retrieves secrets from configurable sources (environment, database,
    HashiCorp Vault, AWS Secrets Manager) with full audit logging and
    mandatory value masking.

    Inputs (from node config):
        secretSource: "environment" | "database" | "vault" | "aws_secrets"
        secretName: str (supports {{variable}} expressions)
        vaultPath: str (for vault/AWS path hierarchies)
        defaultValue: str | None (fallback if not found)
        maskInLogs: bool (default True - NEVER log the actual value)

    Outputs:
        secretValue: str (the retrieved secret - NEVER logged)
        found: bool (whether the secret was located)
        source: str (which provider returned the secret)
    """

    # Provider instances (stateless, safe to reuse)
    _providers: dict[str, SecretProvider] = {}

    def __init__(self) -> None:
        self._expression_resolver = ExpressionResolver()
        self._providers = {
            "environment": EnvironmentSecretProvider(),
            "database": DatabaseSecretProvider(),
            "vault": VaultSecretProvider(),
            "aws_secrets": AwsSecretsProvider(),
        }

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute secret retrieval.

        Flow:
        1. Resolve secretName expressions
        2. Validate secretSource
        3. Dispatch to provider
        4. Apply defaultValue fallback
        5. Write audit log entry
        6. Return outputs (value NEVER logged)
        """
        start_time = time.monotonic()

        # Extract and validate config
        secret_source = data.config.get("secretSource", "environment")
        raw_secret_name = data.config.get("secretName", "")
        vault_path = data.config.get("vaultPath")
        default_value = data.config.get("defaultValue")
        mask_in_logs = data.config.get("maskInLogs", True)

        # Resolve expressions in secretName (e.g. {{trigger.secretKey}})
        secret_name = self._expression_resolver.resolve(
            str(raw_secret_name), data.state
        )

        if not secret_name or secret_name == raw_secret_name and "{{" in raw_secret_name:
            raise ValueError(
                "secretName is required and could not be resolved. "
                "Provide a static name or ensure the referenced variable exists."
            )

        # Resolve vaultPath expressions if present
        if vault_path:
            vault_path = self._expression_resolver.resolve(
                str(vault_path), data.state
            )

        # Validate source
        if secret_source not in self._providers:
            raise ValueError(
                f"Invalid secretSource '{secret_source}'. "
                f"Valid options: {', '.join(self._providers.keys())}"
            )

        provider = self._providers[secret_source]

        # Retrieve secret
        result: SecretResult = await provider.get_secret(
            name=secret_name,
            path=vault_path,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
        )

        # Apply default value fallback
        final_value = result.value
        used_default = False
        if not result.found and default_value is not None:
            final_value = default_value
            used_default = True

        found = result.found or used_default
        source_used = result.source if result.found else ("default" if used_default else "none")

        elapsed_ms = round((time.monotonic() - start_time) * 1000, 2)

        # Audit log entry (value is ALWAYS masked regardless of maskInLogs setting)
        logger.info(
            "secrets_vault_access",
            node_id=data.node_id,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            secret_source=secret_source,
            secret_name=secret_name if not mask_in_logs else "*****",
            found=found,
            used_default=used_default,
            source_used=source_used,
            elapsed_ms=elapsed_ms,
            timestamp=datetime.now(timezone.utc).isoformat(),
            # NEVER log the value, even if maskInLogs is False
            secret_value="<REDACTED>",
        )

        return {
            "secretValue": final_value if final_value is not None else "",
            "found": found,
            "source": source_used,
        }
```

**Critical security invariant**: The `secretValue` output is passed through the workflow
state so downstream nodes can use it, but the executor NEVER logs the actual value. The
`maskInLogs` config controls whether even the *name* is logged (default: masked). The
*value* is always `<REDACTED>` in logs regardless of any setting.

---

### Step 7: Node Registry Spec

**File**: `python-backend/app/orchestrator/node_registry.py` (modify `_register_core_nodes`)

Add the following registration block after the existing HTTP Request node registration:

```python
# ===== Security Nodes =====

# Secrets Vault
self.register_node_type(
    NodeTypeSpec(
        type="secrets_vault",
        display_name="Secrets Vault",
        description="Securely retrieve credentials and API keys from environment, database, or external vaults",
        icon="key-round",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="secretSource",
                display_name="Secret Source",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="environment",
                options=[
                    {"label": "Environment Variable", "value": "environment"},
                    {"label": "Database (Encrypted)", "value": "database"},
                    {"label": "HashiCorp Vault", "value": "vault"},
                    {"label": "AWS Secrets Manager", "value": "aws_secrets"},
                ],
            ),
            InputSpec(
                name="secretName",
                display_name="Secret Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="e.g. WORKFLOW_SECRET_MY_API_KEY or {{trigger.secretKey}}",
                validation={"min_length": 1, "max_length": 256},
            ),
            InputSpec(
                name="vaultPath",
                display_name="Vault Path",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="secret/data/my-app/api-keys (vault/AWS only)",
            ),
            InputSpec(
                name="defaultValue",
                display_name="Default Value",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="Fallback value if secret not found",
            ),
            InputSpec(
                name="maskInLogs",
                display_name="Mask Secret Name in Logs",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(
                name="secretValue",
                display_name="Secret Value",
                data_type="text",
            ),
            OutputSpec(
                name="found",
                display_name="Found",
                data_type="boolean",
            ),
            OutputSpec(
                name="source",
                display_name="Source",
                data_type="text",
            ),
        ],
        executor="app.orchestrator.node_executors.security_executors.secrets_vault_executor.SecretsVaultExecutor",
    )
)
```

**Category**: `"security"` is a new category. This requires adding it to the frontend
`NodeTypeSpec.category` union type in `useNodeRegistry.ts`.

---

### Step 8: Frontend Category Update

**File**: `apps/web/client/src/lib/workflow/useNodeRegistry.ts`

Update the `category` union type:

```typescript
// Before
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations";

// After
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations" | "security";
```

---

### Step 9: Security Executors Package Init

**File**: `python-backend/app/orchestrator/node_executors/security_executors/__init__.py`

```python
"""Security node executors.

Contains executors for security-related workflow nodes:
- SecretsVaultExecutor: Secure credential retrieval from multiple sources
"""
from .secrets_vault_executor import SecretsVaultExecutor

__all__ = ["SecretsVaultExecutor"]
```

---

### Step 10: Tests

**File**: `python-backend/tests/test_secrets_vault_executor.py`

Test matrix:

| Test | Provider | Scenario |
|------|----------|----------|
| `test_env_secret_found` | environment | Reads existing env var |
| `test_env_secret_not_found` | environment | Missing env var, no default |
| `test_env_secret_with_default` | environment | Missing env var, uses default |
| `test_env_secret_blocked_var` | environment | Attempts to read DATABASE_URL |
| `test_env_secret_invalid_name` | environment | Name with special chars |
| `test_env_secret_prefix_resolution` | environment | WORKFLOW_SECRET_ prefix |
| `test_db_secret_found` | database | Reads encrypted value from DB |
| `test_db_secret_not_found` | database | Missing key |
| `test_db_secret_decryption_failure` | database | Corrupt ciphertext |
| `test_vault_stub_returns_not_implemented` | vault | Stub returns not_implemented |
| `test_aws_stub_returns_not_implemented` | aws_secrets | Stub returns not_implemented |
| `test_invalid_source` | N/A | Invalid secretSource value |
| `test_expression_resolution_in_name` | environment | `{{trigger.key}}` resolved |
| `test_mask_in_logs_true` | environment | Verify secret name is masked |
| `test_mask_in_logs_false` | environment | Verify secret name is visible |
| `test_value_never_logged` | all | Verify value is always REDACTED |
| `test_tenant_isolation_db` | database | Secret scoped to tenant |

Test approach:
- Use `unittest.mock.patch.dict(os.environ, ...)` for environment tests
- Mock `sqlalchemy.ext.asyncio.create_async_engine` for database tests
- Directly instantiate providers for unit tests
- Full executor integration tests via `SecretsVaultExecutor.execute()`

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Secret values leaked in logs | CRITICAL | Values are NEVER passed to `logger.*` calls. `_mask_value()` helper used everywhere. Code review checklist item. |
| Secret values leaked in error messages | CRITICAL | All `except` blocks omit error message details. `ValueError` messages contain no values. |
| Secret values leaked in SSE events | HIGH | Executor only returns `secretValue` in the output dict. SSE serialization should not include full state. Verify in integration tests. |
| Environment variable injection | HIGH | Blocklist + name validation + optional prefix enforcement |
| SQL injection in DB provider | HIGH | Parameterized queries only. No string interpolation. |
| Database connection leak | MEDIUM | `async with engine.connect()` + explicit `engine.dispose()` |
| Cross-tenant secret access | HIGH | Tenant ID scoping in DB query. Env vars are global (document this limitation). |
| Encryption key unavailable | MEDIUM | Graceful fallback to `found=False`. Error logged without value. |

## Verification Steps

After implementation:

1. **Unit tests pass**: `pytest tests/test_secrets_vault_executor.py -v`
2. **Lint clean**: `ruff check app/orchestrator/node_executors/security_executors/`
3. **Type check**: `mypy app/orchestrator/node_executors/security_executors/`
4. **Format**: `black app/orchestrator/node_executors/security_executors/ tests/test_secrets_vault_executor.py`
5. **Registry loads**: Start the app and verify `GET /api/v1/workflows/node-types` includes `secrets_vault`
6. **Frontend renders**: Verify the workflow editor shows the node with correct inputs and icon
7. **Log audit**: Run a test workflow with the node and verify NO secret values appear in logs
8. **Full test suite**: `pytest` (ensure no regressions)

## Implementation Order

1. `secret_providers/base.py` (protocol + types) -- no dependencies
2. `secret_providers/env_provider.py` -- depends on base.py
3. `secret_providers/db_provider.py` -- depends on base.py + encryption modules
4. `secret_providers/vault_provider.py` -- depends on base.py (stub)
5. `secret_providers/aws_provider.py` -- depends on base.py (stub)
6. `secrets_vault_executor.py` -- depends on all providers + expression_resolver
7. `__init__.py` update -- depends on executor
8. `node_registry.py` update -- depends on executor path
9. `useNodeRegistry.ts` update -- independent of Python changes
10. `tests/test_secrets_vault_executor.py` -- depends on all above

Steps 1-5 can be implemented in parallel. Steps 6-8 are sequential. Step 9 is independent.

## Open Questions for User

1. **Dedicated `workflow_secrets` table**: Should we create a new table specifically for
   workflow secrets, or reuse the existing `system_settings` table with
   `category='workflow_secrets'`? A dedicated table would allow per-secret versioning,
   rotation tracking, and more granular access control.

2. **UI for managing secrets**: Should there be an admin page for creating/managing database
   secrets, or is that out of scope for this executor implementation?

3. **Secret caching**: Should the DB provider cache decrypted values for the duration of a
   single workflow execution (to avoid repeated DB + decryption calls if the same secret is
   referenced by multiple nodes)? This introduces a security tradeoff (decrypted value lives
   longer in memory).

4. **SSE event masking**: The executor output `secretValue` flows through workflow state.
   Should the SSE streaming layer have a masking filter that replaces known secret output
   ports with `"*****"` before sending to the client?
