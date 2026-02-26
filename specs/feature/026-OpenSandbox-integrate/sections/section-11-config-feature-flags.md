I now have all the context needed. Let me generate the section content.

# Section 11: Configuration and Feature Flags

## Overview

This section defines the complete environment variable configuration for OpenSandbox across all deployment environments (Node.js web app, Python backend localhost, Python backend production, and Hetzner server) and the two-level feature flag system that controls the gradual rollout of sandbox execution.

The configuration system serves two purposes:
1. It provides environment-specific connection settings (URLs, API keys, timeouts) that each service needs to communicate with the OpenSandbox server.
2. It provides a feature flag layer that controls whether sandbox execution is used, which features use it, and whether legacy fallback is available.

The feature flag system has two levels:
- **Global**: `OPENSANDBOX_ENABLED` is the master switch; `OPENSANDBOX_DISPATCH_MODE` controls whether legacy fallback is available (`optional`) or not (`required`).
- **Per-feature**: `SANDBOX_REQUIRE_FOR_SKILLS`, `SANDBOX_REQUIRE_FOR_MEDIA` individually enforce sandbox execution for specific workload categories.

### Dependencies

- **section-03-python-sdk-client**: The `OpenSandboxSettings` Pydantic config class at `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/config.py` must exist. This section specifies what environment variables it reads, but the class itself is defined in section-03.
- **section-05-nodejs-router-services**: The Node.js `ENV` object at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/env.ts` receives sandbox entries. The env.ts modification is specified in section-05 but the full variable catalog and `.env.example` updates belong to this section.

### What This Section Does NOT Cover

- The Python `OpenSandboxSettings` class implementation (section-03)
- The Node.js `ENV` object field addition (section-05, already specified the 5 fields)
- The sandbox dispatch logic that reads these flags (section-04 for Python, section-05 for Node.js)
- The Hetzner server setup (section-09)

---

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/.env.example` | Add all sandbox env vars with documentation comments |
| `/home/dev/projects/SmartSpecPro/python-backend/.env.example` | Add all sandbox env vars with documentation comments |

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/featureFlags.test.ts` | Tests for feature flag evaluation logic |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_feature_flags.py` | Tests for Python-side feature flag behavior |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/featureFlags.ts` | Centralized feature flag evaluation module |

---

## Tests (Write First)

### 11.1 TypeScript Tests -- Feature Flag Evaluation

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/featureFlags.test.ts`

This test file validates the centralized feature flag module that determines whether sandbox execution should be used for a given workload. The module reads from `process.env` directly (not the `ENV` object) to allow runtime changes without server restart.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for the featureFlags module.
 *
 * Imports to test:
 *   - isSandboxEnabled(): returns true when OPENSANDBOX_ENABLED=true
 *   - getDispatchMode(): returns 'optional' or 'required'
 *   - isFeatureRequiredForSandbox(featureType): checks per-feature flags
 *   - shouldUseSandboxForFeature(featureType, executionMode): combined check
 */

describe("isSandboxEnabled", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
  });

  it("returns false when OPENSANDBOX_ENABLED is unset", () => {
    /** Delete env var, call isSandboxEnabled(), expect false */
  });

  it("returns false when OPENSANDBOX_ENABLED is 'false'", () => {
    /** Set to 'false', expect false */
  });

  it("returns true when OPENSANDBOX_ENABLED is 'true'", () => {
    /** Set to 'true', expect true */
  });

  it("returns false for any non-'true' value like '1' or 'yes'", () => {
    /** Only strict 'true' string should enable */
  });
});

describe("getDispatchMode", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_DISPATCH_MODE;
  });

  it("returns 'optional' when env var is unset (default)", () => {
    /** Expect 'optional' */
  });

  it("returns 'required' when env var is 'required'", () => {
    /** Set to 'required', expect 'required' */
  });

  it("returns 'optional' for unrecognized values", () => {
    /** Set to 'banana', expect fallback to 'optional' */
  });
});

