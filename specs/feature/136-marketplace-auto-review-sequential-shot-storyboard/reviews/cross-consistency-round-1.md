# Cross-Consistency Review — Round 1 (all 12 section files)

Date: 2026-07-21
Scope: deep-plan step 20.5 (Phase C). Section files are written by isolated
subagents that cannot see each other's output, so this pass checks the seams:
interface mismatches, coverage gaps, overlaps, dependency-order violations,
and self-containment.

Result: **12/12 sections present** (`check-sections.py` → `state: "complete"`).
**10 defects found and fixed** directly in the section files across three
passes:

- Pass 1 (interface seams): D1–D4.
- Pass 2 (executability): **D5 — BLOCKER**, nobody owned the `prompt_plan`
  call site, so every section could ship and the feature would still be
  inert; plus D6 (spec §6.1 stage-split divergence, now recorded).
- Pass 3 (data channels & unowned requirements): **D7** — the
  `product_reference_model_conflict` blocker had no field to read, making a
  spec hard-failure unimplementable; **D8** — `assembly_documented` had no
  producer for the 3x3 path; **D9** — the §24 untrusted-content rule never
  reached the skill body (taught-not-wired class); **D10** — partial-failure
  credit semantics unstated.

No coverage gap and no dependency-order violation remain.

---

## 1. Dependency map (what each section exports → who consumes it)

