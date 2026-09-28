# SocratiCode Windows Migration Planning Package

Planning status: complete; execution not authorized.

## Start here

- `MIGRATION_PLAN.md` — canonical execution runbook.
- `WINDOWS_CODEX_HANDOFF.md` — short authority and bootstrap contract.
- `evidence-manifest.template.yaml` — execution evidence schema.

## Planning trace

- `request.md` — original objective, constraints, and deliverables.
- `claude-research.md` — server inventory and official-platform research.
- `claude-interview.md` — user decisions and non-blocking unknowns.
- `claude-spec.md` — requirements and acceptance criteria.
- `claude-plan.md` — architecture and phased implementation blueprint.
- `claude-plan-tdd.md` — verification-first test plan.
- `self-review.md` — completeness, adversarial, and cross-section reviews.
- `sections/index.md` — section manifest and dependency order.
- `sections/section-01-secure-bootstrap-preflight.md`
- `sections/section-02-server-inventory-data-boundary.md`
- `sections/section-03-source-transfer.md`
- `sections/section-04-local-runtime-index.md`
- `sections/section-05-validation-cutover-rollback.md`

## Default decision

Use a clean clone under the WSL Linux filesystem, a local Codex stdio MCP
process, a resource-limited external Qdrant under Docker Desktop, local Ollama,
and a fresh local SocratiCode index.

The server remains disabled. Dirty work and Qdrant snapshots are separate,
explicit approval gates. Destructive cleanup is not part of this plan.
