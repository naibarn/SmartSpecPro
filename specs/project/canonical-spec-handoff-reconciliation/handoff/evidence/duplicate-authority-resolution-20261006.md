# Duplicate Spec-ID authority resolution — 2026-10-06

## Scope and baseline

- Workunit: `REVIEW_DUPLICATE_SPEC_ID_GROUPS`.
- Baseline: `origin/main` `8779e6ef697212f22836f2020a4ec6ec0c590d4d`.
- Source was refreshed in an isolated, clean canonical worktree; the user's dirty primary checkout was preserved.
- The earlier `duplicate-spec-id-authority-review-20261006.md` remains historical evidence. Its proposed 293–295 allocation and unresolved recommendations predate SpecR10 and are superseded by this review.
- No SpecR10 content was re-imported or changed.

## Safe ID allocation before mutation

The allocator read the configured inventory and sidecar reservation/history data before any renumbering. It counted canonical Specs, canonical-root drafts, actual historical Spec records, explicit reserved/history IDs, aliases, and pending/imported IDs. Date-shaped inventory candidates such as `2026-08-11-*` were not treated as Spec IDs. The current inventory contained 307 canonical Specs and 463 total records; 289–295 were occupied. A repository-wide candidate check found no allocation or explicit Spec-ID claim for 296–301, and no matching top-level Spec directories existed.

| Allocation order | ID | Pre-mutation result |
|---:|---:|---|
| 1 | 296 | `NEXT_SAFE_SPEC_ID` |
| 2 | 297 | `NEXT_SAFE_SPEC_ID` |
| 3 | 298 | `NEXT_SAFE_SPEC_ID` |
| 4 | 299 | `NEXT_SAFE_SPEC_ID` |
| 5 | 300 | `NEXT_SAFE_SPEC_ID` |
| 6 | 301 | `NEXT_SAFE_SPEC_ID` |

The allocator deliberately starts above the highest held identity rather than reusing gaps. IDs 289–295 were verified occupied; 293, 294, and 295 are the SpecR10 records.

## Authority determinations

| Group | Retained canonical authority | Other candidate | Classification and evidence |
|---|---|---|---|
| 000 | `specs/feature/000-AgentsSkill` | Silence Detection → 296 | Follow the explicit workunit authority decision: AgentsSkill retains 000. Its title claims `000` and the current Orchestra skill is the corresponding product. Silence Detection is a distinct capability referenced semantically by Feature 193 and is moved with a source-digest alias. Git history shows the Silence Detection file entered before AgentsSkill and is recorded as conflicting chronology evidence; its title does not claim 000. |
| 014 | `specs/feature/014-Core-Funnel-Dashboard` | Presentation AI Layout → 299 | Core Funnel predates Presentation in Git, explicitly claims Feature 014, and has `/admin/funnel` implementation and tests. Presentation's normative heading does not claim 014; its own implementation comments labelled Spec 014 were corrected to Spec 299. The copied Section 07 references in Core's generated Handoff are stale evidence, not ownership. Confidence: HIGH. |
| 031 | `specs/feature/031-PlaywrightVision` | Social Ads → 297 | PlaywrightVision explicitly claims 031, predates Social Ads, has active browser automation implementation, and is named by canonical Specs 032/033. Social Ads is independent and has no competing authority chain. Confidence: HIGH. |
| 045 | `specs/feature/045-HybridSkillOrchestrator` | Celery JWT Refactor → 300 | Hybrid is the earlier Spec 045 and has active code, tests, and source labels across skill orchestration. Celery JWT was added later and is planning/security documentation without a dependency that supersedes Hybrid. The renamed documentation is preserved; retired Agency systems are not revived. Confidence: HIGH. |
| 058 | `specs/feature/058-meta-channels` | Agency Creator → historical | Meta Channels retains active canonical authority and implementation. The Agency Creator source has no active code/runtime references and concerns the retired Agency system; its bytes are moved unchanged to the configured historical root. No new ID is allocated. |
| 059 | `specs/feature/059-knplabai-multi-provider-expansion` | External Worker Runtime → 301 | KNPLabs predates External Worker, explicitly claims 059, and has retained provider code and tests. External Worker is later and Draft, but remains a valuable umbrella worker-runtime baseline with downstream canonical dependencies; those dependencies are retargeted to 301. Specs 071/077 supersede only specified OpenClaw/ZeroClaw wording, not the entire umbrella. This separates ID ownership from implementation and dependency continuity. Confidence: HIGH. |
| 162 | `specs/feature/162-vertical-drama-broll-media-intelligence-worker` | 162/163 Gap Closure → historical implementation evidence | B-roll retains the explicit Feature 162 identity and is referenced by later Specs 179/191. The second document is a combined gap-closure implementation artifact, not an independent Spec; it is moved byte-for-byte to the configured historical root. No new ID is allocated. |
| 164 | `specs/feature/164-worker-app-ux-localization-and-series-workspace` | Prompt Expansion → 298 | Worker App UX explicitly claims 164. Prompt Expansion is a distinct quick Spec whose collision comes from its directory prefix; it receives 298 with its original digest and path recorded. |

