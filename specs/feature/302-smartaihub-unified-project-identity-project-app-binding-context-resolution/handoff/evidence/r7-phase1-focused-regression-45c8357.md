# R7 SPEC-302 Phase 1 focused regression

- Canonical source: `origin/main` at `45c8357329f033d9e9aca8559f3e5c8fd2258b28`
- Command: `pnpm exec vitest run server/_core/__tests__/context.appIngress.test.ts server/services/__tests__/appIngressMemoryRuntime.test.ts server/services/__tests__/projectResolutionAuthority.test.ts server/services/__tests__/spec302ProjectResolutionReplayContract.test.ts`
- Result: 4 test files passed; 75 tests passed.
- Scope: focused regression coverage for ingress context, App-bound memory runtime behavior, invocation-scoped project resolution authority, and replay contract.
- Limits: this run does not prove deployed ingress provenance, a live cross-App/Project acceptance, durable Project-shared receipt persistence, migration safety, or production behavior. Phase 2 remains gated on schema-owner assignment and explicit migration authorization. Durable Project-shared writes remain denied.
