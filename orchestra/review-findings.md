# Spec 214 Convergence Review

User requested at least 10 complete review/improvement rounds. Review records are numbered below. Every material local finding is repaired or explicitly bounded before a round is closed. Production/provider/database evidence remains external.

## Independent code reviews before convergence

### Node contract review — `/root/review_node_contract` (read-only; closed)

Found and routed: malformed derived ports; runtime-state leakage through binding constraints; weak node-instance/preset/binding checks; shallow manifest validation; unconstrained core config schemas; incomplete resolver metadata; missing retrieval-summary search; and admission booleans without provenance/reasons. Repairs: strict projection/config/instance/manifest validation, recursive runtime key coverage, resolver identity requirements, registry search coverage, and persisted admission/provenance metadata. Focused node suite passes.

### Compiler and builder review — `/root/review_builder_compiler` (read-only; closed)

Found and routed: `.default` binding acceptance; client-asserted readiness; missing required/cardinality input rules; open-world binding source; absent config source kind; derived ports not projected into compilation; and unvalidated scopes/policies/instrumentation. Repairs: concrete-reference rejection, draft-only readiness, required/cardinality/channel checks, closed source union including `config`, trusted projected-port input, and typed attachment config/target validation. Focused compiler/builder/router suites pass. Generic live binding resolution remains unverified and is never represented as ready.

### Studio and corpus review — `/root/review_studio_coverage` (read-only; closed)

Found and routed: array-order output inference; dangling/unsupported sources treated as workflow input; collapsed multi-input mapping; incomplete all-type adapter cases; disposition test not equal to Appendix A; R20 identities not checked; profile missing disposition references; and stale hashes. Repairs: edge-derived output, fail-closed topology, field-keyed bindings, all 16 ID adapter case, exact ordered Appendix A comparison, SHA-bound `UC-0001..UC-2930` identity index, profile linkage, and corpus-manifest hash verification. Focused coverage/adapter suites pass.

## Convergence rounds

### Round 1 — Manifest and node instance boundary

Reviewed manifest shape/enums, schemas for all 16 core types, secret/runtime key traversal, binding/preset/geometry checks, and extension metadata. Command: `JWT_SECRET=local-test-secret npm test -- --run shared/workflowNodeContracts.test.ts`. Result: PASS, 21 tests. No open local gap found.
### Round 2 — Spec 215 compiler and resolved port projection

Reviewed required input admission, cardinality/channel consistency, closed binding-source behavior, external declarations, derived port injection, immutable plan locking, and Feature 195 handoff. Command: `JWT_SECRET=local-test-secret npm test -- --run server/services/__tests__/workflowCompilerRuntimeContracts.test.ts`. Result: PASS, 9 tests. No open local gap found.
### Round 3 — AI Builder readiness and binding claims

Reviewed registry-derived type selection, placeholder binding rejection, false/true client readiness assertions, candidate status, and idempotent acceptance. Command: `JWT_SECRET=local-test-secret npm test -- --run server/services/__tests__/workflowBuilderCompiler.test.ts`. Result: PASS, 5 tests. The only remaining boundary is live binding/provider resolution, represented explicitly as unverified draft readiness.
### Round 4 — Studio topology and canonical conversion

Reviewed all 16 canonical IDs, virtual input/output treatment, edge-source/target classification, output source selection independent of array order, multi-field mapping, duplicates, and malformed legacy config. Command: `JWT_SECRET=local-test-secret npm test -- --run server/services/__tests__/workflowStudioCanonicalAdapter.test.ts`. Result: PASS, 10 tests. No open local gap found.
### Round 5 — Appendix A and R20 corpus identity

Reviewed exact ordered legacy disposition equality, 2,930 ordered identity-index hashes, locale/count alignment, 5,860 expected count semantics, profile links, and every declared corpus hash. Command: `JWT_SECRET=local-test-secret npm test -- --run shared/workflow214Coverage.test.ts`. Result: PASS, 3 tests. Local artifacts are integrity-checked; generated provider executions remain unproven.
### Round 6 — Router and definition persistence boundary

Reviewed protected builder procedures, Zod option shape, readiness field treatment, canonical definition validation before draft/publish, secret rejection, and stable route contracts. Command: `JWT_SECRET=local-test-secret npm test -- --run server/routers/__tests__/workflowStudio.test.ts server/services/__tests__/workflowStudioContracts.test.ts`. Result: PASS, 6 tests. Route output remains draft-only for unverified bindings.
### Round 7 — Runtime admission and data-binding integration

