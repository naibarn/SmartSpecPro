# Deep Plan Research — Spec 214

## Research decision
- Codebase research: required; this is an existing git repository with partial contracts and consumers.
- Web research: skipped; current task is to complete local contracts against the supplied spec and repo. No external API behavior is being changed.
- Testing: focused Vitest in `apps/web`, plus Node/Python static data validation. Full TypeScript check is prohibited by repository AGENTS RAM policy.
- Discovery fallback: SocratiCode MCP/codebase tools are not registered in this runtime. Used targeted `rg`, bounded reads, JSON inspection with `python3`, and source/test evidence.

## Current source evidence
- `apps/web/server/services/workflowNodeContracts.ts`: 16 canonical IDs, digest generation, basic exact registry, semantic search, presets/binding requirement helpers, and instance checks for required/allowed binding, secret-like config keys, and runtime metadata keys. The shape is partial: no derived effect declaration, runtime resources, governance, richer UI descriptor, lifecycle `quarantined`, migration/history API, schema validation of config, or port projection resolver.
- `apps/web/server/services/workflowCompilerRuntimeContracts.ts`: partial WorkflowDefinitionV2 and Spec 215 v3 compile plan; compiler validates known node IDs/versions and declared fixed ports but does not implement full runtime scheduling. It is a consumer boundary, not permission to move Spec 215 ownership into 214.
- `apps/web/server/services/workflowStudioCanonicalAdapter.ts`: closed legacy-to-canonical conversion table and virtual input/output handling exist. This is migration intake, not registry alias support. Preserve fail-closed behavior for unsupported types.
- `apps/web/server/services/workflowBuilderCompiler.ts`: creates canonical candidates from current options but contains generic/default bindings and a small intent matcher; it must not imply real binding readiness or live provider availability.
- `apps/web/server/services/workflowStudioContracts.ts`, `workflowStudioRuntime.ts`, and `routers/workflowStudio.ts`: validate and expose portions of the canonical contract; their focused tests provide regression anchors.
- Tests already exist for node contracts, compiler/runtime contracts, Studio adapters, builder compiler, Studio contracts/runtime, and router operations.
- Feature 195 remains the physical durable execution/job authority; no new queue, scheduler, lease, or event ledger belongs in this task.

## Corpus and migration evidence
- Spec 212 R20 artifacts identify 2,930 bilingual use cases, 5,860 canonical prompts, and 16 canonical core IDs.
- `spec-214-spec212-coverage-manifest-r20.json` references `spec-214-112-nodeType-clean-slate-disposition.json`; targeted file discovery found no such artifact.
- R20 profile/coverage manifest still declares Spec 214 revision 5 while the supplied spec is revision 6; align these metadata fields and protect them with tests.
- Spec 214 Appendix A contains the 112-name disposition table; convert it to a machine-readable evidence artifact and verify count, unique IDs, allowed dispositions, and canonical targets.
- The spec and existing migration `0341_feature_209_workflow_studio.sql` acknowledge persisted Workflow Studio structures. Local source cannot establish production data contents, migration state, rollback readiness, or deployed activation.

## Proposed implementation boundary
Complete and validate the semantic contract, exact registry, authoring integration, static corpus/disposition evidence, and focused tests. Keep Spec 215 runtime lifecycle, Feature 195 physical jobs, live provider generation, deployment, and destructive production cutover outside local claims.
