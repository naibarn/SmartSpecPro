# Microsoft Copilot Harness — focused verification plan

## Section 01 — Runner adapter

- Missing executable/runtime returns `not_installed` and never `ready`.
- Installed but unauthenticated, unhealthy, or incompatible SDK returns an actionable unavailable/auth-required state without leaking credential contents.
- Model list is obtained from the SDK probe; an empty catalog or stale catalog cannot authorize a selection.
- Permission callback denies absent grants; only allowlisted and explicitly granted operations proceed.
- Event mapper emits supported public lifecycle/tool events, redacts reasoning and sensitive arguments, and preserves ordering metadata.
- Session cancel/disconnect removes active state; unsupported resume returns an explicit typed error.
- Workspace and valid lease/fence are required before invoking a tool/session operation.

## Section 02 — dispatch/admission

- `microsoft_copilot` maps to exactly `microsoft-copilot.v1` through the existing runner command.
- Dispatch includes the existing authorization, budget, workspace, lease, attempt, selected model and idempotency bindings.
- Duplicate dispatch remains duplicate under retries; stale/expired lease and unsupported runtime fail closed.
- Existing Codex and Claude admission/dispatcher tests remain unchanged in outcome.

## Section 03 — Task Control

- Copilot catalog is visible only for a Copilot-capable Runner and is derived from its current model snapshot.
- A model can be selected only when advertised, ready, fresh, and tied to the current runner/account fingerprint.
- Missing auth/runtime presents actionable status and cannot dispatch.
- Existing Codex catalog and provider selection continue to work.

## Section 04 — regression and handoff

- Run focused Rust and web suites for changed files; record exact outputs and revision.
- Scan owned diff for accidental credentials, raw private reasoning, and unconditional approval.
- Report live E2E as blocked unless real authorized auth is present; no synthetic PASS.