describe("isFeatureRequiredForSandbox", () => {
  afterEach(() => {
    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
  });

  it("returns false for skills when SANDBOX_REQUIRE_FOR_SKILLS is unset", () => {
    /** featureType='skill', expect false */
  });

  it("returns true for skills when SANDBOX_REQUIRE_FOR_SKILLS is 'true'", () => {
    /** featureType='skill', expect true */
  });

  it("returns true for media when SANDBOX_REQUIRE_FOR_MEDIA is 'true'", () => {
    /** featureType='media', expect true */
  });

  it("returns false for unknown feature types (no env var mapping)", () => {
    /** featureType='chat', expect false (no per-feature override) */
  });
});

describe("shouldUseSandboxForFeature", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
    delete process.env.OPENSANDBOX_DISPATCH_MODE;
    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
  });

  it("returns false when sandbox is globally disabled, dispatch optional", () => {
    /**
     * OPENSANDBOX_ENABLED=false, DISPATCH_MODE=optional
     * Any executionMode -> false (legacy fallback)
     */
  });

  it("throws when sandbox is globally disabled but dispatch is required", () => {
    /**
     * OPENSANDBOX_ENABLED=false, DISPATCH_MODE=required
     * Should throw an error indicating sandbox is required but not enabled
     */
  });

  it("returns false for core-text execution mode even when enabled", () => {
    /**
     * OPENSANDBOX_ENABLED=true, executionMode='core-text'
     * Core text goes through LLM path, not sandbox
     */
  });

  it("returns false for llm-only execution mode even when enabled", () => {
    /**
     * OPENSANDBOX_ENABLED=true, executionMode='llm-only'
     * Legacy LLM mode, not sandbox
     */
  });

  it("returns true for sandbox-code when enabled", () => {
    /** OPENSANDBOX_ENABLED=true, executionMode='sandbox-code' -> true */
  });

  it("returns true for sandbox-media when enabled", () => {
    /** OPENSANDBOX_ENABLED=true, executionMode='sandbox-media' -> true */
  });

  it("returns true for media-generate when enabled (backward compat)", () => {
    /** OPENSANDBOX_ENABLED=true, executionMode='media-generate' -> true */
  });

  it("returns true when per-feature flag forces sandbox for skills", () => {
    /**
     * OPENSANDBOX_ENABLED=true
     * SANDBOX_REQUIRE_FOR_SKILLS=true
     * featureType='skill', executionMode='sandbox-code'
     * -> true
     */
  });
});
```

### 11.2 Python Tests -- Feature Flag Behavior

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_feature_flags.py`

These tests verify that the Python-side sandbox configuration correctly interprets environment variables and that the dispatcher's feature flag check behaves correctly for each dispatch mode.