The 014/045/059 recommendations are source-backed and sufficiently decisive; no manual repository inspection decision is required. Authority is not inferred from implementation alone. Git history, normative ID claims, active implementation, explicit dependencies, and supersession scope are considered separately.

## Registry and migration contract

`specs/_config/spec-id-registry.json` is a versioned sidecar. Renumber aliases retain old/new IDs, logical title, original and canonical paths, source and canonical digests, reason, authority references, baseline SHA, integrated SHA, effective state, and semantic-reference-repair status. A historical ID resolves only through one target; where the old ID remains owned by another canonical Spec, the old path disambiguates the displaced identity and a bare current-ID lookup retains the canonical owner. Aliases are not inventory records and do not establish authority.

Agency Creator and 162/163 Gap Closure are retained under `specs/_history/spec-id-conflicts` and exposed as alternate-root historical evidence. Neither is counted as a second canonical authority. Restoration is a reversible path move; no source files were deleted.

## Evidence matrix for re-evaluated groups

### ID 014

| Evidence dimension | Core Funnel candidate | Presentation Layout candidate |
|---|---|---|
| Title / path | `Feature 014: Core Funnel Dashboard`; `specs/feature/014-Core-Funnel-Dashboard/spec.md:1` | `Spec: Presentation AI Layout Intelligence`; now `specs/quick/299-presentation-ai-layout-intelligence/spec.md:1` |
| First authority evidence | Explicit Feature 014 heading; Git first-added `0729e3b` (2026-02-16) | No numeric ID claim in normative title; Git first-added `b151633` (2026-03-15) |
| Original ID evidence | Directory, normative heading, dedicated implementation and Handoff all identify 014 | Directory prefix caused collision; implementation comments (`deckConsistency.ts`, `layoutTelemetry.ts`, `qualityGate.ts`) were stale 014 labels and now identify Spec 299 |
| Implementation / references | `apps/web/server/routers/funnelAnalytics.ts`, funnel schema/migrations, and router tests | Active presentation layout/telemetry/quality-gate implementation; refs updated to 299 |
| Handoff / supersession | Previously `AUTHORITY_CONFLICT`; copied Section 07 excerpts were not owner evidence; no supersession claim | Previously `AUTHORITY_CONFLICT`; now refreshed to 299; no supersession claim |
| Runtime and migration risk | Active admin funnel runtime; moving it risks breaking established `/admin/funnel` identity | Independent active work; moving requires preserving code labels and path references, now repaired |
| Decision | Retain 014 | Renumber 299 — HIGH confidence |

### ID 045

