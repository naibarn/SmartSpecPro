# Section 07 — Shared Evidence-Guard Package (`marketplaceReviewEvidenceGuard`)

Section id: `section-07-evidence-guard-shared`
Source: `claude-plan.md` WS-7 + `claude-plan-tdd.md` WS-7. Spec (authoritative, v1.3.0): §3.4, §5.3, §10.4, §11.5, §17, §23.1 items 7/15. Phase 3 / Milestone M3.
Runtime: TypeScript. Test command (repo root): `npm --prefix apps/web run test -- <files>`.

Dependencies (reference only — do not re-implement):
- **section-01-flags-and-schemas** — defines the `marketplaceReviewEvidenceGuard` tenant flag (default `false`) in `apps/web/shared/featureFlags.ts`, admin group entry, and the WS-1 byte-identical snapshot baselines this section must not break.
- **section-05-evidence-plan-surface** — owns the `childSubjectPolicy` computation, the deterministic text-only evidence derivation from `ProductTruth` (including `assembly_documented`), persistence at `metadataJson.sequentialStoryboard.*`, and the `confirmedAttributes`/`forbiddenClaims` overrides.
- **section-06-sequential-pipeline** — owns the sequential per-frame QA invocation path and the publish-block-aware stage gate that this section's predicates feed.
- **section-04-skill-runner-loop** — owns the sequential runner and its runtime contract assembly; this section appends guard directives into that contract.

This section blocks: **section-09-full-video**, **section-11-ui** (guardian notice consumes `childSubjectPolicy` + guard state), **section-12-observability-gate** (guardian/assembly audit events + diff-shape gate).

---

## 1. Objective

Ship the shared evidence-guard package behind the `marketplaceReviewEvidenceGuard` tenant flag so that BOTH frame strategies (`storyboard_3x3_split` and `sequential_shot_storyboard`) gain, with identical injected text:

1. **Guardian presence enforcement** (spec §17): a depicted minor using a child-related product must be accompanied by a supervising adult guardian — directive → skill rule → vision-QA fail-closed check → targeted repair → publish block.
2. **Demonstration-evidence / assembly guard** (spec §11.5): assembly/disassembly/parts content may only be depicted when `assembly_documented` is true — directive → QA field → repair → unit failure.
3. **Claim whitelist + image-over-text conflict exclusions for the 3x3 contract** (spec §3.4, §10.4, §5.3): blocked/conflicting claims appended as exclusion lines to the 3x3 skill `runtime_contract`.

Hard invariant (spec §3.4 + plan decision 6): the guard is a set of **enumerated directive/QA additions ONLY**. With the flag off, every byte of existing behavior is preserved (WS-1 snapshots stay green). With the flag on, the 3x3 prompt output may differ from baseline ONLY by the enumerated lines — proven by a diff-shape snapshot test. The 3x3 tenant flag may be enabled in production as soon as this section's tests pass, independent of sequential GA (Milestone M3).

## 2. Background — verified code anchors (all in `apps/web/server/services/marketplaceAutoReviewService.ts` = SVC unless noted; line numbers verified 2026-07-21, re-verify before editing)