```python
"""Tests for OpenSandbox feature flag behavior in Python backend.

Tests verify that environment variables correctly control sandbox routing
at the configuration and dispatcher levels.
"""
import pytest
from unittest.mock import patch, AsyncMock


pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestOpenSandboxSettingsFlags:
    """Tests for the OpenSandboxSettings config reading feature flag env vars."""

    def test_enabled_defaults_to_false(self):
        """When no OPENSANDBOX_ENABLED env var is set, is_enabled returns False."""
        # Instantiate OpenSandboxSettings with no env override
        # Assert settings.is_enabled is False
        ...

    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "true"})
    def test_enabled_reads_true_from_env(self):
        """OPENSANDBOX_ENABLED=true sets is_enabled to True."""
        ...

    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "false"})
    def test_enabled_reads_false_from_env(self):
        """OPENSANDBOX_ENABLED=false sets is_enabled to False."""
        ...

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "OPENSANDBOX_BASE_URL": "",
    })
    def test_enabled_but_no_url_returns_disabled(self):
        """is_enabled is False when OPENSANDBOX_ENABLED=true but URL is empty."""
        # This catches misconfiguration where someone sets enabled but forgets URL
        ...


class TestDispatchModeFlags:
    """Tests for OPENSANDBOX_DISPATCH_MODE behavior in the dispatcher."""

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "false",
        "OPENSANDBOX_DISPATCH_MODE": "optional",
    })
    async def test_optional_mode_falls_back_when_disabled(self):
        """Dispatcher returns None (legacy fallback) when optional and disabled."""
        # Call dispatcher.dispatch() with valid args
        # Assert return value is None (caller should use legacy path)
        ...

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "false",
        "OPENSANDBOX_DISPATCH_MODE": "required",
    })
    async def test_required_mode_raises_when_disabled(self):
        """Dispatcher raises error when required but sandbox is disabled."""
        # Call dispatcher.dispatch()
        # Assert raises RuntimeError or custom SandboxRequiredError
        ...

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "OPENSANDBOX_DISPATCH_MODE": "optional",
    })
    async def test_optional_mode_falls_back_on_circuit_breaker_open(self):
        """When sandbox is enabled but circuit breaker is open, falls back to legacy."""
        # Mock the sandbox client to have an open circuit breaker
        # Assert dispatcher returns None
        ...

    def test_dispatch_mode_defaults_to_optional(self):
        """When OPENSANDBOX_DISPATCH_MODE is unset, default is 'optional'."""
        # Instantiate settings with no OPENSANDBOX_DISPATCH_MODE
        # Assert the dispatch_mode field (or equivalent) is 'optional'
        ...


class TestPerFeatureFlags:
    """Tests for per-feature sandbox requirement flags."""

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "SANDBOX_REQUIRE_FOR_SKILLS": "true",
    })
    async def test_skills_required_flag_forces_sandbox(self):
        """When SANDBOX_REQUIRE_FOR_SKILLS=true, skill workloads must use sandbox."""
        ...

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "SANDBOX_REQUIRE_FOR_MEDIA": "true",
    })
    async def test_media_required_flag_forces_sandbox(self):
        """When SANDBOX_REQUIRE_FOR_MEDIA=true, media workloads must use sandbox."""
        ...

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "SANDBOX_REQUIRE_FOR_SKILLS": "false",
    })
    async def test_skills_not_required_allows_legacy_fallback(self):
        """When SANDBOX_REQUIRE_FOR_SKILLS=false, skills can use legacy path."""
        ...
```

### 11.3 Environment Variable Documentation Tests (Validation)

These are not automated tests but validation checks to run after implementation:

1. Verify that every env var listed in `apps/web/.env.example` under the OpenSandbox section has a corresponding reader in `ENV` object or `featureFlags.ts`
2. Verify that every env var listed in `python-backend/.env.example` under the OpenSandbox section has a corresponding field in `OpenSandboxSettings`
3. Verify that no sandbox env vars use the `VITE_` prefix (they are server-side only)

---

## Implementation Details

### 11.1 Node.js Feature Flag Module

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/featureFlags.ts`

This module centralizes all feature flag evaluation logic for the Node.js side. It reads directly from `process.env` (not the static `ENV` object) to allow runtime changes without server restart. This is intentional: flipping a feature flag should take effect immediately.

```typescript
/**
 * Centralized OpenSandbox feature flag evaluation.
 *
 * Reads from process.env directly for runtime flexibility.
 * The ENV object in _core/env.ts captures snapshot values at startup;
 * this module re-reads on every call so flag changes take effect immediately.
 */

/** Execution modes that always bypass sandbox (LLM text processing). */
const LEGACY_ONLY_MODES = ["core-text", "llm-only"] as const;

/** Execution modes that route to sandbox when enabled. */
const SANDBOX_MODES = [
  "sandbox-code",
  "sandbox-command",
  "sandbox-browser",
  "sandbox-file",
  "sandbox-media",
  "media-generate",
] as const;

/** Per-feature env var name mapping. */
const FEATURE_FLAG_MAP: Record<string, string> = {
  skill: "SANDBOX_REQUIRE_FOR_SKILLS",
  media: "SANDBOX_REQUIRE_FOR_MEDIA",
};

