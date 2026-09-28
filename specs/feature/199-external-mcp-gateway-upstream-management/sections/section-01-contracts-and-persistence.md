# Section 01 — Gateway Contracts and Persistence Mapping

## Source coverage

Feature 199 sections 1–8, 12, 17, 23, 26, 28–30 and codebase baseline.

## Deliverable

Define upstream/installation/connection/transport/protocol/tool/resource/prompt/credential/risk/quarantine/grant/revocation/execution contracts and map them to current MCP persistence before adding anything.

## Files

- Modify: `apps/web/server/services/mcp*`, MCP routers and `apps/web/drizzle/schema.ts` only for confirmed missing data
- Test: MCP schema/router/service contract tests

## TDD steps

Test current-table mapping, tenant uniqueness/idempotency, redaction, revocation and migration safety; implement minimal contracts/repositories; rerun focused tests.

## Completion gate

No parallel connection/job/Runner/RAG/approval/asset/audit truth is created.