Reviewed runtime callers against new concrete binding and required-input rules, then checked input data binding behavior. Command: `JWT_SECRET=local-test-secret npm test -- --run server/services/__tests__/workflowStudioRuntime.test.ts server/services/__tests__/workflowDataBinding.test.ts`. Result: PASS, 7 tests. Test fixtures were updated to use concrete references and explicit required-input bindings.
### Round 8 — Existing browser-session node contract compatibility

Reviewed the adjacent browser-session node type integration for canonical type compatibility. Command: `JWT_SECRET=local-test-secret npm test -- --run shared/workflowBrowserSessionNodeTypes.test.ts`. Result: PASS, test suite clean. No UI/browser execution was implied by this shared contract test.
### Round 9 — Plan integrity, UI contracts, and retired-system boundary

Reviewed deep-plan section/manifest consistency, explicit UI N/A contracts, whitespace integrity, and scoped source for retired runtime identifiers. Commands: `check-sections.py --planning-dir ...`; `check-ui-contracts.py --planning-dir ...`; `git diff --check`; scoped `rg` retired-system scan. Result: PASS, 8/8 sections, UI contracts 8/8, clean diff check and no retired-system matches.
### Round 10 — Cross-surface focused regression

Reviewed all local Spec 214 dependencies together after the final schema/validator hardening. Command: focused Vitest run for node contracts, compiler, builder, adapter, coverage, Studio router/contracts/runtime, data bindings, and browser-session node types. Result: PASS, 10 files / 64 tests. Deep-plan section and UI validators pass 8/8; `git diff --check` clean.
### Round 11 — Final lifecycle, configuration, and post-hardening integration audit

Reviewed all implementation-state records after stricter lifecycle/version compatibility validation, verified the mixed worktree and restored archived tracked audit files, then reran the integrated focused suite and planning validators. Commands: final 10-file Vitest run; `check-sections.py`; `check-ui-contracts.py`; `git diff --check`. Result: PASS, 64 tests, 8/8 sections, 8/8 UI contracts, clean diff check. No local gap remains.

## Separate unrelated verification failure

A broader exploratory run also included `server/routers/__tests__/workflowTemplates.test.ts`, which fails because it imports missing `server/routers/workflow`. That test targets the prohibited legacy workflow surface from `AGENTS.md`; it is outside Spec 214's canonical `workflowStudio` router, was not changed, and must not be restored as a workaround. Its failure is reported separately and excluded from the focused Spec 214 gate.

## Direct Spec 214-to-implementation audit — 11 rounds

This audit was requested separately from the convergence rounds above. Each round compared normative requirements in the current `spec.md` with source and focused tests. Rounds 4, 5, 6, and 9 found local gaps; fixes were applied immediately, then rounds 10–11 rechecked them. “PASS local” does not certify production cutover or external services.

### Round 1 — Ownership and non-node boundaries

Compared Spec sections 0–1, 6, 40, and 45 with `workflowNodeContracts.ts`, `workflowCompilerRuntimeContracts.ts`, and `workflowStudioCanonicalAdapter.ts`. Node semantics stay in the canonical manifest; interface/bindings/scopes/policies/instrumentation and compiled execution stay in the compiler contract; virtual Studio input/output shells are converted without registry IDs. Feature 195 handoff remains the physical async job authority. Focused compiler and adapter tests pass. **PASS local**; production migration remains gated by inventory/rollback evidence.

### Round 2 — Taxonomy, non-node constructs, and legacy names

Compared sections 2–6, 21–22, 28–29, 33, 44–45, and Appendix A with the 16-ID registry and R20 disposition artifact. The registry has exactly the specified 16 IDs and no alias map. The prior test proved only representative legacy-name rejection, so this round added a check that every one of the 112 Appendix A names fails exact registry lookup. Static disposition equality and registry count tests pass. **PASS local**; this does not imply old persisted production data is absent.

### Round 3 — Manifest identity, semantic ownership, and execution declarations

Compared sections 7–9, 13–16, 36–37, and invariants 1/11/12 with manifest construction and validation. Schema-v4 fields are separated; manifest digest, stable language-neutral type IDs, execution/effects, resource, security, governance, compatibility, lifecycle, migration, and extension admission declarations are validated. Focused manifest tests pass. **PASS local**; third-party signature verification remains an explicitly open trust boundary.

### Round 4 — Typed ports, derivation, and config schemas