export type DispatchMode = "optional" | "required";

export function isSandboxEnabled(): boolean;
export function getDispatchMode(): DispatchMode;
export function isFeatureRequiredForSandbox(featureType: string): boolean;
export function shouldUseSandboxForFeature(
  featureType: string,
  executionMode: string,
): boolean;
```

Key behavior rules:

- `isSandboxEnabled()` returns `process.env.OPENSANDBOX_ENABLED === "true"` (strict string comparison, not truthy).
- `getDispatchMode()` returns `"required"` only if `process.env.OPENSANDBOX_DISPATCH_MODE === "required"`, defaults to `"optional"`.
- `isFeatureRequiredForSandbox(featureType)` looks up `FEATURE_FLAG_MAP[featureType]` and checks if that env var is `"true"`.
- `shouldUseSandboxForFeature(featureType, executionMode)` combines all checks:
  1. If `executionMode` is in `LEGACY_ONLY_MODES`, return `false` (never sandbox).
  2. If `!isSandboxEnabled()` and `getDispatchMode() === "required"`, throw an error.
  3. If `!isSandboxEnabled()` and `getDispatchMode() === "optional"`, return `false`.
  4. If `executionMode` is in `SANDBOX_MODES`, return `true`.
  5. Otherwise return `false`.

This module is imported by:
- `dispatchService.ts` (section-05) to decide whether to route to sandbox
- `skillExecutor.ts` (section-07) to decide skill execution path
- `sandbox.ts` router (section-05) to gate procedures

### 11.2 Python Feature Flag Configuration

The Python side reads feature flags through the `OpenSandboxSettings` Pydantic config class (defined in section-03). This section specifies the additional fields that class must include for the feature flag system:

| Field | Type | Default | Env Var |
|-------|------|---------|---------|
| `OPENSANDBOX_DISPATCH_MODE` | `str` | `"optional"` | `OPENSANDBOX_DISPATCH_MODE` |
| `SANDBOX_REQUIRE_FOR_SKILLS` | `bool` | `False` | `SANDBOX_REQUIRE_FOR_SKILLS` |
| `SANDBOX_REQUIRE_FOR_MEDIA` | `bool` | `False` | `SANDBOX_REQUIRE_FOR_MEDIA` |

These fields supplement the base `OpenSandboxSettings` fields already defined in section-03 (`OPENSANDBOX_ENABLED`, `OPENSANDBOX_BASE_URL`, `OPENSANDBOX_API_KEY`, timeouts, etc.).

The dispatcher (section-04) reads these via `get_sandbox_settings()` and uses them in `_check_enabled()`:

```python
# In sandbox_dispatcher.py (already defined in section-04)
async def _check_enabled(self, execution_mode: str) -> bool:
    settings = get_sandbox_settings()
    if not settings.is_enabled:
        if settings.OPENSANDBOX_DISPATCH_MODE == "required":
            raise RuntimeError("Sandbox is required but not enabled")
        return False  # Caller falls back to legacy
    return execution_mode not in ("core-text", "llm-only")
```

### 11.3 Web App Environment Variables (`.env.example`)

Add the following block to `/home/dev/projects/SmartSpecPro/apps/web/.env.example` after the existing Stripe section:

```bash
# =============================================================================
# OPENSANDBOX INTEGRATION
# =============================================================================
# Master switch for sandbox execution. When false, all workloads use legacy paths.
OPENSANDBOX_ENABLED=false

# Dispatch mode: 'optional' allows legacy fallback, 'required' fails if sandbox unavailable.
OPENSANDBOX_DISPATCH_MODE=optional

# Default sandbox profile slug (must match a row in sandbox_profiles table).
SANDBOX_DEFAULT_PROFILE=code-default

