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

## Direct Spec 214-to-implementation audit — follow-up cycle (12 rounds)

This is a new audit cycle after the prior 11-round audit. Each round traces requirements to implementation and tests. Gaps found in rounds 7–9 were fixed immediately and included in the final integrated rerun. External/provider/runtime gates remain open and are not represented as local completion.

### Round 1 — Authority boundaries and non-node workflow constructs

Rechecked sections 0–6, 21–22, 40, and 45 against the canonical type IDs, compiler plan contract, and Studio adapter. Inputs/outputs remain interface contracts; retries, budgets, and observability remain policy/instrumentation attachments; no queue/runtime state was added to Spec 214. **PASS local**. Production cutover and inventory proof remain open.

### Round 2 — Exact taxonomy and legacy disposition

Rechecked section 2, sections 28–29, Appendix A, and invariant 4 against `CORE_NODE_TYPE_IDS`, exact registry lookup, and the R20 disposition fixture. The 16 IDs remain canonical and all 112 old names are tested as unknown; no aliases were added. **PASS local**; persisted production data inventory remains an external gate.

### Round 3 — Manifest identity, digest, lifecycle, and governance

Rechecked sections 7–16 and 36–37 against manifest construction, canonical digest validation, config/port validation, lifecycle compatibility, and extension provenance tests. **PASS local**. Third-party signature verification remains outside this local contract layer.

### Round 4 — Typed ports and binding/config projection

Rechecked sections 10–11, 20, 37, 43–45 and invariant 10 against all 16 schemas, deterministic derived port IDs, compiler port projection, and malformed payload/config tests. **PASS local**. Live descriptor-backed projection remains a Spec 215 integration gate.

### Round 5 — Human interaction and client neutrality

Rechecked section 12 and Revision 5 against `interaction.text`, `interaction.choice`, and `interaction.approval` requirements and the human-input/approval manifest tests. The contract declares capability requirements without selecting a device or client. **PASS local**; Spec 225/226 surface selection and cross-client initiation remain open.

### Round 6 — Retrieval provenance, ACL, and degradation

Rechecked Revision 6 and `SAH-RETRIEVAL-2` against the typed retrieval intent/evidence contract and tests for ACL-denied evidence, candidate-only skill discovery, and degraded results. **PASS local**. Live Retrieval Broker, exact-ID lane, production ACL, and provider-invariance E2E remain open under Spec 229.

### Round 7 — Capability and trigger descriptor contracts

Sections 20.1, 20.2, 33–34 require typed capability/trigger descriptors, exact versioned identities, schema contracts, authoring visibility, effects, trust/runtime declarations, and exclusion of system-only capabilities from normal discovery. The local node-contract package had no descriptor validators or registry. Added `CapabilityDescriptor`, `TriggerDescriptor`, validation, exact identity registration, and authorable capability search that excludes `system-only`; added valid/invalid schema/effect and filtering tests. **GAP FIXED; PASS local**. Binding resolution against live model/agent/capability catalogs and runtime policy remains a cross-spec gate.

### Round 8 — Semantic separation and extension admission

Rechecked sections 21–22, 31, 39, 43.2, and 44. Extension admission tests reject proposals substitutable by capabilities/bindings/composition. The mandatory cross-family examples were only implicitly represented by registry membership; no focused assertion distinguished data transform vs loop, data join vs flow join, and model inference vs router. Added a focused regression test asserting their execution classes, config contracts, binding semantics, and distinct identities. **GAP FIXED; PASS local**.

### Round 9 — Thai/English node display metadata

Section 39 requires TH/EN display metadata. All 16 manifests referenced generated name, description, and compact-label keys, but neither workflow locale had those keys. Added 48 localized entries per locale and a registry-driven coverage test requiring each canonical manifest's three keys in both locales. **GAP FIXED; PASS local**.

### Round 10 — Studio router, persistence, and authoring guardrails

Rechecked sections 17–20, 38, 40–41 against the protected `workflowStudio` router, builder compiler, canonical adapter, and contract/runtime suites. Client readiness remains non-authoritative and unverified bindings remain draft; drafts are validated before persistence/publication. **PASS local**. Full production catalog pairing and authenticated generation are still gated.

### Round 11 — R20 corpus, hashes, and acceptance accounting

Rechecked sections 30–32, 42, 44, and 47 against bilingual records, identity hashes, manifest hashes, expected 5,860 prompt count, and Appendix A equality. Local files prove corpus integrity and counts only; they do not prove authenticated generations, execution success, gap attribution, or independent grading. **PASS local artifacts; external acceptance OPEN**.

### Round 12 — Integrated recheck after repairs

Re-ran all 10 focused Spec 214 suites: `workflowNodeContracts`, `workflow214Coverage`, compiler runtime contracts, builder compiler, Studio adapter/contracts/runtime/router, data binding, and browser-session node types. **PASS: 10 files / 70 tests** (including descriptor validation, semantic boundary, and all TH/EN name/description/compact keys). `git diff --check` passes. Repo-wide typecheck remains intentionally skipped per `AGENTS.md`. No local Spec 214 gap remains in the checked source slice; all open items are the external/cross-spec gates listed above.

