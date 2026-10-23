# Section 02 — Live Hosted Execution

- **Requirement IDs:** R5, R6, R10
- **Objective:** Prove real authenticated worker_jobs/outbox -> Gateway model execution -> source snapshot -> artifact storage and App Identity binding on disposable non-production infrastructure.
- **Owned paths:** Non-production runtime configuration, Mini-App acceptance scripts/fixtures, worker registration/dispatch integration and task-scoped evidence.
- **Prerequisites:** Section 01 integrated; disposable PostgreSQL target; existing non-production test identity, Gateway and GitHub authority.
- **Deliverables:** Exact run/job/app IDs, worker registration and settlement, actual Gateway receipt/model identity, source/artifact digests and private owner-bound artifact reference.
- **Verification:** Focused PostgreSQL/runtime acceptance; inspect durable job/outbox/receipt rows and compare appId/tenant/owner/artifact bindings. No deterministic model fixture for final run.
- **Completion predicate:** One actual prompt has a settled hosted run and persisted model-generated artifact bound to the same app identity.
- **Evidence:** Exact SHA, target name (no secrets), job/run/app IDs, redacted provider receipt, source/artifact digests, timestamps and outcomes.
- **Fallback:** Use the repository's dedicated `drizzle.mini-app-baseline.config.ts` disposable PostgreSQL lane; repair that profile or runtime bootstrap without applying the full production baseline chain or hand-building schema. Reuse provisioned non-production resources where valid.
- **Blocker challenge:** Check env allowlist, worker registry, outbox pump, Gateway endpoint/policy, and test tenant. Missing external IAM/provider authority is recorded exactly while all independent code work continues.
- **Waiting/reactivation:** Resource exhaustion waits for fresh resource evidence; missing authority waits on the exact existing policy owner. Retain source/artifact references and retry same run/app where idempotency allows.
