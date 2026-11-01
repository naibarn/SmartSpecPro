# SPEC-224 control for Modular SaaS development — design

**Status:** For owner review; no implementation is authorized by this draft alone.

## Intent

Enable the existing SPEC-224 development lifecycle to plan, execute, verify, and report work across canonical Specs 312–324 and the separate `naibarn/smartaihub-platform` source repository. Give the owner one Project Management view for readiness and progress without creating another task ledger, requirement registry, scheduler, approval system, or execution authority.

## Findings this design addresses

- SPEC-224 already has a versioned SpecSet, an incremental compiler, WorkPackage declarations, and DevelopmentRun bindings. Its current SpecSet intake is workspace-bound and accepts uploaded Markdown/JSON artifacts.
- The compiler derives requirement identities from Markdown/JSON inputs and reads WorkPackages from explicit declarations. Specs 312–324 do not currently contain SPEC-224 WorkPackage declarations.
- Canonical requirements and per-Spec lifecycle evidence already live in each Spec's `handoff/manifest.json` and `handoff/requirement-ledger.json`; repository-wide projections are generated. These remain the authority.
- SPEC-294 already defines project/spec/repository Mission Control as a read model and command router over canonical owners. SPEC-277 remains the Task Control UX/read-model authority.
- Modular implementation source is in `naibarn/smartaihub-platform`; canonical requirements and deployment target mapping remain in SmartSpecPro.

## Approaches considered

1. **Create a separate project-management service and task store.** Rejected because it would duplicate Spec handoffs, SPEC-224 lifecycle, `worker_jobs`, and approval state.
2. **Use an external PM product as the primary board.** Rejected as the authority because it cannot own or verify the existing Run, source-SHA, Worker, and release contracts without a parallel synchronization system.
3. **Complete SPEC-294 over existing canonical authorities, with a SPEC-224 source adapter and WorkPackage binding.** Recommended. It provides a unified project view while preserving authority at the existing source.

## Recommended design

### Canonical source and identity

- Treat `specs/feature/312-.../spec.md` through `324-.../spec.md` and each existing handoff manifest/ledger as immutable inputs at an exact SmartSpecPro commit SHA.
- Treat `naibarn/smartaihub-platform` as the implementation repository and bind each Run to its exact source commit, repository identity, branch/workspace, and allowed write set.
- Resolve deployment targets through SmartSpecPro's `deployment-targets.json`; do not copy target/domain mappings into the application repository or infer environment from `NODE_ENV`.
- Record explicit cross-Spec dependency edges in each owning handoff's existing `dependencies.specs` field. Generate the project dependency graph from these edges; do not maintain a second edge list.

### SPEC-224 source adapter and executable work

- Add an authorized, read-only adapter that resolves canonical Spec files and handoff ledgers from a pinned SmartSpecPro revision and verifies their digests before compilation.
- Extend the normalized compiler input to preserve canonical requirement IDs and source references from requirement ledgers instead of deriving replacement IDs. Keep original Spec content and ledger rows as the sole normative requirement records.
- Define WorkPackages in one explicit execution-plan manifest for the R1.4 program, stored under the existing SPEC-312 handoff. Each package references Spec IDs and existing requirement IDs, plus dependencies, acceptance criteria, verification obligations, and an allowed write set. It contains no copied requirement text.
- Compile an immutable SpecSet/plan revision. A changed Spec, ledger, dependency, package definition, or source SHA creates a new revision and invalidates only affected evidence and dependent packages.
- Dispatch each executable WorkPackage through SPEC-224 DevelopmentRun and the existing `worker_jobs` plus transactional outbox. Preserve authorization, source admission, lease/fencing, tenant isolation, verification, and finality rules.

### Project Management surface

- Extend SPEC-294 Mission Control to show the R1.4 project, Specs, dependency graph, repositories, ready/running/blocked packages, Run/evidence links, stale evidence, and release readiness as a projection of canonical sources.
- Keep SPEC-277 Task Control for an individual task/Run and route commands to SPEC-224 or the correct existing owner. Mission Control does not execute tasks or persist competing lifecycle status.
- Show scoped readiness by Spec/package/target; never summarize a partial or local check as whole-project completion, UAT, or deployment.

### Environment boundary

- Develop and test against the local Modular runtime on port 3200. Preserve the existing `aimarkethubs.com` port 3100 service until its target-specific release path is healthy and an intentional handover occurs.
- Keep `smartsihub.com` production inactive and do not provision DNS, Cloudflare resources, or production release authority as part of this project-control work.

## Delivery slices

1. **Source binding and graph:** validate all 13 canonical Specs/handoffs at a pinned SHA; populate evidenced dependency edges; reject missing, cyclic, stale, or ambiguous references.
2. **Compiler adapter:** ingest those sources without copying requirements; preserve requirement IDs and produce a versioned dependency graph and WorkPackage readiness.
3. **One bounded pilot:** compile one low-risk SPEC-312/313 documentation or test-only package, bind it to the exact modular repository commit and write set, then exercise SPEC-224 prepare/run/verify without production effects.
4. **Mission Control projection:** display the pilot and full 312–324 portfolio from the same canonical read model; verify navigation, permissions, stale evidence, and truthful partial states.
5. **Progressive onboarding:** add implementation packages by dependency order; do not make unrelated packages wait for the full program or a complete SPEC-224 audit.

## Goals

- One project view for all 13 Specs, their dependencies, work, decisions, evidence, repositories, and target readiness.
- Stable traceability from canonical requirement ID and Spec SHA to WorkPackage, DevelopmentRun, code SHA, verification, integration, and target evidence.
- Incremental work can proceed where dependencies and verification are ready.
- No duplicate normative Specs, requirement database, PM task ledger, scheduler, or domain mapping.

## Non-goals and guardrails

- Replacing SPEC-224, SPEC-277, SPEC-294, the canonical Spec handoff writer, `worker_jobs`/outbox, or existing approval authority.
- Importing Specs into `smartaihub-platform` or copying requirement prose into WorkPackages.
- Activating production or changing existing development traffic.
- Claiming all Specs are executable until WorkPackage coverage and exact source bindings validate.

## Acceptance criteria for the design

- Every imported source resolves to one canonical repo/path/revision/digest; no duplicated requirement source is introduced.
- Every WorkPackage references existing canonical requirement IDs and has dependency, acceptance, verification, and write-scope data.
- Cycles, missing references, cross-tenant scope errors, stale SHA, and unsupported targets fail closed with actionable findings.
- SPEC-224 Run evidence binds to the exact SpecSet revision and modular repository SHA.
- Mission Control and Task Control show partial, blocked, verified, integrated, UAT, and deployed states distinctly from their canonical evidence.
- No production target or live traffic is activated by this work.

## Implementation decisions left open after design approval

- Exact normalized adapter contract and repository-fetch trust boundary.
- Exact package schema and pilot package selection after rechecking current canonical SHAs and handoff data.
- Which SPEC-294 API/read-model slice should expose the graph first.
- Focused verification profiles and the supported local runtime acceptance procedure.