Compared sections 10–11, 37, 43, 44, and invariant 10. Found all 16 default port schemas were the same unconstrained object despite the spec’s typed minimum surfaces. Added per-type JSON Schema 2020-12 input/output contracts, including provenance-bearing retrieval output; preserved deterministic binding/config-derived port projection and config-schema rejection. Added regression coverage proving every canonical type has non-generic input/output schemas; all 16 also compile through Spec 215 in the compiler test. **GAP FIXED; PASS local**. Live descriptor resolution remains outside this pure contract package.

### Round 5 — Device-neutral human interaction

Compared sections 12 and Revision 5 acceptance additions. Found `human.input` and `human.approval` had no machine-readable interaction requirements. Added validated `interaction.*` capability declarations (`text`, `choice`, `approval`) without encoding a client/device, plus tests. Registry still contains one `automation.computer_use` semantic ID. **GAP FIXED; PASS local**. Cross-client initiation and surface selection require Spec 225/226 runtime/UI proof.

### Round 6 — Spec 229 retrieval alignment

Compared Revision 6 and `SAH-RETRIEVAL-2` with `data.retrieval`. Found no retrieval-intent enum or typed normalized evidence/degradation output. Added provider-neutral intent values, request fields for exact identifiers/source/visibility/language/freshness/evidence budget, and output schema requiring trace, provider profile/version, query plan, authorized evidence provenance, quality-gate and degradation state. Added validation rejecting ACL-denied evidence and skill-discovery results lacking candidate-only marking; provider names remain output metadata and do not enter type identity. **Local contract GAP FIXED; PASS local**. Exact-ID query execution, ACL enforcement by Spec 229, provider substitution invariance at runtime, and degraded retrieval end-to-end remain **OPEN external integration gates**; the current source snapshot has no Retrieval Broker V2.

### Round 7 — AI Builder, presets, bindings, registry, and extension guardrails

Compared sections 17–20, 33–38 and 44 with registry search, binding validation, builder compiler, router, and tests. Search is bounded and semantic; builder cannot invent a type or turn an unverified client readiness claim into ready status; required bindings reject placeholders; extension registration requires evidence/provenance. Full top-pair ranking against live descriptor indexes and trusted binding/lifecycle/runtime availability resolution are not implemented in this local slice and stay **OPEN integration gates**. Focused builder/router tests pass. No local blocker found beyond those recorded gates.

### Round 8 — Spec 215 compile contract and all 16 core types

Compared sections 0, 10, 37, 40, 43–45 with `compileWorkflowDefinition`. It validates node versions, instances, ports, edge channels, bindings, required/cardinality inputs, acyclic graphs and typed attachments; plans lock manifest digests. Added/ran one compile conformance case for each of the 16 registered types. **PASS local: all 16 compile**. Scheduler, runtime adapter, lease, side-effect authorization, and recovery behavior are Spec 215/Feature 195 runtime proof and are not certified by compilation.

### Round 9 — Studio cutover, virtual interface, and clean-slate controls

Compared section 41, Appendix A/B, and sections 4/44 with the Studio canonical adapter/router. Adapter maps legacy editor shells to WorkflowInterface and refuses unsupported/dangling/ambiguous topology; it does not register legacy aliases. R20 fixture equality verifies all 112 dispositions. Full replacement of old persisted/runtime branches, the post-cutover CI scan across all authored workflows/presets/dispatch code, and destructive migration safety are not established in this checkout; those remain **OPEN cutover gates**, requiring inventory and rollback evidence before deletion.

### Round 10 — Corpus identity and acceptance claims

Compared sections 2, 30–32, 42, 44, 46–47 with R20 manifest/profile/identity tests. Current local tests prove 2,930 bilingual records, `UC-0001..UC-2930` identity hashes, 5,860 expected prompt count, 112 Appendix A rows, linked profile revision, and declared file hashes. They do not run 5,860 authenticated Builder generations, execute workflows, classify every execution gap, or independently grade outcomes. Those acceptance items remain **OPEN external certification gates**, not reported as complete.

### Round 11 — Re-run of changed contracts and scope boundary

Re-ran the five focused suites covering node contracts, corpus coverage, compiler, builder, and Studio adapter after Rounds 4–9: **5 files / 51 tests passed**. Then re-ran the integrated Spec 214 suite across contracts, compiler, builder, adapter, R20 coverage, router, runtime, and browser-session compatibility: **10 files / 67 tests passed**, including all-16 compile, interaction/retrieval schema and security cases, exact rejection of all 112 legacy names, and R20 identity/hash checks. Section and UI-contract validators pass **8/8**; scoped `git diff --check` passes. No repo-wide typecheck was run. The direct comparison found no additional local contract gap; remaining items are the external/cross-spec gates listed above.