# Per-feature enforcement flags. When true, the feature MUST use sandbox (no legacy fallback).
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=false
```

These are all server-side variables. None use the `VITE_` prefix because sandbox configuration must never be exposed to the client bundle.

### 11.4 Python Backend Environment Variables (`.env.example`) -- Localhost

Add the following block to `/home/dev/projects/SmartSpecPro/python-backend/.env.example` after the existing monitoring section:

```bash
# =============================================================================
# OPENSANDBOX INTEGRATION
# =============================================================================
# Master switch — set true to enable sandbox execution
OPENSANDBOX_ENABLED=false

# Dispatch mode: 'optional' (fallback to legacy) or 'required' (fail if unavailable)
OPENSANDBOX_DISPATCH_MODE=optional

# OpenSandbox server URL (localhost for dev, https://sandbox.smartaihub.app for prod)
OPENSANDBOX_BASE_URL=http://localhost:8080

# API key for authenticating with the OpenSandbox server
OPENSANDBOX_API_KEY=dev-sandbox-key-change-me

# Timeouts
OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
OPENSANDBOX_READY_POLL_INTERVAL_MS=2000

# Artifact storage
SANDBOX_ARTIFACT_BUCKET=smartspec-sandbox-artifacts
SANDBOX_SIGNED_URL_TTL_SECONDS=900

# Network policy
SANDBOX_DEFAULT_NETWORK_ACTION=deny

# Concurrency limits
SANDBOX_MAX_CONCURRENT_GLOBAL=10
SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT=3

# Per-feature enforcement
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=false
```

### 11.5 Python Backend -- Production Values (GCP Secret Manager)

Production uses the same environment variables but with these overridden values. These are stored in GCP Secret Manager and injected into the Cloud Run service:

| Variable | Production Value | Notes |
|----------|-----------------|-------|
| `OPENSANDBOX_ENABLED` | `true` | Enabled in production |
| `OPENSANDBOX_DISPATCH_MODE` | `optional` | Start with optional, switch to required later |
| `OPENSANDBOX_BASE_URL` | `https://sandbox.smartaihub.app` | Hetzner Singapore server |
| `OPENSANDBOX_API_KEY` | *(stored in Secret Manager)* | Shared with Hetzner |
| `SANDBOX_MAX_CONCURRENT_GLOBAL` | `20` | Higher limit for production |
| `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT` | `5` | Higher per-tenant limit |

All other variables use the same defaults as localhost.

### 11.6 Hetzner Server Environment

The Hetzner server runs the OpenSandbox server container itself. Its configuration is distinct from the Python backend (which is a client of the OpenSandbox server). These variables are set via a `.env` file on the Hetzner host or via Docker Compose environment:

| Variable | Value | Purpose |
|----------|-------|---------|
| `OPENSANDBOX_API_KEY` | *(same as production client key)* | Authenticates incoming requests |
| `OPENSANDBOX_RUNTIME` | `docker` | Docker bridge runtime |
| `OPENSANDBOX_DOCKER_NETWORK` | `sandbox-exec` | Internal network for sandbox containers |
| `OPENSANDBOX_DEFAULT_TIMEOUT` | `600` | Default sandbox TTL in seconds |
| `OPENSANDBOX_MAX_SANDBOXES` | `20` | Max concurrent sandbox containers |

These are NOT added to any `.env.example` file in the SmartSpecPro repo. They are documented in the Hetzner setup script (section-09) and deployed via the provisioning process.

### 11.7 Rollout Strategy

The rollout proceeds through phases, each controlled by environment variable changes:

**Phase 1 -- Development (current)**

```
OPENSANDBOX_ENABLED=false
OPENSANDBOX_DISPATCH_MODE=optional
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=false
```

All workloads use legacy execution paths. OpenSandbox code exists but is never invoked. This is the safe default for any environment that has not been configured.

**Phase 2 -- Integration Testing**

```
OPENSANDBOX_ENABLED=true
OPENSANDBOX_DISPATCH_MODE=optional
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=false
```

Sandbox is enabled with optional fallback. If the OpenSandbox server is unreachable or the circuit breaker opens, workloads transparently fall back to legacy paths. This allows testing sandbox execution without risking production failures.

