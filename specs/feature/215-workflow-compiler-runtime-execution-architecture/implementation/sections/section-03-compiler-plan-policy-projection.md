# Section 03 implementation record — compiler, plan locking, policy projection

Status: partial / in progress.

## Implemented locally

- The compiler builds a deterministic immutable plan whose lock includes the semantic definition digest and ordered manifest digests.
- Per-node retry and timeout policies project into Feature 195 job definitions; overlapping policy declarations and invalid ranges fail closed.
- Validly shaped cache, budget, fallback, checkpoint policies, execution scopes, instrumentation attachments, and control/error/event edge channels are rejected with typed compiler errors because their runtime handlers are not wired. They can no longer be preserved in a plan and silently treated as enforced.
- Existing node/input schema, binding, edge-port, and graph-cycle checks remain on the canonical compile path.
- Admission validates each supplied workflow input against its declared JSON Schema, fills declared defaults, rejects missing required and unknown input keys, and hashes the normalized snapshot with canonical key ordering.
- Run persistence and idempotency replay use the resolved input snapshot; replay requires exact content/version/input/mode/target/checkpoint/selection/pinned-plan identity.
- Empty workflow graphs fail with a typed compiler error before node-job projection.

## Verification

- `npm test -- --run server/services/__tests__/workflowCompilerRuntimeContracts.test.ts server/services/__tests__/workflowStudioRuntime.test.ts server/services/__tests__/workflowBuilderCompiler.test.ts server/routers/__tests__/workflowStudio.test.ts` — 4 files, 32 tests passed.
- Regression tests assert unsupported declarations and channels are rejected before plan creation.

## Remaining acceptance gaps

- Live binding resolution, secret reference authorization, full unknown-field rejection across every node manifest, capability-binding revision pinning, and runtime policy enforcement require the configured exact-manifest adapter/bootstrap path.
- `workflow-input:<digest>` references currently have no durable input-artifact store or resolver; workflow run persistence retains the owner-visible input JSON, so large/sensitive input snapshot storage and adapter hydration remain unimplemented.
- This local fail-closed behavior is not evidence of execution support for rejected graph or policy constructs.