## Direct Spec 214-to-implementation audit — second follow-up cycle (10 rounds)

This is a fresh 10-round comparison. Round 6 found that the capability descriptor contract added in the previous cycle was not connected to Builder selection: the Studio route accepted a client-supplied capability reference, and the descriptor registry was only exercised by its unit test. The Builder now fails closed unless a server-held, unique, authorable descriptor resolves; tests cover public success plus unknown/system-only blocking. The live Studio capability catalog remains an explicit cross-spec gate because no trusted catalog loader is present in this checkout.

### Round 1 — Canonical taxonomy and alias boundary

Compared Spec sections 2–6, 28–29, invariants 1/4, and Appendix A with `CORE_NODE_TYPE_IDS`, registry lookup, and disposition conformance. Exactly 16 canonical types remain registered; all 112 legacy names remain non-resolving. No retired alias path was found. **PASS local**.

### Round 2 — Manifest identity and schema-v4 authority

Compared sections 7–9, 13–16, and 36–37 with manifest construction and validation. Identity/digest, single-source execution/effects, lifecycle, security/governance, runtime resources, UI, Builder metadata, and compatibility are validated in the manifest contract. Focused contract tests pass. **PASS local**; package signature attestation remains an external trust gate.

### Round 3 — Typed ports, config, and deterministic projection

Compared sections 10–11, 20, 37, 43–45 with the per-type 2020-12 schemas, derived-port resolver identities, stable IDs, projected-port compiler input, and malformed schema/payload tests. **PASS local**. Binding-derived projection at runtime still depends on Spec 215's trusted resolver.

### Round 4 — Capability and trigger descriptor minimum fields

Compared sections 20.1–20.2 and 33–34 with descriptor validation/registry. Capability schemas/effects/protocol/placement/visibility/trust and trigger kind/config/output/security/runtime fields are validated; duplicate exact identities are rejected; authorable search omits `system-only`. **PASS local contract**. This registry is an in-memory contract, not proof of a populated production catalog.

### Round 5 — Binding validation and executable readiness

Compared section 20, AI Builder pair selection (section 17), guardrails (38), and acceptance criteria (44) with `compileWorkflowDefinition` and `workflowBuilderCompiler`. Type/binding-kind/placeholder validation and draft-only unverified readiness are enforced. Model/agent/provider availability remains cross-spec runtime resolution. **PASS local with explicit readiness block**.

### Round 6 — System-only capability selection in Workflow Studio

Compared sections 20.1, 34, 38, 39, 44 and audit pass 23 with the actual router payload and Builder call graph. Found the descriptor registry was used only in tests: `workflowStudio` passed caller-supplied options directly, so an unknown or system-only capability ref could appear in a draft candidate. Added server-side descriptor resolution in `optionForType`; missing, ambiguous, version mismatch, unsupported range, and system-only matches now produce `CAPABILITY_GAP`. Exact, supported `^`/`~` ranges, and latest-compatible stable versions resolve deterministically. Added tests for valid public, unknown, and system-only bindings. **GAP FIXED local**. The live catalog is **OPEN CROSS_SPEC_GATE** and the route now blocks capability candidates until it is connected.

### Round 7 — Builder node selection and client readiness

Compared sections 17, 34, 38, and the section-06 plan with option filtering, canonical type lookup, required binding checks, readiness handling, and acceptance idempotency. Unknown types cannot be selected; client `ready` stays advisory; candidates remain drafts. **PASS local**; top-compatible-pair ranking against all live binding indexes is not implemented in this source slice and remains an integration gate.

### Round 8 — Spec 215 compiler and Workflow Studio persistence

Compared sections 0, 37, 40–41 and all 16-type conformance cases with compiler topology, binding/input/cardinality validation, locked manifest digests, Studio adapter, protected procedures, and draft/publish persistence checks. **PASS local**; scheduler, adapter execution, lease/recovery, and production cutover proof remain outside this contract suite.

### Round 9 — Human, retrieval, and localization behavior

Compared Revision 5/6 and section 39 with device-neutral human capability declarations, normalized retrieval provenance/ACL/degradation tests, and TH/EN name/description/compact keys for all 16 types. **PASS local**. Spec 225/226 client initiation and Spec 229 broker/ACL E2E remain open.

### Round 10 — R20 acceptance, remaining blocks, and integrated rerun

Compared sections 30–32, 42, 44, and 47 plus the lifecycle gap ledger with corpus identities/counts/hashes and the actual cross-spec dependencies. Static artifacts verify 2,930 use cases / 5,860 expected prompts; authenticated generations, execution outcomes, independent grading, production inventory/rollback, live catalogs, and cross-client/runtime integration remain accurately marked OPEN. Re-ran 10 focused suites after the repair: **10 files / 72 tests passed**; planning section/UI validators pass 8/8, locale JSON parsing and `git diff --check` pass. No repo-local Spec 214 implementation gap remains in this checked slice.
