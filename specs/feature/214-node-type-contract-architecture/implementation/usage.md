# Spec 214 Implementation Usage

## Contract entry points

- `apps/web/server/services/workflowNodeContracts.ts`: canonical 16-type registry, manifest validation, instances, projections, extension admission.
- `apps/web/server/services/workflowCompilerRuntimeContracts.ts`: Spec 215 definition validation, compile lock, run/attempt records, Feature 195 handoff.
- `apps/web/server/services/workflowStudioCanonicalAdapter.ts`: fail-closed legacy Studio conversion.
- `apps/web/server/services/workflowBuilderCompiler.ts`: canonical draft generation; it does not certify runtime/provider readiness.

## Focused verification

Run from `apps/web`:

```sh
JWT_SECRET=local-test-secret npm test -- --run shared/workflowNodeContracts.test.ts server/services/__tests__/workflowCompilerRuntimeContracts.test.ts server/services/__tests__/workflowBuilderCompiler.test.ts server/services/__tests__/workflowStudioCanonicalAdapter.test.ts shared/workflow214Coverage.test.ts server/routers/__tests__/workflowStudio.test.ts server/services/__tests__/workflowStudioContracts.test.ts server/services/__tests__/workflowStudioRuntime.test.ts server/services/__tests__/workflowDataBinding.test.ts shared/workflowBrowserSessionNodeTypes.test.ts
```

The repository-wide TypeScript check is intentionally skipped under `AGENTS.md`. No production data migration, provider execution, or deployment is included.
