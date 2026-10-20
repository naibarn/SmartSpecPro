# Section 04 — WP34: skill-invocation

Priority: P0. Primary owners: SPEC-256 plus 198 consumers.

## Prerequisites

WP31 and 256 documented identity; WP32 event envelope. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/orchestratorCapabilityCatalogService.ts; apps/web/server/services/skillRegistry.ts; apps/web/server/services/skillExecutor.ts; apps/web/server/routers/chat.ts`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Reuse registry/catalog projection for search/describe/select receipts and exact version/digest. Revalidate policy, capabilities, freshness, source trust and budget before effect; use canonical queue/outbox for long work. Preserve direct single-function choice. Discovery is not install/invoke permission. Remediate new-path access to retained direct Python execution without using retired runtime.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Private/hidden/revoked/stale Skill offers, malformed input, unsupported provider, retired type, long-execution admission and duplicate invocation. Inspect canonical queue audit before invoking external tools.

Scenario scope: `UW-05 UW-07 UW-10 UW-17 UW-18 UW-24 UW-28 UW-32` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-256-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

No new public MCP skills protocol or Skill registry. Existing generic defaults are not SPEC256 rollout evidence; visibility and execution enablement are separate.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
