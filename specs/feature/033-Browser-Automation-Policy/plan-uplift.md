# Plan Uplift

## Recommended uplift items

### 1. Explicit non-production/raw-surface guardrails

- Severity: `high`
- Impact: `high-impact`
- Rationale: The plan states that the raw browser tool must remain production-disabled, but it will be stronger if launch criteria require a concrete startup or configuration guard that prevents accidental tenant enablement before shared policy integration is complete.
- Concrete plan delta to apply: Add an explicit rollout gate and deployment verification step that blocks tenant-facing raw browser enablement unless the shared policy contract is wired and health-checked.

### 2. Approval invalidation event coverage

- Severity: `high`
- Impact: `high-impact`
- Rationale: The user chose invalidation on any navigation, frame change, or popup change. The plan should call out concrete event coverage so implementers do not stop at top-level navigation only.
- Concrete plan delta to apply: Add a verification requirement that invalidation listeners cover main-frame navigation, subframe navigation, popup creation, and redirect-driven origin changes on the live execution path.

### 3. Tenant-config read path verification

- Severity: `medium`
- Impact: `low-impact`
- Rationale: The current codebase has a global `system_settings` model that looks tenant-like in the UI. The plan should make accidental fallback to global settings a testable anti-goal.
- Concrete plan delta to apply: Add compatibility and regression checks proving browser policy loads only from the dedicated tenant browser policy tables and never silently from global `tenant_automation` settings.

### 4. Minimal-evidence privacy tests

- Severity: `medium`
- Impact: `low-impact`
- Rationale: The privacy boundary is central to the user’s requirements. Without explicit tests, raw DOM snippets or screenshots could leak back in through debug code or approval payload expansion.
- Concrete plan delta to apply: Add tests and audit assertions that browser policy records and approval payloads exclude raw DOM and full screenshot blobs by default.

### 5. Partition operations runbook detail

- Severity: `medium`
- Impact: `low-impact`
- Rationale: The plan mentions `pg_partman` and a fallback, but it should more clearly define failure detection and operator response when maintenance lags or partition creation fails.
- Concrete plan delta to apply: Add monitoring and runbook steps for missed partition creation, retention drift, and safe fallback activation.
