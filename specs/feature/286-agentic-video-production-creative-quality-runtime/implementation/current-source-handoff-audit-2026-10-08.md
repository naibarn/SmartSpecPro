# SPEC-286 Current Source and Handoff Audit — 2026-10-08

## Authority and freshness

| Evidence | Finding |
|---|---|
| Configured source | `origin/main`; workspace and remote-tracking ref both resolve to `236d5022d687b08a0a87d1b6afd67db754fc501d` at audit start. Worktree was clean. |
| Canonical spec identity | `specs/feature/286-agentic-video-production-creative-quality-runtime/` is indexed as a canonical path, but `specs/_status/spec-index.json` reports `authority=UNRESOLVED`, `confidence=LOW`, `canonical_sha=null`; `specs/_config/spec-id-registry.json` has no SPEC-286 owner binding. Do not hand-edit generated status or infer ownership solely from the folder name. |
| Latest generated handoff | `handoff/STATUS.md`: `DORMANT_UNRESOLVED`, lifecycle `DISCOVERING`, `RECONCILIATION_REQUIRED`, 0/684 requirements passed, generation 2. It is generated from manifest and ledger and is not implementation evidence. |
| Existing source reconciliation | G0.1 is based on `4f4e35fadd388a8950cf801cb45c64de46c645c9` (2026-10-05); its implementation-owner conclusions were refreshed against the audit SHA below. |
| PR history | GitHub PR search for `SPEC-286` found only unrelated legacy spec-upload PRs; recent video-related PR inventory had no dedicated SPEC-286 implementation PR. PR #286 is a Mini App test PR and is unrelated. |
| Runtime evidence | No authenticated Windows Runner execution receipt or job/artifact receipt was available in this task context. This means execution is unverified here; it does not prove that no Windows runner is registered in a live control plane. |

## Related source / handoff matrix

| Surface | Status | Source and existing test/evidence | Handoff / gap |
|---|---|---|---|
| SPEC-133 / Motion Template Registry | **Implemented, extension partial** | `apps/web/shared/videoIntelligence/motionTemplates.ts`; `apps/web/server/remotion/templates/index.ts`; `apps/web/shared/videoIntelligence/__tests__/motionTemplates.select.test.ts`; G0.1 source inventory | Registry is the owner. Semantic discovery against prompt/style/ratio/duration/capabilities and route-reason evidence remain acceptance gaps for this task. |
| Remotion compiler / renderer | **Implemented** | `apps/web/server/services/videoProjectCompiler.ts`; `packages/remotion-render/src/renderVideoJob.ts`; `apps/remotion-executor`; `specs/feature/145-hermes-remotion-render-executor/implementation/evidence.md` | Code-level executor and focused tests exist. Feature 145 still lists signed native pack and real Windows/macOS render/artifact parity as external gates. No SPEC-286 golden run is evidenced. |
| VideoProjectDocument / motion candidates | **Implemented** | `apps/web/shared/videoIntelligence/projectSchemas.ts`; `apps/web/server/services/videoProjectMotionDirector.ts`; tests `projectSchemas.test.ts`, `videoProjectMotionDirector.test.ts` | Candidate flow is non-destructive and revision-aware. Generated source-code candidate schema/sandbox binding is not evidenced. |
| Video Studio UI / Timeline | **Implemented, enhancement partial** | `apps/web/client/src/pages/VideoStudioWorkspacePage.tsx`; `apps/web/client/src/components/videoStudio/timelineProjection.ts`; Feature 143 `spec.md` and timeline tests | Existing surface/timeline is reused. Template-vs-generation explanation and candidate review affordance for this task are not yet demonstrated. |
| Feature 184 / Web Video Editor worker | **Implemented, adjacent dependency** | `specs/feature/184-web-video-editor-headless-worker/spec.md`; existing FFmpeg/Remotion adapters and `worker_jobs` contracts | This is an adjacent worker/editor path, not a reason to create a second Motion Studio renderer or timeline. SPEC-286 integration stays adapter-based and must preserve exact revision/output provenance. |
| Rendered visual evidence | **Partial; WP0.4 blocked** | Existing parity harness `apps/web/scripts/remotion-parity-test.ts` and `apps/web/test-fixtures/remotion-parity/`; committed report under `apps/web/test-results/remotion-parity/` | Parity artifacts are historical and use different fixtures. No current A/B/C golden outputs, contact sheets, exact project revision, or cost/time comparison are available. |
| Creative critic / auto repair | **Partial** | `apps/web/server/services/videoProjectQualityLoop.ts`; `videoProjectReviewAdapter.ts`; `videoProjectRepairApplier.ts`; corresponding service tests; Feature 142 verification report | Deterministic bounded review/repair exists. Evidence-bound rendered visual critique and targeted repair from A/B/C execution remain unverified. |
| Generated Motion Sandbox | **Missing as an enabled execution capability; security gate required** | R1.7 sections 11 / WP6 specify isolation; local source search did not find an implementation module for generated Remotion code execution | No generated code may be run. Keep the feature disabled; design/implement only after WP0.4 and a security-gate owner/review. |
| Template reuse / promotion | **Partial** | Existing template registry, motion candidates, and Skill promotion governance referenced in SPEC-286 / related asset governance | Existing templates/candidates are reusable. Tenant/private/marketplace promotion with motion-specific provenance and rights evidence is not execution-certified here. |
| SPEC-224 orchestration | **Implemented as authority contract; SPEC-286 binding unresolved** | SPEC-224 canonical runtime and handoff artifacts; existing `worker_jobs`/outbox ownership described by G0.1 | No duplicate orchestration/job authority is permitted. Current SPEC-286 handoff remains low-confidence/unresolved, so a verified requirement binding is still needed. |
| SPEC-267 execution control plane | **Existing dependency; readiness not runtime-certified** | `specs/feature/267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2/spec.md`; `apps/web/server/routes/runnerControl.ts`; runner registry/control-plane source | Use existing Runner Authority and `worker_jobs`. No live runner inventory or Windows assignment receipt was accessible in this audit. |
| Windows / Linux runner | **Blocked for execution evidence** | Feature 145 documents Windows 11 target, signing and real render/artifact gates; current host platform is Linux | Windows-first render has not run in this task context. Linux requires separate readiness/evidence; do not infer Linux executor support from host OS or static tests. |