- `buildMinorSafetyClothingLock(plan)` SVC:1395-1403 — the precedent shared safety lock: pure sync function of `AutoReviewPlan`, returns `""` when inactive, marker prefix `MINOR SAFETY CLOTHING LOCK:`. New builders sit beside it and copy its shape.
- Minor-safety trigger family: `MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE` :1306, `textHasMinorSafetySignal` :1351, `marketplaceAutoReviewPlanNeedsMinorSafetyLock` :1357 (category `mother_baby` OR plan-text signals).
- Existing lock injection sites (spec §17.3 layer 1): :9211 (variable feeding the 3x3 skill `runtime_contract` at :9352 inside `buildProductReferenceStoryboardSkillInputs`), :15145 (`promptReferenceSection`), :15176 (`imagePromptReferenceSection`), :15333 (`build3x3StoryboardPrompt`), :15400 (`buildShotFramePrompt`). Note `buildShotFramePrompt` embeds `imagePromptReferenceSection` (:15390) and `buildStoryboardFramePrompt` (dispatcher :8602-8608) embeds `promptReferenceSection` (:8577).
- Repair machinery: `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` :1443 (array of `{pattern: RegExp, sentence: string}`), `buildTargetedRepairDirective` :1479, idempotent appender `ensureTargetedRepairDirectiveInImagePrompt` :1508.
- Reason-code predicates: `imageReasonCodeMentionsMinorSafety` :1633 (regex), `imageReasonCodeBlocksPublishSafety` :1640-1645 (regex — this IS the "publish-block set"), `imageReasonCodesContainPublishSafetyBlocker` :1647-1651; consumers at :7019 (best-select), :7296 (review summary), :20175-20176 (accept-with-warnings gate; sibling gate classes `storyboardGridLayoutBlocked` :20177-20178 show the extension pattern).
- Vision QA: shared verdict normalizer `normalizeShotFrameVisionQaDecision` :1738-1801 serves BOTH the grid path (parse at :19153 inside `runStoryboardGridLayoutVisionQa` :18937) and the per-frame path (parse at :19482 inside `runShotFrameVisionQa` :19287). Fail-open idiom documented at :1765-1771 (`!== false` ⇒ safe). Minor-safety folding `normalizeVisionQaMinorSafetyResult` :1690-1736 filters codes through `imageReasonCodeMentionsMinorSafety` — new guard codes must NOT match that regex or they will be re-classified.
- QA JSON schema strings: grid :19043 (conditional interpolation precedent: `characterPresenceExpected ? '"characterPresenceSatisfied":boolean,"framesMissingPresenter":[number],' : ""`), per-frame :19380. Prose criteria lines: grid minor-safety line :19039-19040, per-frame :19372-19373.
- Test-export precedent: `normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest` :10685-10692, `normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest` :10677, `buildMarketplaceAutoReview3x3StoryboardPromptForTest` :15404.
- Flag read: `getTenantFeatureFlags(tenantId)` — `apps/web/server/services/tenantFeatureFlagService.ts:183`. Start entry points already touched by section-01 gating: `startMarketplaceAutoReviewRun` SVC:17549 and `startAutoStoryboardReviewForApi` `apps/web/server/services/hyperframesRuntimeApiService.ts:1309`.
- `AutoReviewPlan` :795-803 is a small type (`conceptId,title,productTruth,storyboardGuide,voiceoverScript,productDetail,shots`) — it carries NO flag state; `RunMetadata` :817-914 is the extensible bag (`concept?: AutoReviewPlan`, `characterPresenceMode`, …).
- Blocked-claims hook: `claimEvidenceMapping.blockedClaims` :5794 with the shipped fail-closed paid-media gate :5947.
- Preflight validator (blocker-id conventions): `validateMarketplaceAutoReviewImagePromptPreflight` :8633.

## 3. Design (binding for this section)

### 3.1 Flag snapshot — deterministic mid-run behavior

`marketplaceReviewEvidenceGuard` is resolved ONCE per run at the two start entry points (the same call sites where section-01 already awaits `getTenantFeatureFlags`) and snapshotted into run metadata:

```ts
// RunMetadata addition (SVC:817-914)
evidenceGuard?: { enabled: boolean };
```

