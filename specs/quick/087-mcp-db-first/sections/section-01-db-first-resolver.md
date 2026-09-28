# Section 01: DB-First Resolver

## Ownership

- `apps/web/server/services/mediaTransportResolver.ts`
- `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`

## TDD Expectations

Write selection tests first. Ensure each invocation calls the fresh DB-backed
list service even when an ID is supplied. Cover personal and shared rows,
duplicate shares of one connection, stale IDs, and multiple-account ambiguity.

## Acceptance

- Sole fresh eligible physical connection wins.
- A shared row remains subject to `assertMcpSharePolicyAllowed`.
- Returned group/share metadata comes from the policy result.
- No tenant or membership rule is duplicated or weakened.

## Risk

Treating duplicate group-share rows as multiple accounts would cause false
ambiguity. De-duplicate by connection ID but let policy choose the actual share.

## Implemented

- Modified `apps/web/server/services/mediaTransportResolver.ts`.
- Added five DB-first resolver regressions in
  `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`, covering
  sole shared, sole personal, duplicate group shares, valid fresh selection,
  and stale ambiguous selection.
- The resolver now calls `listMcpConnections` on every MCP request and
  de-duplicates by physical connection ID before selection.
- The existing policy service remains authoritative for the final share/group.

Verification: 16 resolver tests passed.
