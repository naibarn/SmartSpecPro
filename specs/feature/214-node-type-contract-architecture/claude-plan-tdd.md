# TDD Plan — Spec 214

| Section | First failing test / acceptance | Focused proof |
|---|---|---|
| 01 Manifest contract | Types/validator cover all required v4 fields, effect union, governance/resources, lifecycle and one-source-of-truth constraints | `workflowNodeContracts.test.ts` |
| 02 Registry/version/search | Exact lookup, historical lookup only for retained manifest, compact search, preset/version compatibility, coverage metadata | `workflowNodeContracts.test.ts` |
| 03 Instance/schema projection | Reject invalid config/ports/bindings/secrets/runtime keys; deterministic projection; distinguish absent/null; extension admission checks | `workflowNodeContracts.test.ts` |
| 04 Spec 215 compiler consumption | Compile rejects invalid projected ports/contracts while keeping interface/scopes/policies/instrumentation outside manifests | `workflowCompilerRuntimeContracts.test.ts` |
| 05 Studio adapter boundary | Only canonical 16 types enter semantic definition; virtual IO is interface; unknown legacy types fail closed and mapping is not a registry alias | `workflowStudioCanonicalAdapter.test.ts`, Studio router tests |
| 06 AI Builder selection | Candidate uses registered semantic pairs and cannot treat placeholder/unready binding as available; unknown type fails closed | `workflowBuilderCompiler.test.ts`, Studio router tests |
| 07 Extension and 112 disposition | Admission checks reject provider-only duplicates; exact 112 disposition IDs are unique and targets/dispositions valid | new focused coverage test |
| 08 R20 static coverage and final integration | 2,930 IDs, locales TH/EN, 5,860 expected prompts, 16 canonical IDs, and Spec 214 revision 6 match R20 artifacts; no live execution claim | new focused coverage test; existing workflow service/router suites |

Repository typecheck is skipped by explicit AGENTS.md policy. No tests outside these touched boundaries are required.