## Cost and quality comparison

| Fixture | Baseline render | Candidate render | Cost/time delta | Visual score / repair burden |
|---|---|---|---|---|
| A — Product Motion Ad, 15s, 9:16 | **NOT RUN** | **NOT RUN** | **UNKNOWN** | **UNKNOWN** |
| B — Motion Infographic, 20s, 16:9 | **NOT RUN** | **NOT RUN** | **UNKNOWN** | **UNKNOWN** |
| C — Logo / 3D Motion, 10s, 1:1 | **NOT RUN** | **NOT RUN** | **UNKNOWN** | **UNKNOWN** |

No model/provider cost comparison is claimed. “Awesome Opus 5.5 Videos” is treated as a product inspiration/source, not as authorization to bind SmartAIHub to a provider. Compare providers only through normalized project inputs, identical fixtures, measured price basis, and the same quality rubric after WP0.4.

## Next bounded work packages

1. **WP0.4 — Runner-authorized golden capture:** obtain Windows Runner Authority/readiness and execute fixtures A/B/C through the real Remotion path; retain immutable input/output digests, revision, job, runtime, QA result, contact sheet, time and cost.
2. **WP0.4-Linux — Separate platform evidence:** establish Linux readiness independently and run the same fixture contract only if authorized and supported; record a blocker otherwise.
3. **WP1.1 — Only after WP0.4:** normalized adapters over current project/revision/QA/job owners; no DDL by default.
4. **WP3.1 / WP3.2:** rendered frame/contact-sheet evidence and deterministic visual QC using current artifacts and QA authority.
5. **WP4 / WP5:** visual critic and targeted repair only after evidence contracts are bound and replayable.
6. **WP6 security gate:** isolated generated-component compile/render design, threat review, and negative tests before any AI-generated code can execute.
7. **WP7 UX:** integrate route explanation and candidate review into existing Video Studio with desktop/tablet/mobile acceptance after the runtime path is safe.

## Blockers and explicit non-claims

- No current authenticated Windows runner assignment, execution, or output artifact receipt was available; therefore WP0.4 is **BLOCKED**, not passed.
- Linux readiness and render evidence are separately **NOT VERIFIED**.
- No production deployment, feature-flag enablement, database migration, or provider-paid generation was performed.
- Generated code was not compiled or executed; the security gate remains **NOT PASSED**.
- The 684 unresolved status count is generated handoff state, not a measured count of missing implementation. Resolve canonical Spec identity and requirement mapping through `tools.spec_handoff`; do not hand-edit `STATUS.md`, `_status`, or ledgers.