| Evidence dimension | Hybrid Skill Orchestrator candidate | Celery JWT Refactor candidate |
|---|---|---|
| Title / path | `Feature 045: Hybrid Skill Orchestrator`; `specs/feature/045-HybridSkillOrchestrator/spec.md:1` | `Feature 045: Remove JWT from Celery Task Arguments`; now `specs/feature/300-celery-jwt-refactor/spec.md:1` |
| First authority evidence | Git first-added `3901a26` (2026-03-16) | Git first-added `96936e9` (2026-03-18) |
| Original ID evidence | Explicit title plus continuing code labels across the skill pipeline | Explicit duplicate title, but later Git introduction and no successor/dependency that supersedes Hybrid |
| Implementation / references | Active runtime and tests including `skillCatalog.ts`, `skillParamExtractor.ts`, `skillPipelineEngine`, `chat.ts`; Feature 080 names the canonical Hybrid path | Planning/security documents; no corresponding active implementation for this Spec was found. Its target examples refer to retired Agency paths and are not reactivated |
| Handoff / supersession | Previously `AUTHORITY_CONFLICT`; no whole-Spec supersession | Previously `AUTHORITY_CONFLICT`; no supersession claim supporting ownership |
| Runtime and migration risk | High cost to move because implementation and source comments consistently identify 045 | Lower migration risk; preserve history and renumber documentation; do not revive Agency |
| Decision | Retain 045 | Renumber 300 — HIGH confidence |

### ID 059

| Evidence dimension | KNPLabs provider candidate | External Worker Runtime candidate |
|---|---|---|
| Title / path | `059 — KNPLabs AI Multi-Provider Expansion`; `specs/feature/059-knplabai-multi-provider-expansion/spec.md:1` | `059 - SmartSpecPro Distributed Worker Runtime`; now `specs/feature/301-external-worker-provider-framework/spec.md:1` |
| First authority evidence | Git first-added `6074d9b` (2026-03-24) | Git first-added `e018513` (2026-03-30) |
| Original ID evidence | Earlier explicit 059 claim | Later explicit 059 heading; establishes distinct Spec content but not earlier ownership |
| Implementation evidence | Retained provider implementation including `python-backend/app/llm_proxy/providers/knplabai_provider.py`; provider router/seed/UI/test references exist | Draft architecture baseline; meaningful implementation/runtime evidence is mainly in follow-on Specs, not a reason to award 059 |
| Downstream dependencies / references | Depends on 054 and 050; Feature 065 references the KNPLabs candidate | Canonical Specs 071, 072, 074, 075, 076, 077, and 135 refer to its path/worker-fabric role; those references now identify 301 |
| Handoff / supersession | Previously `AUTHORITY_CONFLICT`; no broad supersession evidence | 071 says the worker-runtime direction remains an umbrella; 071 supersedes OpenClaw-specific positioning and 077/075 supersede only narrow ZeroClaw/desktop wording |
| Current runtime / migration risk | Active provider behavior makes moving KNPLabs costly and semantically misleading | Preserve umbrella baseline and all downstream edges while changing its numeric identity; no dependency is deleted |
| Decision | Retain 059 | Renumber 301 — HIGH confidence |

## Validation and remaining state

- Canonical baseline: `8779e6ef697212f22836f2020a4ec6ec0c590d4d`; integration SHA is recorded after promotion.
- Inventory after mutation: 305 canonical Specs, 463 total inventory records, 302 relationship-graph candidate edges, and 331 open ambiguity-review records. The remaining ambiguity records cover other confidence/relevance and source-reference review; they do not represent duplicate authority in these eight groups.
- All 8 target groups now have deterministic dispositions. IDs 000, 014, 031, 045, 058, 059, 162, and 164 each have exactly one canonical authority. IDs 296–301 each have exactly one new canonical Spec; no duplicate canonical ID group remains in inventory.
- Six versioned alias records were created; two historical dispositions preserve 058 Agency Creator and 162/163 Gap Closure outside canonical roots. All six old source digests match the baseline bytes; all current target digests match canonical inventory.
- Semantic path references and dependencies were repaired, including the 071/072/074/075/076/077/135 worker-runtime references to Spec 301 and Presentation Section 07 implementation labels to Spec 299.
- `index --check`: PASS; `validate --all`: PASS; 21 impacted Handoffs were reconciled; authority decisions were written through the shared optimistic Handoff writer.
- Alias/provenance tests, Handoff framework tests, skill audit, and the 40-case scenario matrix are run and reported in the integration evidence update.
- Repository-wide Spec reconciliation, the remaining 331-record evidence review, and the overall Canonical Spec Handoff migration remain open. Next workunit: continue evidence-led review beyond these eight duplicate-ID groups.
- Spec 288 trailing whitespace remains unchanged as preserved archive/provenance debt and does not block this workunit.