**Phase 3 -- Media Pipeline Enforcement**

```
OPENSANDBOX_ENABLED=true
OPENSANDBOX_DISPATCH_MODE=optional
SANDBOX_REQUIRE_FOR_SKILLS=false
SANDBOX_REQUIRE_FOR_MEDIA=true
```

Media workloads (FFmpeg processing, presentation rendering) are required to use sandbox. Other workloads still have legacy fallback. This targets the highest-risk workload category first.

**Phase 4 -- Skill Execution Enforcement**

```
OPENSANDBOX_ENABLED=true
OPENSANDBOX_DISPATCH_MODE=optional
SANDBOX_REQUIRE_FOR_SKILLS=true
SANDBOX_REQUIRE_FOR_MEDIA=true
```

Skill execution and media processing both require sandbox. Chat and workflow workloads still have legacy fallback.

**Phase 5 -- Full Enforcement**

```
OPENSANDBOX_ENABLED=true
OPENSANDBOX_DISPATCH_MODE=required
SANDBOX_REQUIRE_FOR_SKILLS=true
SANDBOX_REQUIRE_FOR_MEDIA=true
```

All sandbox-eligible workloads must go through sandbox. No legacy fallback. This is the target state. Only set this after the launch readiness gate (section-12) passes.

**Phase 6 -- Legacy Removal**

Once Phase 5 has been stable for a sufficient period (recommended: 2+ weeks), the legacy subprocess execution paths can be removed entirely. This is covered in section-12 (production hardening).

### 11.8 Rollback Procedures

Each phase has a corresponding rollback:

| Current Phase | Rollback Action | Effect |
|---|---|---|
| Phase 2 (sandbox enabled, optional) | Set `OPENSANDBOX_ENABLED=false` | Immediate fallback to all-legacy |
| Phase 3 (media required) | Set `SANDBOX_REQUIRE_FOR_MEDIA=false` | Media falls back to legacy |
| Phase 4 (skills required) | Set `SANDBOX_REQUIRE_FOR_SKILLS=false` | Skills fall back to legacy |
| Phase 5 (dispatch required) | Set `OPENSANDBOX_DISPATCH_MODE=optional` | Re-enables legacy fallback for all features |
| Emergency (any phase) | Set `OPENSANDBOX_ENABLED=false` | Immediately disables all sandbox execution |

All rollbacks are environment variable changes. No code deployment is required. For the Node.js featureFlags module (which reads `process.env` at call time), changes take effect on the next request. For the Python Pydantic settings (which are loaded at startup as a singleton), a service restart is required after changing env vars.

**Important**: The Python `OpenSandboxSettings` uses a module-level singleton (`opensandbox_settings = OpenSandboxSettings()`). To make env var changes take effect without restart, the `get_sandbox_settings()` function should support cache invalidation. This is already addressed in section-03 where the config module includes a `reload_settings()` function.

---

## Environment Variable Reference (Complete Catalog)

This is the authoritative list of all environment variables introduced by the OpenSandbox integration, across all environments:

### Variables Read by Node.js (`apps/web`)

| Variable | Type | Default | Read By |
|----------|------|---------|---------|
| `OPENSANDBOX_ENABLED` | string (`"true"`/`"false"`) | `"false"` | `featureFlags.ts`, `env.ts` |
| `OPENSANDBOX_DISPATCH_MODE` | string (`"optional"`/`"required"`) | `"optional"` | `featureFlags.ts`, `env.ts` |
| `SANDBOX_DEFAULT_PROFILE` | string | `"code-default"` | `env.ts`, `dispatchService.ts` |
| `SANDBOX_REQUIRE_FOR_SKILLS` | string (`"true"`/`"false"`) | `"false"` | `featureFlags.ts`, `env.ts` |
| `SANDBOX_REQUIRE_FOR_MEDIA` | string (`"true"`/`"false"`) | `"false"` | `featureFlags.ts`, `env.ts` |

