# Test Design — Spec 224 Bind/Release Recovery

| Requirement | Observable behavior | Test level | Test location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|---|
| A persisted authorization binding is immutable; exact retries are allowed, conflicting bindings fail closed. | Compare the current durable binding with a candidate binding independent of object key order; changed fields are rejected. | Unit | `apps/web/server/services/__tests__/spec224AuthorizationBinding.test.ts` | RED: predicate absent; 1 focused test failed before implementation. | GREEN: final 7-file command passed; 102 tests. | Does not prove concurrent PostgreSQL transaction behavior. |
| Repeated authorization-hold release is idempotent only for the original binding. | Same binding returns success without a second event/outbox; changed binding returns false. | Control-plane contract | `apps/web/server/services/__tests__/jobControlPlane.test.ts` | RED: mutated post-release binding returned `true`; expected `false`. | GREEN: final focused command passed and asserted unchanged event/outbox counts. | In-memory repository only; PostgreSQL/crash proof remains deferred. |

Focused command: `pnpm --dir apps/web exec vitest run server/services/__tests__/spec224AuthorizationBinding.test.ts server/services/__tests__/jobControlPlane.test.ts server/services/__tests__/spec224DevelopmentRunPersistence.test.ts server/services/__tests__/spec224DevelopmentRunIntegration.test.ts server/services/__tests__/spec224AuthorizationRevocation.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx`.

GREEN result: 7 files, 102 tests passed; Prettier check and `git diff --check` passed.

Deferred: PostgreSQL concurrency/crash integration between binding persistence and hold release; runtime admission; browser workflow; TypeScript check (`SKIPPED_POLICY`).
