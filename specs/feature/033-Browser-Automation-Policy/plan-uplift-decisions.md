# Plan Uplift Decisions

## 2026-03-10

Decision: `apply_all`

Applied items:

- `raw-guardrails`: added explicit startup and deployment guardrails that block tenant-facing raw browser enablement until the shared policy contract is wired and validated.
- `approval-events`: expanded the plan to require invalidation coverage for top-level navigation, subframe navigation, popup creation, and redirect-driven origin changes.
- `tenant-config-checks`: added regression expectations proving browser policy configuration comes from the new tenant-scoped policy tables rather than the global `tenant_automation` settings path.
- `privacy-tests`: added verification requirements that default audit, approval, and status payloads exclude raw DOM snippets and full screenshot blobs.
- `partition-runbook`: added concrete monitoring and runbook expectations for partition creation failures, retention drift, and fallback maintenance activation.