### Variables Read by Python Backend (`python-backend`)

| Variable | Type | Default | Read By |
|----------|------|---------|---------|
| `OPENSANDBOX_ENABLED` | bool | `False` | `OpenSandboxSettings` |
| `OPENSANDBOX_BASE_URL` | str | `http://localhost:8080` | `OpenSandboxSettings` |
| `OPENSANDBOX_API_KEY` | str | `""` | `OpenSandboxSettings` |
| `OPENSANDBOX_REQUEST_TIMEOUT_SECONDS` | int | `30` | `OpenSandboxSettings` |
| `OPENSANDBOX_CREATE_TIMEOUT_SECONDS` | int | `120` | `OpenSandboxSettings` |
| `OPENSANDBOX_READY_POLL_INTERVAL_MS` | int | `2000` | `OpenSandboxSettings` |
| `OPENSANDBOX_DISPATCH_MODE` | str | `"optional"` | `OpenSandboxSettings` |
| `SANDBOX_ARTIFACT_BUCKET` | str | `smartspec-sandbox-artifacts` | `OpenSandboxSettings` |
| `SANDBOX_SIGNED_URL_TTL_SECONDS` | int | `900` | `OpenSandboxSettings` |
| `SANDBOX_DEFAULT_NETWORK_ACTION` | str | `"deny"` | `OpenSandboxSettings` |
| `SANDBOX_MAX_CONCURRENT_GLOBAL` | int | `10` | `OpenSandboxSettings` |
| `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT` | int | `3` | `OpenSandboxSettings` |
| `SANDBOX_REQUIRE_FOR_SKILLS` | bool | `False` | `OpenSandboxSettings` |
| `SANDBOX_REQUIRE_FOR_MEDIA` | bool | `False` | `OpenSandboxSettings` |

### Variables Read by Hetzner OpenSandbox Server

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `OPENSANDBOX_API_KEY` | str | *(required)* | Authenticate incoming requests |
| `OPENSANDBOX_RUNTIME` | str | `docker` | Container runtime type |
| `OPENSANDBOX_DOCKER_NETWORK` | str | `sandbox-exec` | Sandbox container network |
| `OPENSANDBOX_DEFAULT_TIMEOUT` | int | `600` | Default sandbox TTL (seconds) |
| `OPENSANDBOX_MAX_SANDBOXES` | int | `20` | Max concurrent containers |

---

## Implementation Status: COMPLETE

### What was built

1. **`featureFlags.ts`** — Centralized feature flag module with 4 exported functions:
   - `isSandboxEnabled()` — strict `"true"` check on `process.env.OPENSANDBOX_ENABLED`
   - `getDispatchMode()` — returns `"optional"` or `"required"`, defaults to `"optional"`
   - `isFeatureRequiredForSandbox(featureType)` — per-feature flag lookup
   - `shouldUseSandboxForFeature(featureType, executionMode)` — combined routing decision

2. **Python `OpenSandboxSettings`** — Added 3 feature flag fields:
   - `OPENSANDBOX_DISPATCH_MODE` with `@field_validator` clamping to `"optional"`/`"required"`
   - `SANDBOX_REQUIRE_FOR_SKILLS` (bool, default False)
   - `SANDBOX_REQUIRE_FOR_MEDIA` (bool, default False)

3. **`.env.example` updates** — Both web and Python backends have full OpenSandbox config blocks

4. **Re-exported from `sandbox/index.ts`** — All 4 functions + `DispatchMode` type

### Test results

- TypeScript: 24/24 passed
- Python: 14/14 passed (including dispatch mode validation test)
- No `VITE_` prefixed sandbox variables found

### Code review fixes applied

- Added `_env_file=None` to all Python test `OpenSandboxSettings()` instantiations to prevent local `.env` file interference
- Added `@field_validator("OPENSANDBOX_DISPATCH_MODE")` to clamp invalid values to `"optional"`
- Added Python test for invalid dispatch mode rejection