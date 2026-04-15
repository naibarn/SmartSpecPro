# TDD Plan

## Write tests first

### 1. Worker access-key lifecycle

Add tests for:

- create returns a one-time raw secret
- list shows only metadata, not the raw secret
- key state transitions among draft, active, expired, revoked, and rotated
- revoke immediately disables the key
- expired keys cannot be redeemed
- tenant/user mismatches fail closed
- revoked registrations reject future worker-bound token verification
- active-key count limits are enforced
- rotate creates a new key and invalidates the old one atomically

Expected failing condition before implementation:

- the current codebase has no worker access-key domain, so create/list/revoke tests should fail until the new service exists.

### 2. Settings tab UX

Add tests for:

- `Settings` shows a `Workers` tab when the feature is enabled
- the panel renders in both English and Thai
- the key creation dialog shows the selected runtime family, expiry, and helper guidance
- the secret display modal only appears once at creation time

Expected failing condition before implementation:

- there is no tab/panel yet, so component tests should fail on missing elements.

### 3. Registration handshake

Add tests for:

- a worker can redeem the created key and register successfully
- runtime-family mismatches are rejected
- pinned LLM provider routing is preserved in the worker snapshot and worker policy snapshot
- auto-routing stays available when no provider pin is configured
- revoked/expired keys are rejected
- successful registration writes the correct owner and metadata fields

Expected failing condition before implementation:

- registration still depends on the existing token flow, not on a self-service access-key object.

### 4. Permissions and quotas

Add tests for:

- preset permissions map to the intended allowlist
- advanced allowlist changes persist safely
- hourly, daily, weekly, and monthly quotas are stored and read back
- over-quota usage is blocked server-side
- freeform scopes are rejected if they are not in the server-side vocabulary
- tenant-gated users see the explanatory locked state and cannot redeem keys

Expected failing condition before implementation:

- the Settings UI cannot yet edit worker permission envelopes or quota settings.

### 5. Help content and localization

Add tests for:

- English and Thai help pages load
- the Settings page links to the correct help topic
- the onboarding text mentions create, redeem, revoke, permissions, and quotas
- the onboarding text explains what metadata is captured and what is intentionally redacted
- the onboarding text explains the active-key limit and the one-time secret rule

Expected failing condition before implementation:

- no new help topic exists yet.

## Regression checks

- Existing worker registration tests must keep passing.
- Existing Hermes and OpenClaw worker routing must keep passing.
- Existing user API keys and LLM key flows must not change behavior.
- Existing worker budget enforcement must still read the same underlying policy model.
