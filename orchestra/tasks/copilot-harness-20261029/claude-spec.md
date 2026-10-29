# Microsoft Copilot Harness Integration — implementation spec

## Authority and scope

This is a task-local implementation spec derived from the user brief. Repository discovery found SPEC-310 marked as an unresolved draft and it explicitly prohibits editing canonical SPEC-309. Therefore this task does not claim a new canonical SPEC identity, alter generated SPEC status, or rewrite either document. Any future canonical amendment must follow the repository's SPEC identity reconciliation. The implementation is additive to current Runner, `worker_jobs`, lease, approval, workspace, and Task Control contracts.

## Requirements

- R1. Add a `microsoft-copilot` / `microsoft-copilot.v1` Runner adapter using the official Copilot SDK/runtime interface supported by the pinned dependency version. Keep Codex, Claude, Pi, and other adapters intact.
- R2. Discover runtime installation, version, authentication, availability, and model catalog dynamically. An empty, unauthenticated, incompatible, or failed probe must never report ready. Do not expose secrets or rely on an administrator's ambient credentials.
- R3. Dispatch through the existing external-agent task contract, authenticated Runner command, canonical job/attempt lease and idempotency key, execution-session projection, approval binding, budget binding, and workspace boundary. Do not add a job ledger or independent permission authority.
- R4. Create/resume/send/stream/cancel/disconnect sessions through the Runner. Normalize public events, redact private reasoning and secret/tool payload fields, and route permission requests through existing approval capabilities. Fail closed for unsupported tools or ungranted actions.
- R5. Expose only freshly discovered Copilot models to the existing Task Control model selector, with availability/authentication status and capability limits. Do not hardcode model names or create a model registry.
- R6. Test discovery, model selection, dispatch idempotency, event mapping/redaction, workspace and tenant isolation, permission denial, cancel/resume behavior where SDK supports it, and existing provider regressions using offline contract tests. A live E2E must be reported as blocked unless real authorized credentials are available.
- R7. Keep Gateway BYOK separate from Copilot account/subscription authentication. Do not claim Gateway routing or accounting until the installed official SDK demonstrably supports the required provider endpoint and accounting contract.

## Current contract decisions

- `worker_jobs` and its outbox remain the execution authority; a Copilot session is provider state attached to the existing run/attempt.
- Runner validates lease/fence and workspace before provider operations. The provider adapter receives only the selected workspace and explicit approved capabilities.
- Existing authorization grants and approval decisions are authoritative. SDK callbacks cannot independently approve operations.
- Use the official SDK API present in the pinned version. If the SDK cannot enforce the required tool/permission boundary, expose read-only/unavailable behavior instead of unsafe execution.
- The repository currently has no Copilot CLI/auth installation in the development environment. No live success may be fabricated.

## Definition of done

1. A ready Copilot installation can be discovered with models from the SDK, while absent or unauthenticated installations remain unavailable.
2. An authorized Copilot task can be selected and dispatched using existing job controls and returns normalized, redacted events/results through the existing execution path.
3. Tenant, workspace, lease, idempotency, and approval boundaries fail closed and have regression tests.
4. Existing harness tests remain passing in focused scope; changed Rust and TypeScript paths compile/test at focused scope.
5. SPEC governance is accurately represented; offline verification and any live-auth blocker are recorded in the task handoff.