| Producer | Exported contract | Consumers |
|---|---|---|
| 01 | flags `marketplaceSequentialStoryboard` / `marketplaceReviewEvidenceGuard`; enum `sequential_shot_storyboard`; 5 override fields; blocker `sequential_storyboard_disabled`; `sequentialStoryboardEnabled` plan input; snapshot baselines | all |
| 02 | `shared/marketplaceCapture/referenceIndexMap.ts` (`ReferenceIndexEntry`, `findReferenceIndexMappingMismatches`, `buildReferenceIndexMappingCorrectionDirective`); SVC `resolveSequentialReferenceAttachmentPlan`, `approvedSequentialProductReferenceUrls`, `getSequentialReferenceImageModelCap`, `enforceSequentialReferenceIndexMapping`; metadata `productAngleReferenceAssetPack`, `sequentialStoryboard.referenceManifest` | 04, 05, 06, 09, 11 |
| 03 | skill bundle + frozen marker table + input/output JSON schemas | 04 (contract), 09/12 (marker) |
| 04 | `PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID`, `runProductReviewSequentialStoryboardSkillLoop`, `validateSequentialStoryboardPackPreflight`, `resolveSequentialImagePromptBudget`, `SequentialStoryboardLoopEffects` (incl. `emitAudit`), 13 blocker ids, `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS`, **`SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER`**, **`detectSequentialPromptPriceClaims`** | 05, 06, 08, 09, 11, 12 |
| 05 | `shared/marketplaceCapture/sequentialEvidencePreview.ts` (`buildSequentialEvidencePreview`, **`computeSequentialReferenceCapacity`**); `computeMarketplaceAutoReviewChildSubjectPolicy`; `applySequentialStoryboardPackToRunMetadata`; plan `evidencePreview` + `referenceCapacity` | 02, 06, 07, 11 |
| 06 | unit ids `sequential-shot-01..09` + role `sequential_shot_frame` (via the **single** id builder); metrics ingredients on `imageAttemptReviews[]`; `unitCandidateSelections` | 07, 08, 09, 12 |
| 07 | `resolveMarketplaceReviewEvidenceGuardContext`, 3 directive builders, `RunMetadata.evidenceGuard`, markers `GUARDIAN PRESENCE LOCK:` / `DEMONSTRATION EVIDENCE LOCK:` / `CLAIM SAFETY EXCLUSIONS:`, reason codes `guardian_presence_missing` / `assembly_content_unverified` | 06 (QA fold), 09, 11, 12 |
| 08 | router `regenerateAutoReviewSequentialShot` + `saveAutoReviewSequentialShotOverride`; `shared/marketplaceCapture/sequentialShotBlockerCopy.ts`; `refreshSequentialShotPromptWithSkill` (added to 04's module); metadata `shotOverrides` / `shotRegenerations` / `userRegenerationAllowance` | 06 (override precedence), 09 (video_prompt override), 11 |
| 09 | video capability gate + blocker `sequential_video_model_no_start_frame`; sequential video preflight/attachment/duration resolvers | 11 (plan-card blocked state) |
| 10 | `HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT` (9), `…_COMPLEXITY_FACTOR` (1.1), `resolveHyperframesAutoPlanImageJobCount`, `imageJobCount` estimate field, `copy.imageJobsEstimated` | 11, 12 |
| 11 | client lib `marketplaceSequentialStoryboardUi.ts` + 5 components + copy keys | — |
| 12 | `marketplaceAutoReviewObservability.ts` (7 events, emitter, metrics recorder), `marketplaceAutoReviewSequentialGate.ts`, GA runbook | — |

---

## 2. Defects found and fixed

### D1 — Duplicate ownership of the capacity arithmetic (HIGH)

**Found:** section 02 computes reservation/trim inside
`resolveSequentialReferenceAttachmentPlan`; section 05 exports a pure
`computeSequentialReferenceCapacity` and hedged ("if 02 already exports
equivalent arithmetic, reuse it; otherwise 02 should adopt this helper");
section 11 delegates to 05's helper for the live capacity meter. Two
implementations of the same rule = the UI meter can drift from what the
server actually attaches, which is exactly the "no surprise" property the
meter exists to provide.

**Fix (section 02 §6, new invariant 8):** 05's shared helper is the single
arithmetic source; 02's resolver calls it and layers on the server-only
concerns it owns (URL resolution, dedupe, attachment ORDER, evidence-only
exclusion, fail-closed throw). Re-deriving trim rules in 02 or 11 is now
explicitly prohibited.

### D2 — Unit-id scheme had no owner (HIGH)

**Found:** section 06 builds `sequential-shot-0N` inline inside
`buildInitialImageUnits`; section 08 requires the SAME id when regenerating
one shot and noted "`directImageUnitIdForFrameRole` must already be
sequential-aware… if not, fix it there" — pointing at a section that never
claimed the work. An inline second scheme silently breaks per-unit attempt
counting (`nextDirectAttempt` keys on `unitId`) and can make a regeneration
resubmit the wrong unit.

**Fix (section 06 §5.2):** section 06 explicitly OWNS the id scheme — make
`directImageUnitIdForFrameRole` sequential-aware and have
`buildInitialImageUnits` call it; add a test asserting both agree for all 9
shots.

### D3 — `guardianReferenceRef` vs `guardianReferenceIndex` looked like a typo (MEDIUM)

**Found:** sections 05/11 persist `guardianReferenceRef` (asset ref);
sections 03/07 consume `guardianReferenceIndex` (1-based `@ImageN` position).
Nothing said they are different fields, so an implementer would "unify" them
and break either the identity anchor or the prompt binding.

**Fix (section 05 §5.2):** both fields documented side by side — the ref is
the persisted identity, the index is derived at prompt-build time from the
ref + the live manifest and is deliberately never persisted (the position
changes when the manifest changes).

### D4 — Cross-section constants were described but not declared as exports (MEDIUM)

**Found:** section 09's video preflight and section 12's gate evaluator both
need the global-block marker literal and the price detector; section 04
described both as internal checks without naming exports. Section 09
defensively said "if not exported, add them in 04's module" — correct
instinct, but the contract belonged in 04.

**Fix (section 04 §6):** `SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER` and
`detectSequentialPromptPriceClaims` are now declared exports of the runner
module, with the rationale (one literal shared by the skill body and every
checker), plus explicit notes that the `prompt_kind` union serves both image
and video optimizer calls and that section 08 adds
`refreshSequentialShotPromptWithSkill` to the same module.

### D5 — Nobody owned the `prompt_plan` call site (BLOCKER)

**Found (completeness pass):** section 04 stated three times that "section-06
calls it inside `prompt_plan`"; section 06's scope boundaries assigned skill
invocation to section 04 and never mentioned
`runProductReviewSequentialStoryboardSkillLoop` at all; section 05 described
persistence "after the runner returns". The result: all 12 sections could be
implemented exactly as written and **a sequential run would never produce a
pack** — the feature would be inert. Also unowned in the same seam: building
the runner's production `effects` (section 04 delegated the binding), the
pre-call `childSubjectPolicy` computation, the fail-closed capacity check
placement relative to LLM spend, and the degraded-fallback catch.

**Fix:** ownership assigned to **section 05** (it already owned the
`prompt_plan` write point, the policy computation, and persistence). New
section 05 §5.0 specifies `runSequentialPromptPlanStage` with a 9-step
contract — strategy gate → idempotent resume → fail-closed reference/capacity
resolution before any LLM spend → policy pre-computation → effects
construction with DB-durable per-round persistence → invoke → mapping
enforcement → persist → degraded fallback — plus 7 tests. Section 04's three
"section-06 calls it" references and section 06's scope-boundary line were
corrected; section 05's objective, file table, the sections index, and
claude-plan.md WS-5 were updated to match.

Two latent defects were caught while writing the contract:
- `persistRoundReport` must write to the **DB** each round, not merge
  in-memory only — otherwise section 04's documented mid-loop resume is a
  no-op after a restart.
- The capacity check must run **before** the runner, not at image submission —
  otherwise an impossible model cap is discovered only after the planning LLM
  has already been paid for.

### D6 — spec §6.1 stage split vs one-call implementation (documentation)

**Found:** spec §6.1's flow diagram splits the skill across two stages
(`concept_story` = Phases A–E, `prompt_plan` = Phases F–K). Every section
implements ONE runner call covering A–K, because the shipped engine completes
both stage rows in the same advance step (SVC:18099-18153). Nothing recorded
the divergence, so a future reader comparing spec to code would file it as a
bug.

**Fix:** explicit reconciliation note in section 05 §5.0 — stage keys,
ordering, and UI progress are unchanged; only the internal call count differs;
to be restated in the implementation PR description.

### D7 — `product_reference_model_conflict` had no data channel (HIGH)

**Found (completeness pass 2):** section 03's Phase A instructs the skill to
"report it (feeds the section-04 blocker)" and section 04's preflight fires
"when skill Phase A output reports…", but section 03's `output.schema.json`
defined **no field carrying the signal**. `conflicts[]` is documented as soft
image-vs-text ATTRIBUTE disagreements (excluded, non-blocking, §5.3/§10.3) —
semantically the wrong channel. The blocker could therefore never fire, making
spec §23.1 item 12 and acceptance criterion 15 unimplementable.

**Fix:** section 03 §8 defines
`evidenceProfile.product_reference_model_conflict` as a REQUIRED-nullable
object (`{detected, conflicting_reference_indexes[], detail}`), explicitly
distinguished from `conflicts[]`, with the rule that Phase A must emit `null`
when clean — an absent key is a schema violation, so silence can never be
mistaken for "checked and clean". Section 04's blocker row now reads the field
by name and treats an absent key as `sequential_prompt_set_incomplete`. The
marker table in section 03 §10 gained the row.

### D8 — `assembly_documented` had no producer for the 3x3 path (MEDIUM)

**Found:** section 07's guard context requires `assemblyDocumented` for BOTH
modes and attributes the 3x3 value to "section 05's deterministic ProductTruth
derivation", but section 05's `SequentialEvidencePreview` type carried no such
field and no such function. With the guard flag on, a 3x3 run's demonstration
directive would key off `undefined` — either always firing or never, depending
on the implementer's coin flip.

**Fix:** section 05 §5.5 exports
`deriveAssemblyDocumentationFromProductTruth(...)` returning
`{documented, evidence[], source}` and adds `assemblyDocumentation` to the
preview type. Text-only by design (the plan query must stay cheap), with a
`partsDiagramAttached` input for the image-derived case and an explicit
conservative rule: unknown ⇒ `false` ⇒ the guard forbids assembly content —
the safe direction, since a false positive ships invented parts (the exact
production failure this feature exists to stop). Section 07's context comment
now names the function and forbids defaulting to `true`.

### D9 — spec §24 untrusted-content rule was asserted but not taught (MEDIUM)

**Found:** the untrusted-product-text rule appeared only as an input-table
annotation in section 03 and as prose in spec §24. Since the skill body IS the
system prompt, a rule that never reaches the body is not enforced at runtime —
the "taught-not-wired" failure class this repo has been bitten by before.

**Fix:** section 03 §6.1 gains an explicit governing principle (product text is
DATA, embedded instructions must never override the contract, alter reference
bindings, relax a safety lock, or change the output schema), plus a marker-table
row so the real-file test greps for it.

### D10 — partial-failure credit semantics unstated (LOW)

**Found:** no section said what happens to already-charged image jobs when the
stage hard-blocks mid-way. Inherited behavior is correct, but an implementer
could plausibly "improve" it with a batch reservation for all 9 units.

**Fix:** section 06 §5.8 states the inheritance explicitly, forbids
sequential-specific refund logic and up-front batch reservation (per-unit
reservation is what keeps a partial failure cheap), and adds a test.

---

## 3. Checks that passed (no action needed)

- **Coverage:** every claude-plan.md workstream WS-1..WS-12 maps 1:1 to a
  section; every spec §7–§26 requirement in scope (Phases 1–5) is claimed by
  exactly one section. Phase 6 (Tier-2 `agents_python`) is out of scope in
  the plan and correctly absent from all 12.
- **Dependency order:** no section imports from a later section. Section 08's
  addition to section 04's module and section 12's `emitAudit` implementation
  for section 04's seam are both *additions to an earlier module by a later
  section*, which is the correct direction.
- **File-conflict awareness:** sections 10 and 11 both edit
  `AutoStoryboardReviewPlanSummary.tsx` + `hyperframesUiCopy.ts`; both
  already carry the "land 10 first, 11 reuses `copy.imageJobsEstimated`" note.
  Sections 06/07/08/09 all edit SVC but at disjoint functions, each with an
  explicit additive-only instruction.
- **Blocker-id vocabulary:** `assembly_demo_unverified` and
  `guardian_directive_missing` intentionally appear in two validators (04's
  pack preflight, 07's shared provider-prompt preflight) with the same id
  strings — deliberate, and section 08's Thai copy module has one entry per
  id.
- **Snapshot tripwire:** all 8 SVC-touching sections reference the same
  `server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` and
  forbid `-u` regeneration.
- **Metrics seam:** section 06 §5.10 produces exactly the ingredients section
  12 §5.6 consumes (`frameStrategy` tag + `unitOutcomes[]`).
- **Skill-first boundary:** no section places creative wording in TypeScript;
  the guardian/assembly *lock text* in section 07 is explicitly classified as
  a machine-checkable safety lock (clothing-lock precedent) with the pivot
  wording left in the skill references.
- **No DB migration** claimed anywhere; all state is additive JSONB.

---

## 4. Verification item for the implementer (not a defect)

Section 09's reference resolver indexes `metadata.storyboardFrameUrls[unit.shotOrder - 1]`.
`DirectVideoUnit` is built by `buildInitialVideoUnits` (SVC:8518) — confirm it
carries `shotOrder` (the image-unit type does); if it only carries `shotId`,
derive the order from `plan.shots` rather than adding a field. Flagged because
section 09 was written against symbol names, not a type dump.

---

## 5. Scorecard

| Category | Verdict |
|---|---|
| Interface consistency | PASS after D1–D4 |
| Coverage vs claude-plan.md | PASS after D5 — every WS claimed; the runtime seam between WS-4 and WS-6 is now owned by WS-5 |
| Overlap / duplicate ownership | PASS after D1, D2 |
| Dependency order | PASS — 04 (module) → 05 (call site + persist) → 06 (consume) |
| Executability end-to-end | PASS after D5 — a run can now progress product_preflight → … → prompt_plan (pack produced + persisted) → image_generation → storyboard_review |
| Spec fidelity | PASS after D6 — the one intentional divergence (single A–K call vs the §6.1 two-stage diagram) is recorded, not silent |
| Data channels for every declared blocker | PASS after D7 — each of the 13 blocker ids now has a named producer field or a deterministic detector; verified by walking the id list against section 03's output schema and section 04 §5.7 |
| Security rules reach the runtime | PASS after D9 — §24's untrusted-content rule is in the skill body (the system prompt) and grep-guarded, not only in prose |
| Self-containment | PASS — each file carries its own background, anchors, tests, and done criteria |
| Skill-first + safety invariants | PASS |

## 6. Residual risk accepted (not defects)

- **No dedicated end-to-end integration section.** Coverage is per-section
  tests + section 12's real-LLM gate (child chair + undocumented-assembly
  furniture) + the manual traces in each section's verification checklist.
  Judged sufficient because the run engine itself is unchanged shipped code;
  a full-stack harness would mostly re-test Feature 118.
- **Merge ordering across 8 SVC-touching sections** is governed by the index's
  execution order plus each section's additive-only instruction and the
  standing snapshot tripwire; no lockfile-style coordination is specified.
  Re-verify line anchors immediately before each edit (the file has
  concurrent editors).
