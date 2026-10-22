# WP1 Chat → Runner read-only observation checkpoint

- Source commit: `740cb3ea18d1159ceb3bfe8f64d2e3da8c127a2a`
- Scope: authenticated SmartAIHub Chat ingress to an owned, trusted local Runner
  through the existing Feature 195 `worker_jobs`/outbox and Runner control plane.
- Mode: observation only. Chat fixes `operation=observe` and `action=none`; it
  does not authorize browser side effects or provide an approval bypass.

## Implementation evidence

- `apps/web/server/routers/chat.ts` adds `chat.runOnRunner` and binds the request
  to the authenticated user, tenant, and conversation.
- `apps/web/server/services/computerUseFeature195Gateway.ts` remains the sole
  producer boundary. It validates Runner ownership, trust, session, fresh
  capability snapshot, browser readiness, and authorization evidence before
  creating one canonical durable job.
- `apps/web/server/services/computerUseRunnerJobExecutor.ts` and
  `apps/web/server/routes/runnerControl.ts` remain the execution path for lease,
  fencing, command dispatch, durable receipts, evidence references, and
  reconnect/unknown-outcome handling; this checkpoint adds no parallel engine.
- `apps/web/server/services/taskObservabilityReadModel.ts` already projects the
  top-level `conversationId` under tenant/user scope for Task Control history.

## Verification evidence

Focused command from the repository root:

```text
JWT_SECRET=<synthetic-test-secret> corepack pnpm --dir apps/web exec vitest run \
  server/services/__tests__/computerUseFeature195Gateway.test.ts \
  server/services/__tests__/computerUseRunnerJobExecutor.test.ts \
  server/services/__tests__/runnerJobCommandContracts.test.ts \
  server/routers/__tests__/chatUnifiedWiring.test.ts --reporter=dot
```

Result: 4 files passed, 40 tests passed. `git diff --check` passed. The Chat
router tests include both successful admission and cross-tenant rejection.
Twelve focused source-boundary review passes passed for identity, device trust,
durable admission, lease/fencing, read-only containment, idempotency, receipts,
Task Control projection, redaction, cancellation/reconnect, evidence
classification, and retired-system exclusion.

## Evidence boundary and remaining blockers

This is scoped source/test verification only. It is not a real-device E2E PASS,
Windows acceptance, Linux headless live acceptance, deployment proof, or
production approval. Those require an authenticated Runner channel, an
authorized device/session/capability grant, and owner-approved target
environment evidence. Existing SPEC-205/208/277 blockers remain open; SPEC-224
protected DevelopmentRun dispatch and SPEC-308 Web Mascot ownership are outside
this package and unchanged.

Ownership remains split by existing authorities: SPEC-205 owns Runner/device
and Chat control-surface integration, SPEC-208 owns Computer Use execution
semantics, and SPEC-277 owns Task Control projection/evidence. SPEC-279 remains
the MCP transport/canonical-task mapping authority; this Chat route does not
create an MCP task or replace canonical SmartAIHub work identity.