Every downstream consumer (prompt builders, QA, acceptance gate, preflight) reads the snapshot, never the live flag. Rationale: background stage advancement must stay deterministic for already-started runs (same principle as WS-1's pure `resolveFrameStrategy`); legacy/in-flight runs have `evidenceGuard === undefined` ⇒ guard disabled ⇒ behavior unchanged.

### 3.2 Guard context — one resolver, pure builders

The directive builders must stay pure/sync like `buildMinorSafetyClothingLock`, but need facts that live outside `AutoReviewPlan`. Add one resolver plus a context type in SVC (beside :1395):

```ts
type MarketplaceReviewEvidenceGuardContext = {
  enabled: boolean;                      // metadata.evidenceGuard?.enabled ?? false
  productChildRelated: boolean;          // same trigger family as marketplaceAutoReviewPlanNeedsMinorSafetyLock (:1357/:1306)
  childDepictionPlanned: boolean | null; // sequential: any sequentialStoryboard.shots[].depicts_minor; 3x3: null (unknown at plan time)
  assemblyDocumented: boolean;           // sequential: evidenceProfile.assembly_documented when present;
                                         // 3x3 / pre-pack: section 05's exported
                                         // deriveAssemblyDocumentationFromProductTruth(...).documented
                                         // (text-only, conservative: unknown ⇒ false ⇒ guard forbids
                                         // assembly content). NEVER default to true.
                                         // else section-05's deterministic ProductTruth derivation (3x3 path)
  blockedClaims: string[];               // claimEvidenceMapping.blockedClaims (+ user forbiddenClaims override)
  conflictExclusions: string[];          // §5.3 image-over-text conflict exclusions from section-05's deterministic derivation
  guardianReferenceIndex: number | null; // @ImageN of the adult character reference when attached, else null
};

/** Pure. Never throws. All-off defaults when metadata absent (flags-off snapshot safety). */
function resolveMarketplaceReviewEvidenceGuardContext(
  metadata: RunMetadata | undefined,
  plan: AutoReviewPlan
): MarketplaceReviewEvidenceGuardContext
```

Export a `...ForTest` wrapper (repo pattern, e.g. beside :10677).

Guardian policy activation semantics (spec §17.2 + §17.7):
- Sequential: policy ACTIVE ⇔ `productChildRelated && childDepictionPlanned === true`.
- 3x3: depiction is unknown at prompt time, so the (conditional-wording) directive is injected whenever `enabled && productChildRelated` — mirroring the clothing lock's own trigger; QA enforcement keys off OBSERVED `minorPresent`, so no planned-depiction marker is needed.
- The policy has NO user opt-out (UI notice is section-11).

### 3.3 Directive builders (stubs — full text authored during implementation from spec wording)

```ts
/**
 * GUARDIAN PRESENCE LOCK. Returns "" unless guard.enabled && guard.productChildRelated
 * (sequential additionally requires childDepictionPlanned !== false for the
 * policy-active preflight; the injected text itself is conditional wording).
 * Core sentence (spec §17.3 layer 1): "Any frame that shows the child using the
 * product MUST also show a supervising adult guardian in the same frame ...
 * never show an unaccompanied minor using the product." When
 * guard.guardianReferenceIndex is set, name @Image<N> as the guardian identity anchor.
 * Stable marker prefix: "GUARDIAN PRESENCE LOCK:".
 */
function buildGuardianPresenceDirective(
  plan: AutoReviewPlan,
  guard: MarketplaceReviewEvidenceGuardContext | undefined
): string

/**
 * DEMONSTRATION EVIDENCE LOCK. Returns "" unless guard.enabled. When
 * assemblyDocumented === false: forbid assembly/disassembly/exploded-parts/
 * internal-mechanism/"what's in the box" content; require the finished, fully
 * assembled product as shown in the references (spec §11.5 items 2-4; visible-
 * operation demos remain allowed). When documented: restrict depiction to the
 * documented evidence only. Stable marker prefix: "DEMONSTRATION EVIDENCE LOCK:".
 */
function buildDemonstrationEvidenceDirective(
  plan: AutoReviewPlan,
  guard: MarketplaceReviewEvidenceGuardContext | undefined
): string

/**
 * Dynamic repair instruction (spec §17.3 layer 4): "add the supervising adult
 * guardian [matching @Image(K+1)] into the frame OR reframe without the minor";
 * uses guard.guardianReferenceIndex when available. "" when policy inactive.
 */
function buildGuardianPresenceRepairInstruction(
  plan: AutoReviewPlan,
  guard: MarketplaceReviewEvidenceGuardContext | undefined
): string
```

Notes: these are TS-authored safety locks (precedent: the clothing lock text at :1397-1402) — this does NOT violate the skill-first rule because the creative pivot wording (what replaces an assembly beat, allowed framings) stays in the skill references (`guardian-presence.md`, `demonstration-evidence.md`, section-03). The directives are enumerated machine-checkable locks.

### 3.4 Injection sites (guard on ⇒ inject exactly once per final prompt)

| Site | Mechanism |
|---|---|
| `build3x3StoryboardPrompt` (SVC:15239, lock at :15333) | new array elements immediately beside :15333 |
| `buildShotFramePrompt` (SVC:15353, lock at :15400) | new array elements beside :15400 (do NOT also inject inside `imagePromptReferenceSection` :15176 — that would double-inject) |
| 3x3 skill `runtime_contract` (SVC:9352, via a directive variable beside :9211) | append both directive strings + claim-exclusion lines (§3.6) |
| Sequential runner contract (section-04's SVC-side input assembly for `productReviewSequentialStoryboardSkillRunner.ts`) | append both directive strings; sequential also receives `childSubjectPolicy` + evidence facts as structured input (already in the section-04 contract) — the directives here are the enforcement text |

Threading: builders are called with `(plan, guardContext)`. The prompt dispatcher `buildImagePromptForUnit` (SVC:8588) and `build3x3StoryboardPrompt` gain an OPTIONAL trailing `guard?: MarketplaceReviewEvidenceGuardContext` parameter threaded from metadata-holding callers (:9131, :9456, :9556); `undefined` ⇒ builders return `""` ⇒ byte-identical output (snapshot safety). Extend the test export input object at :15404 with the optional guard.

Coverage checkpoint (implementation-time audit): `buildStoryboardFramePrompt` (dispatcher :8602-8608) submits provider prompts for single-frame 3x3 regeneration and embeds `promptReferenceSection` (:15145). If that path is provider-submitting in the current code, inject the same two directives there once as well (and add its lines to the diff-shape enumeration). Idempotency rule: a directive marker may appear AT MOST ONCE per final prompt — assert in tests.

### 3.5 QA extension — schema strings, prose criteria, normalizer

Fields (plan WS-7): `adultGuardianPresent: boolean`, `framesMissingGuardian: number[]`, `assemblyContentDetected: boolean`, added to BOTH schema strings when guard on, using the existing conditional-interpolation precedent:

- Grid schema string :19043 and grid prose criteria beside :19039-19040 (guardian criteria gated on `guard.enabled && productChildRelated`; assembly criteria gated on `guard.enabled`).
- Per-frame schema string :19380 and prose criteria beside :19368-19379.

Normalizer `normalizeShotFrameVisionQaDecision` (:1738-1801) — extend input with:

```ts
evidenceGuard?: { enabled: boolean; assemblyDocumented: boolean }; // optional — absent ⇒ today's behavior exactly
```

and extend the return type with `adultGuardianPresent: boolean | null` and `assemblyContentDetected: boolean | null`. New verdict rules (folded beside :1772-1789):

1. **Guardian — FAIL-CLOSED (deliberate exception to the `!== false` fail-open idiom :1765-1771; keep an explaining comment in code):** when `evidenceGuard?.enabled === true` AND resolved `minorPresent === true` AND `parsed.adultGuardianPresent !== true` (missing, non-boolean, or false) ⇒ verdict `repair` + reason code `guardian_presence_missing`.
2. **Assembly:** when `evidenceGuard?.enabled === true` AND `parsed.assemblyContentDetected === true` AND `evidenceGuard.assemblyDocumented === false` ⇒ verdict `repair` + reason code `assembly_content_unverified`. Documented ⇒ pass-through.

Because the grid path reuses the SAME normalizer (:19153), one extension covers both modes; only the two schema/prose strings differ per path. Update the ForTest wrapper input at :10685.

Swallow-proofing (regression requirement): `guardian_presence_missing` and `assembly_content_unverified` must NOT match `imageReasonCodeMentionsMinorSafety` (:1633-1638) — currently they do not; add an explicit test so a future regex edit cannot silently re-classify them into the minor-safety folding of `normalizeVisionQaMinorSafetyResult`.

### 3.6 Claim whitelist + conflict exclusions for the 3x3 contract

When guard on, append to the 3x3 skill `runtime_contract` (:9352 assembly site) exclusion lines with a stable marker (e.g. `CLAIM SAFETY EXCLUSIONS:`) listing: `claimEvidenceMapping.blockedClaims` (:5794), section-05's deterministic conflict exclusions (§5.3 — image-over-text), and the user `forbiddenClaims` override. Facts only — the list is data; prohibited-class prose stays in the skill's `references/claim-safety.md`. The shipped blocked-claims paid-media gate (:5947) is already fail-closed and needs no change.

### 3.7 Publish-block + acceptance semantics

- Extend `imageReasonCodeBlocksPublishSafety` (:1640-1645) so `guardian_presence_missing` matches (add a `guardian.*presence.*missing` alternation or an explicit code-equality check ahead of the regex; keep every existing match). Minor-safety codes remain matched. This automatically propagates to :7019, :7296, and the accept-with-warnings gate :20175-20176 — repair-budget exhaustion can never accept a frame past `guardian_presence_missing` (spec §17.3 layer 3).
- `assembly_content_unverified` is NOT publish-safety class. Instead, add a sibling gate beside `publishSafetyBlocked` (:20175-20179 pattern, cf. `storyboardGridLayoutBlocked`): when guard enabled and the unit's final reason codes contain `assembly_content_unverified` after the per-unit repair budget, the unit FAILS (repair_required/terminal per existing stage semantics) rather than being accepted-with-warnings (plan binding decision 7).
- Section-06's sequential stage gate consumes these same predicates unchanged.

### 3.8 Targeted repair directives

Add two entries to `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` (:1443), shaped `{pattern, sentence}`:

- `pattern: /guardian.*presence/i` — static sentence: add the supervising adult guardian into the frame (matching the guardian reference image when provided) OR reframe the shot without the minor; never show an unaccompanied minor using the product.
- `pattern: /assembly.*(?:content|demo).*unverified|assembly_unverified/i` — static sentence: reframe on the fully assembled product exactly as shown in the reference images; remove parts, fasteners, exploded views, and disassembly imagery.

The dynamic per-run variant (`buildGuardianPresenceRepairInstruction`, §3.3) is used where the repair path composes instructions with manifest context (presence-repair shape :4795-4806); the registry entries are the reason-code-matched fallback picked up by `buildTargetedRepairDirective` (:1479).

### 3.9 Preflight blockers (both modes when guard on)

Extend `validateMarketplaceAutoReviewImagePromptPreflight` (:8633) with two blocker ids (existing id conventions):

- `guardian_directive_missing` — guardian policy active for the mode (§3.2 semantics) but the `GUARDIAN PRESENCE LOCK:` marker is absent from the final prompt (spec §23.1 item 7). Prompt-side fail-closed.
- `assembly_demo_unverified` — the prompt stages assembly content while `assemblyDocumented === false` (spec §23.1 item 15). Detection is a conservative deterministic regex backstop (e.g. assembly/disassemble/exploded/parts spread/fasteners/"what's in the box"/ประกอบ/แกะกล่อง tokens); the skill rule and vision QA remain the primary layers — keep the pattern list narrow to avoid false positives.

The sequential runner's post-loop preflight (section-04) already carries these ids for the skill pack; this step adds them at the shared provider-prompt preflight so 3x3 gets the same protection.

### 3.10 Preserved-verbatim invariants

- Presenter-never-child binding (:4781/:4720) and the no-age-transform rule (`productReferenceStoryboardSkillRunner.ts:1028,1166`) unchanged.
- Minor-safety clothing lock + QA codes (:1725, :1728) unchanged.
- `characterPresenceMode` thresholds (9/9, ≥7/9 — :4766-4783) unchanged; for sequential they are counted across 9 separate frames (counting itself is section-06 QA wiring). Guardian presence is evaluated independently of, and in addition to, presence mode (spec §17.4).

## 4. TDD — write these tests FIRST

New file: `apps/web/server/services/__tests__/marketplaceAutoReview.evidenceGuard.test.ts` (service-level, uses `...ForTest` exports; no LLM/provider mocks needed — everything under test is deterministic). Diff-shape + byte-identity tests extend the WS-1 suite `apps/web/server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` and reuse its committed fixtures. Run: `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.evidenceGuard.test.ts server/services/__tests__/marketplaceAutoReview.snapshots.test.ts`.

Write test stubs (describe/it with assertions) for all of the following, watch them fail, then implement §3 until green:

1. **Directive builders — off/inactive cases**: `buildGuardianPresenceDirective` and `buildDemonstrationEvidenceDirective` return `""` when (a) guard context undefined, (b) `enabled: false`, (c) guardian builder with `productChildRelated: false`. Active cases return non-empty text containing the stable markers `GUARDIAN PRESENCE LOCK:` / `DEMONSTRATION EVIDENCE LOCK:` and the spec core sentences; guardian text names `@Image<N>` when `guardianReferenceIndex` is set.
2. **childSubjectPolicy activation** (computation owned by section-05; re-asserted here because directives gate on it): `mother_baby` category + a `depicts_minor` shot ⇒ active; adult-only plan ⇒ inactive; plan-text minor-safety signal (e.g. "เก้าอี้เด็ก") triggers `productChildRelated` without the category. Use section-05's exported helper (add a `...ForTest` export there if missing).
3. **Injection presence**: with guard context enabled, the four §3.4 outputs contain each directive exactly ONCE (idempotency: count marker occurrences === 1): `buildMarketplaceAutoReview3x3StoryboardPromptForTest`, `buildShotFramePrompt` path via the dispatcher/test export, the 3x3 `runtime_contract` string (via `buildProductReferenceStoryboardSkillInputs` test surface), and the sequential runner contract assembly. With guard off/undefined: markers absent from ALL four.
4. **DIFF-SHAPE SNAPSHOT (the section's tripwire)**: guard flag alone (sequential flag off), fixed WS-1 fixture ⇒ split baseline and guarded 3x3 prompt into lines; assert (a) zero removed lines, (b) zero reordered lines, (c) every added line matches the enumerated allowed set: `GUARDIAN PRESENCE LOCK:`-prefixed, `DEMONSTRATION EVIDENCE LOCK:`-prefixed, and `CLAIM SAFETY EXCLUSIONS:`-prefixed (runtime_contract). Second assertion: guard off ⇒ byte-identical to the WS-1 committed baseline.
5. **QA normalizer — guardian FAIL-CLOSED** (via `normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest` with the new optional `evidenceGuard` input): `minorPresent: true` + `adultGuardianPresent` missing ⇒ `repair` + `guardian_presence_missing`; `adultGuardianPresent: false` ⇒ same; `adultGuardianPresent: true` ⇒ no guardian code; `minorPresent: false` ⇒ no guardian code regardless; `evidenceGuard` absent ⇒ output deep-equals today's behavior for the same parsed fixture (regression pin).
6. **QA normalizer — assembly**: `assemblyContentDetected: true` + `assemblyDocumented: false` ⇒ `repair` + `assembly_content_unverified`; `assemblyDocumented: true` ⇒ pass; guard absent ⇒ field ignored.
7. **Publish-block semantics**: `guardian_presence_missing` satisfies the publish-safety predicate; `assembly_content_unverified` does NOT; accept-with-warnings gate refuses a unit whose final codes include `guardian_presence_missing` (exercise the :20174-20179 gate through the narrowest available ForTest export — add one if needed); assembly code after exhausted repair budget fails the unit instead of accepting it.
8. **Swallow-proofing regression**: `imageReasonCodeMentionsMinorSafety` matches neither new code; a parsed QA result carrying `guardian_presence_missing` survives `normalizeVisionQaMinorSafetyResult` folding unchanged.
9. **Repair registry**: both new `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` entries exist; `buildTargetedRepairDirective` on a unit with `repairReasonCodes: ["guardian_presence_missing"]` includes the guardian sentence; same for the assembly code; `buildGuardianPresenceRepairInstruction` emits the `@Image(K+1)` variant when the index is known.
10. **QA schema strings**: grid (:19043) and per-frame (:19380) instruction strings contain `"adultGuardianPresent"`, `"framesMissingGuardian"`, `"assemblyContentDetected"` when guard on; NOT present when guard off (byte-identical strings — reuse the snapshot fixture assertion).
11. **Preflight blockers**: `guardian_directive_missing` fires for a policy-active plan whose prompt lacks the marker and does not fire when present or when guard off; `assembly_demo_unverified` fires on a crafted assembly-staging prompt with `assemblyDocumented: false`, not when documented, not on a finished-product prompt (false-positive guard: a "fully assembled product" phrase must NOT trigger).
12. **Flag snapshot**: run started with tenant flag on ⇒ `metadataJson.evidenceGuard.enabled === true`; flag off ⇒ `false`/absent; `resolveMarketplaceReviewEvidenceGuardContext(undefined, plan)` ⇒ all-off context, never throws.

Cross-cutting gates (must stay green): the entire WS-1 snapshot suite (both flags off ⇒ byte-identical), and `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` with no NEW errors vs the ~987-error baseline.

## 5. Implementation order

1. Tests from §4 (red).
2. `RunMetadata.evidenceGuard` + start-entry-point snapshot writes (SVC:17549, `hyperframesRuntimeApiService.ts:1309`) + `resolveMarketplaceReviewEvidenceGuardContext` (+ ForTest export).
3. Directive builders + repair-instruction builder beside SVC:1395 (+ ForTest exports).
4. Prompt injections (§3.4) with optional-parameter threading; extend the :15404 test export input.
5. Claim-exclusion lines into the 3x3 runtime_contract assembly (§3.6).
6. QA schema strings + prose criteria (§3.5), normalizer extension + return fields, ForTest wrapper input update.
7. Predicates: publish-safety extension, acceptance sibling gate, repair-directive registry entries (§3.7-§3.8).
8. Shared preflight blockers (§3.9).
9. Diff-shape snapshot green; full WS-1 snapshot suite green; tsc baseline check.

## 6. Acceptance criteria

- Both flags off: WS-1 snapshots byte-identical (zero diff anywhere in this section's touched paths).
- Guard flag on, 3x3: prompt/contract output differs from baseline ONLY by enumerated lines; guardian QA is fail-closed for observed minors; `guardian_presence_missing` can never be accepted-with-warnings; assembly content is repaired then fails the unit when undocumented; claim exclusions present in the contract.
- Guard flag on, sequential: identical directive text reaches the runner contract; section-06's per-frame QA path parses and enforces the new fields through the shared normalizer.
- No LLM calls added to any plan-time or preflight path (everything in this section is deterministic).
- New reason codes are additive: no existing reason-code, folding, or acceptance behavior changes for runs without the guard snapshot.

## 7. Out of scope (owned elsewhere)

- Guardian UI notice, presence-label generalization, evidence review panel — section-11.
- Audit events for guardian/assembly occurrences, angle trims, metrics recorder, real-LLM gate fixtures — section-12.
- Full-video reference budgeting with guardian portrait — section-09.
- `childSubjectPolicy` computation + evidence derivation/persistence — section-05 (this section only consumes and enforces).
- Multi-angle product lock for 3x3 — explicitly deferred (spec §3.4 table); the single-anchor rule (`approvedProductReferenceUrls` :5185-5200) stays untouched.
