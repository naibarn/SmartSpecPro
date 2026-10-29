# Microsoft Copilot Harness Integration — implementation plan

## Source and discovery

Source brief: `brief.md`. Requirements and authority boundary: `claude-spec.md`. The current Runner is Rust (`apps/runner-app`); external agent execution is governed by existing agent task dispatch, Runner commands, leases, approvals, workspace access and `worker_jobs`. Task Control currently exposes Codex model catalogs only. SPEC-310 is an unresolved draft that prohibits altering SPEC-309, so no canonical SPEC identity/status is claimed or rewritten in this task.

## Requirement ledger

| ID | Requirement | State | Section |
|---|---|---|---|
| R1 | Official SDK-backed Copilot Runner adapter, preserving current harnesses | OPEN | 01 |
| R2 | Secure runtime/auth/version/model readiness discovery | OPEN | 01 |
| R3 | Canonical job dispatch, lease, idempotency and session projection | OPEN | 02 |
| R4 | Lifecycle, normalized events, approval and workspace enforcement | OPEN | 01, 02 |
| R5 | Task Control harness and dynamic model selection | OPEN | 03 |
| R6 | Offline contract, isolation and regression coverage | OPEN | 04 |
| R7 | Distinguish subscription and Gateway modes; honest live evidence | OPEN | 01, 04 |

## Work plan

1. **Runner adapter:** inspect the exact official SDK APIs/version; implement registration, install/version/auth/model probes, session lifecycle, event normalization/redaction, and explicit unsupported/denied behavior. Never auto-install or rely on ambient login.
2. **Canonical dispatch:** extend the current provider contract, runtime admission and dispatcher. Bind adapter and selected verified model to the existing command/session projection. Preserve job, attempt, lease/fence, idempotency, approval, budget, staged input and workspace bindings. Do not add a ledger, route, or independent authority.
3. **Task Control:** use the existing capability/model catalog projection to expose Copilot and fresh available models, with actionable unavailable/auth-required states. Keep the existing provider flow.
4. **Verification:** add offline adapter/contract tests, run focused Rust and TypeScript tests, check security-sensitive paths and existing provider regressions, and record live E2E and SPEC authority limitations.

## Cross-layer contract

Web provider key: `microsoft_copilot`; Runner adapter ID: `microsoft-copilot.v1`. The web dispatcher maps the provider key to the Runner ID. Commands retain canonical tenant/user/job/attempt/lease/fencing/idempotency/workspace/authorization references. The selected model must come from a current verified Runner capability snapshot and be revalidated by Runner. SDK permission callbacks map to existing approval decisions; absent grants deny. Events contain only safe, redacted metadata.

## Definition of done and proof

1. Ready installs report SDK-discovered models; missing, unauthenticated, incompatible, or unhealthy installations remain unavailable.
2. Authorized tasks select and dispatch Copilot through existing job controls and return normalized, redacted results.
3. Tenant, workspace, lease, idempotency and approval boundaries fail closed with tests.
4. Focused Rust and web tests pass, with Codex/Claude regression coverage. Do not run repository-wide typecheck.
5. Exact revision, commands, outcomes, live auth availability and governance constraints are in the handoff.

Planned commands: `cargo test --manifest-path apps/runner-app/Cargo.toml` and focused Vitest invocations under `apps/web`. Live E2E is a separate acceptance predicate requiring authorized real Copilot credentials and a compatible Runner; it is blocked if those are absent.

## Risks and fallback

- SDK API/MSRV/target incompatibility: use only an inspected official release. Do not invent a protocol; keep unsupported targets unavailable until compatible.
- SDK tools may not honor SmartAIHub grants: deny arbitrary tools; never use blanket approval.
- No current Copilot CLI/auth: complete offline tests and report live E2E blocked with exact evidence.
- SPEC identity remains unresolved: preserve SPEC-309/310 and generated status; keep the proposal task-local pending canonical reconciliation.
