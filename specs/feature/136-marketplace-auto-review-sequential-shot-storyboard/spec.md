# Feature 136: Marketplace Auto Review — Sequential Shot Storyboard With Multi-Angle Product Lock And Guardian Presence

Version: 1.3.0
Date: 2026-07-21
Status: Proposed
Depends-on:
- Feature 113 Marketplace Capture Extension (product records, images, evidence capture)
- Feature 118 Marketplace Auto Review Create Storyboard And Video Review Auto (implemented snapshot — the flow this feature extends)
- Feature 122 Video Segment Planner Multi Shot Storyboard Review (segment planning surface)
Related:
- Feature 117 Production Director Agents SDK Auto Storyboard And Video (QA/repair loop and product-truth QA prior art)
- Feature 119 HyperFrames Marketplace Auto Review Render Adapter (auto plan / estimate surface)
- Feature 128 Age-Aware Safety Policy (USER age policy — distinct from this feature's DEPICTED-minor policy; see §17.6)
- Feature 131 Vertical Drama Series Storyboard Video Flow / Feature 132 Story Character Quality Engine (per-shot start-frame + video prompt pipeline prior art)
- Feature 134 Character Portrait Candidate Batch (no-migration JSONB persistence precedent)
- Feature 101 OpenAI Agents SDK Chat Team Orchestration / Feature 106 OpenAI Agents Python Native Skill System / Feature 107 OpenAI Agents Python Subagent Skill Runtime / Feature 130 Hybrid Flow Agents SDK Runtime (executable-skill runtime contract for §9.8)
Audience: Frontend (CMD-1), Backend (CMD-2), Database (CMD-4), Security (CMD-6), QA (CMD-8)
Source reference: user-provided "SmartSpecPro Skill-First Product Review Storyboard & Video Prompt Generator — Development Specification v1.0" (2026-07-21), adapted to the current codebase; see `request.md` in this folder.

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-21 | Initial proposed spec. |
| 1.1.0 | 2026-07-21 | Completeness revision after re-review: skill input contract (§9.6); reuse of shipped creative-preset/tone/structure/motion overrides (§12.6, §14.6); provider prompt compilation rule (§15 item 6); loop orchestration clarified as TS-orchestrated rounds (§16.4); per-unit resume + edited-prompt revalidation (§18); worked example (§11.4); reservation-vs-attachment-order note (§8.3); new hard failures 12-14 and warnings (§23); untrusted-content rule (§24); wardrobe + shotOverrides in output schema (§19.2); expanded acceptance criteria (§27). |
| 1.2.0 | 2026-07-21 | Quality-uplift revision per product review: demonstration evidence rule / assembly guard (§5.6, §11.5) targeting observed 3x3 failures (invented furniture-assembly reviews, product drift); shared-improvement policy + `marketplaceReviewEvidenceGuard` flag so evidence guards ship to BOTH modes without waiting for sequential GA (§3.4, §17.7, §26); measurable GA quality gate + mode-comparison metrics (§25, §26); assembly-evidence fields in profile/output schema (§10.1, §19.2); `parts_diagram` evidence-only references (§8); expanded validation, tests, and acceptance criteria. |
| 1.3.0 | 2026-07-21 | Skill-capability revision per product direction: in-skill prompt-quality assurance mandatory before return (§9.7 — review/repair loops and/or best-of-N candidate comparison, always auditable); two-tier skill execution model (§9.8) — markdown baseline vs executable OpenAI Agents SDK (openai-agents-python, already installed `openai-agents==0.17.4`) runtime per the Feature 106/107 native bundle contract, adopted only on measured eval uplift; tier-aware loop mechanics (§16.4); gateway-routed credits + sandbox rules for executable skills (§22, §24); Phase 6 rollout + tier-parity eval tests (§26, §27). |

---

## 1. Executive summary

Marketplace Auto Review today generates its storyboard as **one image containing a
3x3 grid of 9 frames**, retries until at least 3 completed candidates exist, picks
the best candidate by vision-QA score, splits the winning grid into 9 frames, and
builds the Storyboard Review from those frames (Feature 118).

This feature adds a **new, additive frame strategy** — `sequential_shot_storyboard` —
that instead generates **9 separate images, one prompt per image**, forming one
continuous product-review story. The strategy itself does not modify or replace
the existing `storyboard_3x3_split` or `video_shot_start_stop` strategies, and it
is dark behind a tenant feature flag until rollout completes. Alongside it, the
feature defines a SHARED evidence-guard package (§3.4) — assembly/demonstration
guard, guardian presence, claim whitelist — that the existing 3x3 mode can adopt
immediately under its own flag, per explicit product direction that improvements
benefiting both systems must not be kept separate.

The new mode ships five pillars:

1. **Skill-first planning.** A new app-scoped skill,
   `product-review-sequential-storyboard`, owns all creative judgment: product
   evidence profiling, category classification, claim whitelisting, nine-shot
   narrative planning, continuous Thai dialogue, per-shot start-frame image
   prompts, per-shot self-contained video prompts, and a three-round
   self-review loop. TypeScript computes facts and enforces machine-checkable
   contracts only; it never hardcodes creative thresholds that replace LLM
   judgment. The skill is responsible for verifying its own prompt quality
   BEFORE returning (§9.7) — via review/repair loops, best-of-N candidate
   comparison, or both — and may be upgraded from a markdown skill to an
   executable OpenAI Agents SDK runtime when assessed better (§9.8).

2. **Multi-angle product identity lock.** The user attaches multiple product
   reference images (front/back/side/detail/package…). Every per-shot image job
   carries the full angle set (within the model's reference cap) so the product
   stays visually exact from any camera direction. This deliberately relaxes —
   for this mode only — the current hard rule that marketplace image generation
   accepts exactly ONE product anchor reference.

3. **Guardian presence policy.** When the product is child-related and a child
   is depicted in a frame, an adult guardian must also be present in that frame
   (or the frame must not depict the child). The user may upload an adult
   character reference to be that guardian. Enforcement uses the proven
   four-layer pattern already shipped for `characterPresenceMode`: planner
   directive → skill rule → vision-QA check → targeted repair, with a
   publish-blocking reason code.

4. **Evidence-grounded, compliant output.** All spoken/visual product claims
   trace to supplied evidence (product images, captured product record,
   user-confirmed attributes). No invented facts, no price, no medical claims,
   no superlatives/guarantees. Over-length prompts are rewritten by LLM semantic
   compression — never mechanically truncated.

5. **Demonstration evidence guard (assembly guard).** The review demonstrates
   only what the evidence proves. If the images/description do not document how
   a product assembles or what its internal parts are, the system must NOT
   stage an assembly/disassembly review — it pivots to benefits and
   problem-solving over the finished, assembled product (§11.5). This directly
   targets an observed 3x3 failure: invented furniture-assembly reviews showing
   parts that do not exist on the real product.

---

## 2. Problem statement

The implemented 3x3 grid strategy has structural ceilings that per-shot
generation removes:

1. **Per-frame fidelity is capped by the grid.** One 9:16 canvas divided into 9
   cells gives each frame roughly 1/9 of the pixel budget and forces one prompt
   to describe 9 scenes at once. Product detail drift inside individual cells is
   the dominant vision-QA failure class, and repair regenerates the whole grid.

2. **Product identity is locked from a single anchor.** The current flow hard
   limits product references to exactly one approved anchor image —
   `approvedProductReferenceUrls` throws when supporting product references are
   present (`apps/web/server/services/marketplaceAutoReviewService.ts:5185-5200`,
   call site `:5310`). Sellers routinely provide 4–8 angle photos (the captured
   product record stores up to 8 image URLs), but only one can guide generation.
   When a shot needs the product's back or base, the model guesses — and drifts.

3. **The planner is deterministic, not evidence-aware.** The shipped
   `buildAutoReviewPlan` produces a fixed 9-beat structure regardless of
   category, and the prompt skill receives that fixed plan. There is no product
   evidence profile, no claim confidence levels, no conflict handling between
   the product title and what the images actually show, and no whitelist that
   downstream dialogue is checked against.

4. **Child-product safety is partial.** `buildMinorSafetyClothingLock`
   (`marketplaceAutoReviewService.ts:1395-1403`) enforces clothing safety and the
   presence directive forbids binding an uploaded presenter reference to a child
   (`:4781`), but nothing requires an adult guardian in-frame when a child is
   depicted using a child product — a policy the platform now wants as a hard
   review-content rule (motivating case: children's desk chair reviews showing
   an unaccompanied child).

5. **Per-shot video prompts inherit the grid's weaknesses.** A sliced grid cell
   is a low-resolution start frame; a dedicated per-shot start-frame image is a
   materially better anchor for video generation, as the Vertical Drama pipeline
   has demonstrated.

6. **Undocumented assembly reviews (observed production failure).** For
   furniture and similar categories the planner has produced
   assembly/disassembly content — parts spreads, fasteners, step-by-step
   builds — that no evidence supports, because neither the product images nor
   the description document the product's components. The resulting review
   contradicts the physical product. Nothing in the current contract forbids
   staging a demonstration the evidence cannot verify; the fix must reach the
   3x3 mode too, not only the new strategy.

---

## 3. Positioning against existing features

### 3.1 What already exists (verified in code, 2026-07-21)

| Capability | Where | Status |
|---|---|---|
| Auto Storyboard Review run machine (stages, leases, outbox, artifacts) | `marketplaceAutoReviewService.ts` (`BASE_STAGES` `:734`, `FULL_VIDEO_STAGES` `:743`) | Shipped (Feature 118) |
| Frame strategies `storyboard_3x3_split` \| `video_shot_start_stop` (+ `auto`) | union `:124`, `resolveFrameStrategy` `:6641-6651`; `apps/web/shared/hyperframes/autoPlan.ts:44-48,160-162` | Shipped |
| 3x3 prompt: skill-first with deterministic fallback | `productReferenceStoryboardSkillRunner.ts:1998`; fallback `build3x3StoryboardPrompt` `marketplaceAutoReviewService.ts:15239` | Shipped |
| Per-shot frame prompt builder (start/stop mode) | `buildShotFramePrompt` `marketplaceAutoReviewService.ts:15353` | Shipped |
| Candidate loop: ≥3 completed attempts, vision-QA score, best select | `MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW = 3` `:653`; `buildImageAttemptScoreBreakdown` `:6885`; `bestImageAttemptReview` `:7060` | Shipped |
| `characterPresenceMode` (auto/every_frame/most_frames) — 4-layer enforcement | directive `:4766-4783`; QA `:18978,19034`; repair `:4795-4806`; reason code `character_presence_missing` `:1778` | Shipped |
| Minor-safety clothing lock + vision-QA minor checks | `:1357,1395-1403`; QA normalizer `:1666-1735` | Shipped |
| Reference anchors payload with `lockPolicy` (incl. `multiViewReferenceSheet`) | `MarketplaceCaptureProductDetail.tsx:4312-4520` (lock policy `:4365-4389`); router `marketplaceCapture.ts:707-817` | Shipped |
| Prompt-length governance: 3800-char image budget, 2000-char video budget, LLM optimizer skill | runner `:37`; `marketplaceAutoReviewService.ts:15196,15198`; optimizer `:1535-1549` | Shipped |
| VD per-shot pipeline: fail-closed reference mapping, start-frame-as-first-reference, capacity assertion | `shared/verticalDramaSeries/characterIdentityMap.ts:317`; `routers/verticalDramaEpisodes.ts:1771,9813-9825,11648-11665` | Shipped (Feature 131/132) |
| OpenAI Agents SDK in the Python backend + native Agents-Python skill bundle contract (`scripts/run.sh`/`verify.sh`, `agents/`, `subagents.json`, phase checkpoints, verification-before-finalize) | `python-backend/requirements.txt:23` (`openai-agents==0.17.4`); Feature 106 §6 locked decisions; Feature 107 §8 bundle contract | Installed / Proposed (106/107) |

### 3.2 What this feature adds

- New frame strategy `sequential_shot_storyboard` (9 independent image units).
- New skill `product-review-sequential-storyboard` (evidence → category →
  claims → narrative → dialogue → 9 image prompts → 9 video prompts → 3-round
  loop → structured JSON).
- Multi-angle product reference support (mode-scoped relaxation of the
  single-anchor rule) with a fail-closed reference-index mapping validator.
- Guardian presence policy with new vision-QA field and publish-blocking reason
  code `guardian_presence_missing`.
- Evidence & conflict review surface in the Auto panel; per-shot regeneration.
- A SHARED evidence-guard package (`marketplaceReviewEvidenceGuard`, §3.4):
  demonstration/assembly guard (§11.5), guardian presence (§17), and
  claim-whitelist injection — adoptable by the existing 3x3 mode immediately,
  independent of the sequential rollout.

### 3.3 What this feature explicitly does NOT do

- Does not change `storyboard_3x3_split` or `video_shot_start_stop` MODE
  MECHANICS (grid layout, candidate loop, split, single-anchor payloads). The
  only sanctioned changes to existing modes are the enumerated shared
  evidence-guard components of §3.4, behind their own flag. With BOTH new
  tenant flags off, every existing byte of behavior is preserved (see
  isolation guarantees, §7.4).
- Does not migrate the run engine to the Agents SDK (Feature 117 remains the
  future replacement spec; this feature extends the shipped 118 engine and its
  concepts are designed to carry forward into 117's stage-based runtime).
- Does not implement user-age gating (Feature 128 owns that; see §17.6).
- Does not add price/discount overlays or spoken price of any kind.
- Does not build a new render pipeline (Storyboard Review, Video Editor,
  render, and Library finalize stages are reused unchanged).

### 3.4 Shared-improvement policy (explicit product direction)

Product direction from the 2026-07-21 review: improvements that fix the 3x3
mode's known failure classes (product-identity drift, invented content,
undocumented assembly reviews) must NOT be hostage to the new mode. Where a
fix benefits both systems it ships as a shared component and MAY be enabled
for the 3x3 path immediately after its tests pass — a 100%-separate system is
explicitly not required.

| Component | Scope | 3x3 adoption path |
|---|---|---|
| Demonstration evidence rule / assembly guard (§11.5) | SHARED — `marketplaceReviewEvidenceGuard` | directive injected beside the minor-safety lock into the 3x3 skill contract AND both deterministic builders (`build3x3StoryboardPrompt` `:15239`, `buildShotFramePrompt` `:15353`); QA field added to the grid vision-QA JSON (`:18960`) |
| Guardian presence policy (§17) | SHARED — same flag | §17.7 |
| Evidence profile + claim whitelist → `blockedClaims` (§10) | SHARED — same flag | whitelist + conflict exclusions appended to the 3x3 skill `runtime_contract` (`:9352`); the blocked-claims paid-media gate already exists (`:5794`) |
| Image-over-text conflict exclusions (§5.3) | SHARED — same flag | conflict list appended to the 3x3 contract as exclusion lines |
| Multi-angle product lock (§8) | mode-scoped in v1 | changing the shipped single-anchor provider payload for 3x3 is high-risk; revisit after sequential validates angle fidelity (§28) |
| 9 separate image units, per-shot prompts/regeneration | mode-scoped by definition | — |
| Loop rounds 1–3 (§16) | mode-scoped in v1 | 3x3 keeps its shipped 3-attempt preflight loop; unifying loops is future work |

Shared components live in shared builders (e.g.
`buildDemonstrationEvidenceDirective`, `buildGuardianPresenceDirective`) so
both prompt paths inject IDENTICAL text — the same pattern as
`ensureMinorSafetyClothingLockInImagePrompt` (`:1414`) which already serves
both skill and deterministic prompts today.

---

## 4. Product goals

### 4.1 Primary

1. A user can select "สร้างภาพต่อเนื่อง 9 ภาพ (Sequential)" in the Auto
   Storyboard Review panel and receive 9 separate, story-continuous,
   product-accurate frames plus a Storyboard Review — with the same run UX
   (progress, cancel, resume) as today.
2. Product identity holds across all 9 frames from any camera angle, grounded
   in user-attached multi-angle product references.
3. No frame ever depicts a child using a child-related product without an adult
   guardian present in that frame.
4. Every spoken and visual claim is traceable to supplied evidence; price and
   prohibited claim classes never appear.
5. All creative behavior lives in the skill body (skill-first); the TypeScript
   layer enforces only machine-checkable contracts.
6. Demonstrations never exceed evidence: no assembly/disassembly content when
   components are undocumented — such beats pivot to benefits and
   problem-solving framing on the finished, assembled product (§11.5).
7. The quality uplift over the 3x3 baseline is MEASURED (§25 metrics, §26 GA
   gate), not assumed; improvements that benefit both modes ship to both
   (§3.4).

### 4.2 Secondary

1. Per-shot video prompts (≤2,000 chars, mandatory global identity block) ready
   for the existing full-video stages, using each generated frame as the video
   start frame.
2. Single-shot regeneration without disturbing the other 8 shots.
3. A loop report the user can inspect (what each of the 3 review rounds
   changed).
4. Concepts and contracts reusable by Feature 117's future Agents SDK runtime.

---

## 5. Core principles

### 5.1 Skill-first execution

The skill is invoked before any prompt is produced. It owns: evidence
understanding, category classification, claim safety, narrative choice, visual
demonstration choice, dialogue, image prompts, video prompts, self-evaluation,
and revision. The application must NOT hard-code a generic nine-shot script and
substitute the product name.

Alignment with repo policy (memory `feedback_skill_first_authoring`): creative
and prompt rules live in `skill.md` + skill `references/`; TypeScript computes
facts (counts, lengths, hashes, presence of mandatory markers) and runs
deterministic backstop validators only.

### 5.2 Evidence before creativity

Factual product claims must originate from: (1) attached product reference
images, (2) captured product name, (3) captured product description/specs,
(4) structured attributes explicitly entered by the user, (5) user-confirmed
attributes from the evidence review step. The skill must not invent materials,
dimensions, mechanisms, certifications, capacities, ingredients, performance
levels, health effects, or compatibility.

This extends the shipped `ProductTruth` + `PRODUCT FACTS LOCK` contract
(Feature 118) and the extraction rule "ห้ามเดาข้อมูลที่ไม่มีหลักฐาน"
(`marketplacePromptService.ts:1-26`) into a per-claim confidence model (§10).

### 5.3 Image-over-text conflict policy

When product images and written text conflict:

- The attached product images are the primary source for **visible** product
  identity.
- Written text is primary for **non-visible** attributes only when explicitly
  stated.
- A title must never force a visible component absent from the product images
  (e.g. title says "with pillow", images show no headrest → no pillow is
  generated; "pillow" is marked `conflicting` and excluded).
- Conflicting attributes are surfaced as `needs_confirmation` in the evidence
  review surface (§21.3) and excluded from dialogue and prompts until the user
  confirms them.

### 5.4 No mechanical truncation of final prompts

If a final image or video prompt exceeds its budget, the full prompt is sent to
the LLM for semantic rewrite under the budget, preserving all mandatory
identity, safety, scene, dialogue, audio, and continuity content — then
revalidated. Mechanical substring truncation of a final prompt is prohibited.

This is already the shipped pattern: in-prompt compression directives
(`productReferenceStoryboardSkillRunner.ts:1162-1172`), the
`product-reference-storyboard-prompt-optimizer` skill invoked only when over
budget (`marketplaceAutoReviewService.ts:1535-1549`), and `compactImagePromptText`
slicing reserved for small internal sub-blocks (≤180/220/500/700 chars), never
the final prompt. The new mode follows the same split (§15).

### 5.5 Additive isolation with shared guards

Mode mechanics key off `frameStrategy === "sequential_shot_storyboard"` and
the `marketplaceSequentialStoryboard` flag; the existing strategies' forks
remain untouched by them (the codebase already forks per strategy at every
decision point — §7.4). The designated SHARED guard components (§3.4) key off
`marketplaceReviewEvidenceGuard` and are the ONLY sanctioned way this feature
changes 3x3 output — as enumerated directive/QA additions, never as
behavioral rewrites.

### 5.6 Demonstrate only what evidence verifies

A review may only physically demonstrate what the evidence proves exists.
Undocumented assembly, disassembly, or internal structure is never staged; the
default review posture is the finished, assembled product as shown in the
references, and unverifiable beats pivot to benefits and problem-solving
("สินค้านี้ช่วยแก้ปัญหาอะไร / ให้ประโยชน์อะไร"). Full policy: §11.5.

---

## 6. High-level architecture

### 6.1 Flow

```text
User opens Marketplace Capture product detail
  ↓
Auto Storyboard Review panel → selects frame strategy "sequential_shot_storyboard"
  ↓ (plan query)
getAutoStoryboardReviewPlan → plan defaults + evidence preview + blockers + estimate
  ↓ (optional) evidence & conflict review → user confirms/rejects ambiguous claims
  ↓
startAutoStoryboardReview (plan-hash guarded, idempotent)
  ↓
RUN (existing stage machine, same stage keys):
  product_preflight      — unchanged + multi-angle reference resolution + capacity check
  production_project     — unchanged (project artifacts record the new strategy)
  concept_story          — SKILL Phase A-E: evidence profile, category, claim
                           whitelist, narrative, continuous dialogue
  prompt_plan            — SKILL Phase F-K: 9 image prompts + 9 video prompts,
                           LOOP ROUNDS 1-3, length governance, structured output;
                           deterministic preflight validation
  image_generation       — 9 independent image units (one provider task per shot),
                           per-unit vision QA + targeted repair, guardian gate
  storyboard_review      — reuse createStoryboardReview with the 9 frame URLs
                           (NO grid split)
  [full_video only]
  video_generation       — per-shot video jobs: generated frame = start frame
                           (referenceImageUrls[0]) + product angles within budget
  audio_generation … library_finalize — unchanged
```

### 6.2 Stage mapping — no new stage keys

The run reuses `BASE_STAGES` / `FULL_VIDEO_STAGES` exactly
(`marketplaceAutoReviewService.ts:734,743`). The new mode changes behavior
*within* `concept_story`, `prompt_plan`, `image_generation`, and
`video_generation` behind the strategy fork. Rationale: the durable run/stage
tables, background advancement job, lease/outbox machinery, resume, cancel, and
UI progress all key on stage identity — reusing them keeps the entire
operational surface (Feature 118 §Background Advancement) working unmodified.

### 6.3 Components touched (implementation surface)

```text
apps/web/shared/hyperframes/autoPlan.ts                       — enum + override fields (§20.1)
apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx — anchors: productAngleImages (§8, §21)
apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx — strategy option + guardian UI (§21)
apps/web/server/routers/marketplaceCapture.ts                 — zod additions (§20.2)
apps/web/server/services/hyperframesRuntimeApiService.ts      — plan pass-through (§20.2)
apps/web/server/services/hyperframesAutoPlanService.ts        — estimate inputs (§22)
apps/web/server/services/marketplaceAutoReviewService.ts      — strategy fork: units, prompts, QA, repair (§18);
                                                                 shared guard builders + 3x3 injection (§3.4, §11.5, §17.7)
apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts — NEW skill runner (§9)
apps/web/shared/marketplaceCapture/referenceIndexMap.ts       — NEW pure validator (§8.5)
apps/web/skills/product-review-sequential-storyboard/         — NEW skill bundle (§9)
python-backend/ (openai-agents==0.17.4 already installed)     — OPTIONAL Tier-2 executable skill runtime (§9.8)
```

---

## 7. Frame strategy and mode selection

### 7.1 New enum value

```text
frameStrategy: "auto" | "storyboard_3x3_split" | "video_shot_start_stop"
             | "sequential_shot_storyboard"        ← NEW (26 chars; DB column is varchar(40) — no migration)
```

Insertion points (all additive enum members):

- `apps/web/shared/hyperframes/autoPlan.ts` — `HyperframesAutoPlanDefaultsSchema.frameStrategy`
  (`:44-48`), `HyperframesAutoPlanOverrideFieldSchemas.frameStrategy` (`:160-162`),
  base value table (`:202`).
- `apps/web/server/routers/marketplaceCapture.ts` — `startAutoReview` input enum
  (`:678-681`). `startAutoStoryboardReview` inherits via `plan.defaults.frameStrategy`
  (`hyperframesRuntimeApiService.ts:1383`) — no separate change.
- `apps/web/server/services/marketplaceAutoReviewService.ts` — strategy union
  (`:124`) and `resolveFrameStrategy` (`:6641-6651`).
- `AutoStoryboardAdvancedOverrides.tsx` — `frameStrategyOptions` (`:276-285`).

### 7.2 `auto` resolution is unchanged

`resolveFrameStrategy("auto")` continues to resolve to `storyboard_3x3_split`.
The new strategy is chosen only by explicit user selection. A later phase may
let `auto` prefer sequential for flagged tenants; that is out of scope for v1
and requires its own spec revision.

### 7.3 Feature flag

Tenant feature flag `marketplaceSequentialStoryboard`, default **off**,
registered in the existing tenant feature flag groups
(`apps/web/client/src/components/admin/tenantFeatureFlagsPanel` /
`tenantFeatureFlagGroups.ts` pattern, as done for `hermesMediaWorker` in
Feature 135). Enforcement is server-side: with the flag off,
`getAutoStoryboardReviewPlan` omits the option from selectable strategies and
`startAutoReview` / `startAutoStoryboardReview` reject
`sequential_shot_storyboard` with `PRECONDITION_FAILED` and Thai copy
"โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้".

### 7.4 Isolation guarantees (acceptance-tested)

1. With BOTH tenant flags off (`marketplaceSequentialStoryboard`,
   `marketplaceReviewEvidenceGuard`) ⇒ plan output, prompts, provider
   payloads, QA envelopes, and credit estimates for existing strategies are
   **byte-identical** to pre-change behavior (snapshot tests, §27). With only
   the evidence-guard flag on, 3x3 changes are limited to the enumerated
   shared directive/QA additions of §3.4 — snapshots are updated deliberately
   with exactly that diff and nothing else.
2. The single-anchor product reference rule (`approvedProductReferenceUrls`,
   `marketplaceAutoReviewService.ts:5185-5200`) remains fully enforced for
   `storyboard_3x3_split` and `video_shot_start_stop`. The multi-angle path is a
   new mode-scoped resolver (§8.3), not an edit to the existing rule.
3. Grid-layout vision QA (`:18960-19240`) and `splitStoryboardGrid`
   (`:17272,21243`) are never invoked for the new strategy; conversely their
   code paths are not modified.
4. `characterPresenceMode` semantics for the 3x3 grid are untouched; the new
   mode reuses the same field with per-frame semantics (§17.4).

---

## 8. Reference inputs and roles

### 8.1 Role model

| Role | Cardinality | Purpose | Precedence |
|---|---|---|---|
| `primary_product` | exactly 1 | canonical product identity (shape, color, construction) | highest for visible attributes |
| `product_angle` | 0..N | additional angles: back/side/top/base/detail/package/scale | supplements, never overrides `primary_product` |
| `primary_character` | 0..1 | presenter/guardian identity (adult) — from the existing "อัปโหลด reference" flow | highest for character identity |
| `environment_reference` | 0..1 | room/scene continuity | cannot change product or character |

These extend the existing three-group manifest
(`productReferenceStoryboardReferenceImageManifest`,
`marketplaceAutoReviewService.ts:5357-5387`, today `@Image1`=product,
`@Image2`=character, `@Image3`=environment) to a variable-length product block.

**Evidence-only references:** images that depict DISASSEMBLED parts, exploded
diagrams, or box contents (`angleLabel: "parts_diagram"` or `"package"`) are
EXCLUDED from generation attachment manifests by default — attaching them
would corrupt the assembled-product identity lock. They remain vision inputs
to the skill's Phase A (where a parts diagram is the only legitimate way to
set `assembly_documented: true` visually — §11.5) and are marked
`evidenceOnly: true` in the stored manifest.

### 8.2 Client payload (additive)

`buildAutoReviewReferenceAnchors` (`MarketplaceCaptureProductDetail.tsx:4312-4520`)
gains an optional array alongside the existing single-product fields:

```yaml
referenceAnchors:
  productImageUrl: …            # existing — remains the primary_product anchor
  productAngleImages:           # NEW, optional, max 8 entries
    - url: string
      ref: string               # stable ref id
      hash: string | null
      storageKey: string | null
      source: "marketplace_product_image" | "upload" | "library"
      angleLabel: "front" | "back" | "side" | "top" | "base" | "detail" | "package" | "parts_diagram" | "scale" | "other"
                                # "package"/"parts_diagram" = evidence-only (§8.1) — never attached to generation jobs
  characterImageUrl: …          # existing (adult presenter / guardian)
  environmentImageUrl: …        # existing
  lockPolicy: …                 # existing (multiViewReferenceSheet etc., :4365-4389)
```

Zod addition in `startAutoReview.referenceAnchors`
(`routers/marketplaceCapture.ts:707-817`): optional `productAngleImages`
array (max 8), each entry validated like the existing anchor fields. Sources:
the product's captured images (`marketplaceProductImages`, up to 8 URLs per
`ProductTruth`), the Media Panel (History/Library/Product tabs), or direct
upload via the existing `uploadAnchorFile` path (`:4135`).

### 8.3 Server resolution — mode-scoped multi-angle resolver

New resolver `approvedSequentialProductReferenceUrls(metadata, plan, modelCap)`
used only by the sequential strategy fork. It must NOT modify
`approvedProductReferenceUrls`. Behavior:

1. Order: `primary_product` first, then `product_angle` entries in user order.
2. Deduplicate by hash/URL; drop entries failing the same URL-resolution rules
   as today (`resolveProductReferenceStoryboardReferenceImageUrl`, `:5389`,
   requires `publicUrl`).
3. Compute the per-shot attachment budget against the image model's reference
   cap: `getReferenceImageLimitForModel` (default 5,
   `mediaGenerationService.ts:1401-1404`; e.g. `google-banana-2-lite` = 10 via
   `configJson.maxReferenceImages`, `modelRegistry.ts:503-505`).
4. Reserve slots in priority order: primary product (1) → guardian/presenter
   character (1, when required by §17) → environment (1, optional) → remaining
   slots filled with product angles. Supplementary angles are trimmed **from the
   end** — mirroring the VD ordering guarantee that trimming drops the least
   critical references first (`verticalDramaEpisodes.ts:1859-1870`,
   `verticalDramaProductTieIn.ts:922-937`).
5. **Capacity fail-closed:** if required references (primary product + required
   guardian character) exceed the model cap, throw `PRECONDITION_FAILED` before
   any credit is reserved — same contract as
   `assertRequiredCharacterReferenceCapacity` (`verticalDramaEpisodes.ts:1771`).
6. Emit a per-shot manifest (extending the existing manifest shape) mapping
   attachment position → role → angleLabel, persisted in run metadata and
   passed to providers via `extraParams.referenceImageManifest` exactly as
   today (`marketplaceAutoReviewService.ts:18584-18626`).

Note: slot RESERVATION priority (step 4) decides which references survive a
tight model cap; attachment ORDER always follows §8.4 (primary product, then
angles, then guardian, then environment). The two are different rules —
implementers must not conflate them: e.g. environment is reserved before
supplementary angles but is still attached after them.

### 8.4 Reference numbering contract in prompts

Per-shot prompts must reference images strictly by attachment position:

```text
@Image1            = primary product identity (absolute source of truth)
@Image2..@ImageK   = additional product angles (angleLabel stated per index)
@Image(K+1)        = adult presenter/guardian identity (when attached)
@Image(K+2)        = environment reference (when attached)
```

The skill authors these bindings (skill-first — mirrors the VD rule that the
Image-N↔identity mapping is skill-authored, never code-appended,
memory `project_vd_start_frame_reference_mapping`).

### 8.5 Fail-closed reference-index mapping validator

New pure shared module `apps/web/shared/marketplaceCapture/referenceIndexMap.ts`,
modeled on `findCharacterImageIndexMappingMismatches`
(`shared/verticalDramaSeries/characterIdentityMap.ts:317`):

- `findReferenceIndexMappingMismatches(prompt, manifestEntries)` extracts
  explicit `@ImageN` role claims from the compiled prompt and reports any claim
  that contradicts the actual attachment manifest (e.g. prompt says "@Image3 is
  the product back view" but position 3 is the guardian reference).
- Deliberately lenient like the VD original: a prompt with no explicit claim
  for an index is never a mismatch.
- Enforcement: one deterministic corrective retry through the skill, then
  **throw** (`PRECONDITION_FAILED`) rather than persist or submit a
  contradictory prompt — the `VdReferenceMappingError` pattern
  (`verticalDramaStartFrameGeneration.ts:111-120,1462-1536`;
  router mapping `verticalDramaEpisodes.ts:12670-12674`).
- Re-validated at submit time against the live attachment order before credits
  are reserved (the `:9813-9825` pattern), because references can change
  between prompt authoring and generation.

---

## 9. New skill: `product-review-sequential-storyboard`

### 9.1 Bundle layout

```text
apps/web/skills/product-review-sequential-storyboard/
├── skill.md            # canonical body (lowercase wins on read — skillFiles.ts:7,146-154)
├── SKILL.md            # byte-identical twin (repo convention)
├── schemas/
│   ├── input.schema.json
│   ├── output.schema.json
│   └── ui.schema.json
└── references/
    ├── claim-safety.md          # prohibited/safe Thai wording (§10.4, §12.5)
    ├── narrative-patterns.md    # category-conditional shot structures (§11.3)
    ├── guardian-presence.md     # child-product guardian rules (§17.2)
    └── demonstration-evidence.md # assembly/demonstration verifiability rules (§11.5)
```

App-scoped under `apps/web/skills/` (NOT the root portable mirror), auto-synced
to the DB registry by content hash on boot and per-use
(`skillRegistry.ts:365,549`; cache TTL 60s `:307`). Category rule files continue
to come from the shared library
`product-reference-storyboard/references/product-categories/<category>.md` via
`appendProductReferenceStoryboardCategoryRules`
(`productReferenceStoryboardCategoryRules.ts:75-149`) — no duplication.

When the skill is upgraded to the executable runtime (Tier 2, §9.8) the bundle
additionally carries `scripts/run.sh`, `scripts/verify.sh`,
`agents/orchestrator.md` + `agents/specialists/`, and `subagents.json` per the
Feature 106/107 native Agents-Python bundle contract. `skill.md`/`SKILL.md`
remain the primary contract in both tiers (Feature 106 locked decision #2) —
note that `product-reference-storyboard` already ships `skill.lock.json` +
`references/{input_contract,output_contract,maintenance}.md`, so the
marketplace skill family is already partway onto that bundle shape.

### 9.2 Frontmatter (contract)

Modeled on `product-reference-storyboard` (runner `:33`) and
`product-video-motion-prompt`:

```yaml
name: product-review-sequential-storyboard
description: Marketplace Auto Review sequential 9-shot product-review storyboard skill.
  Builds an evidence profile, classifies the product, whitelists claims, plans a
  continuous 9-shot narrative with Thai dialogue, and emits one start-frame image
  prompt and one self-contained video prompt per shot with a 3-round review loop.
category: image_prompt_generation
version: 1.0.0
tags: [shared-skill, product-fidelity, marketplace-auto-review, sequential-storyboard]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only   # Tier 1 baseline; set to agents_python when Tier 2 is adopted (§9.8)
strict_provider_pin: false
execution_policy:
  mode: requirements
  requirements: { supportsVision: true, contextLength: 1000000 }
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
config:
  media_studio:
    marketplace_auto_review_sequential_storyboard:
      enabled: true
      loop_rounds: 3
      candidate_count: 3         # best-of-N ceiling for §9.7 candidate comparison
      min_prompt_score_to_pass: 88
```

### 9.3 Execution phases (skill body)

```text
Phase A: Analyze evidence            → ProductEvidenceProfile (§10.1)
Phase B: Detect category + conflicts → category, subcategory, conflicts[]
Phase C: Build claim whitelist       → claim_whitelist[] with confidence levels
Phase D: Plan narrative              → 9 shots, category-appropriate (§11)
Phase E: Write continuous dialogue   → Thai, hook ≤3s, per-shot ≤ duration (§12)
Phase F: Generate start-frame prompts→ one per shot (§13)
Phase G: Generate video prompts      → one per shot, global block included (§14)
Phase H: Loop round 1                → evidence & category alignment (§16.1)
Phase I: Loop round 2                → narrative, continuity, feasibility (§16.2)
Phase J: Loop round 3                → compliance, provider readiness, compression (§16.3)
Phase K: Validate and emit           → structured JSON per output.schema.json (§19.2)
```

### 9.4 Runner

New `productReviewSequentialStoryboardSkillRunner.ts` following the shipped
runner shape exactly (`productReferenceStoryboardSkillRunner.ts:1998-2079`):

1. `syncSingleSkillIfChanged(id)` → throw on sync error.
2. `getSkillByIdAsync(id)` → throw "skill not found or not enabled".
3. System prompt = `skill.systemPrompt ?? skill.skillContent` + runtime
   contract lines (budgets, shot count, reference manifest, product truth,
   guardian policy inputs, blocked claims, confirmed attributes).
4. Input-schema audit hard-fails before any credit/provider call
   (`:2054-2079` precedent).
5. `resolveSkillExecutionPolicy` → model; `getProviderForModel` with
   `strictProviderPin` / `disableProviderFallbacks: true` as marketplace skill
   calls do today (`marketplaceAutoReviewService.ts:11773`).
6. Vision inputs: the product reference images are attached to the skill call
   (the skill sees the actual product) — required for Phase A visual
   verification and the image-over-text policy.
7. Structured output parsed with the shared lenient JSON machinery:
   `executeJsonPlanningCallWithRetry` + `extractJson`/jsonrepair + lenient enum
   normalizers (`verticalDramaStoryBible.ts:1353,970,1268` precedent — chosen
   because weak/cheap models emit off-enum labels; do not fix by changing the
   model, per cost policy memory `project_vd_weak_model_json_class`).

### 9.5 Deterministic fallback (fail-open at run level)

If the skill fails structurally after the bounded attempts (§16.4), the run
does not die: it falls back to deterministic per-shot prompts derived from the
deterministic plan via the existing `buildShotFramePrompt`
(`marketplaceAutoReviewService.ts:15353`) plus the product-lock, guardian, and
layout lock lines — with audit warning
`sequential_prompt_degraded_fallback` (mirror of
`storyboard_prompt_degraded_fallback`, `:9512,9611-9616`). Degraded runs skip
claims/dialogue enrichment but keep every safety lock. Money-path and safety
validators remain fail-closed (§23).

### 9.6 Skill input contract (basis of `input.schema.json`)

| Input | Source | Notes |
|---|---|---|
| `product_name`, `product_description`, `product_specs` | `ProductTruth` (captured record, Features 113/118) | untrusted content — see §24 |
| `reference_manifest[]` | §8.3 resolver | index, role, angleLabel, url |
| `target_language` | fixed `th` in v1 | multilingual deferred (§28) |
| `shot_count` | fixed `9` in v1 (`MAX_SHOT_COUNT`) | configurable count deferred (§28) |
| `max_shot_duration_seconds` | fixed `10` | §12.2 |
| `image_prompt_max_characters` / `video_prompt_max_characters` | §13.3 / §14.3 | effective budgets after provider clamp |
| `review_tone` + creative preset selections | shipped creative preset system (§12.6) | `tone_preset`, `story_arc_preset`, `pacing_preset`, `camera_motion_preset`, `visual_style_preset`, `audio_preset`, `platform_preset`, `segment_structure_preset` |
| `video_structure_mode` | existing `videoStructureMode` override (`autoPlan.ts:59,170`) | |
| `motion_direction` | existing `motionDirection` override (`autoPlan.ts:70,181`) | dual injection preserved (§14.6) |
| `target_audience` | NEW optional override (§20.1) | Phase D audience fit |
| `user_requirements` | NEW optional free-text override (§20.1) | unverifiable requested features → `needs_confirmation`, never silently claimed |
| `forbidden_claims[]`, `confirmed_attributes` | §10.3 / §20.1 | |
| `child_subject_policy` | §17.2 (computed in TS) | includes guardian reference index when attached |
| `character_mode`, `character_presence_mode` | existing fields | §17.4 |
| `audio_strategy` (resolved) | Feature 118 resolver | dialogue embedded vs visual-only video prompts (§12.4) |
| `platform_constraints` | plan platform preset | 9:16 vertical in v1 |

### 9.7 In-skill prompt quality assurance — mandatory before return

Product direction (2026-07-21): prompt-quality verification is the SKILL's
responsibility, not an afterthought the caller performs. The skill must never
return a prompt set it has not verified. Sanctioned mechanisms — the skill
uses whichever fits, or both:

1. **Review/repair looping** — the three §16 rounds (evidence → narrative →
   compliance/compression), iterating until checks pass or the round budget is
   exhausted.
2. **Best-of-N candidate comparison** — generate N complete candidate prompt
   sets (or N candidates for a weak shot), judge them comparatively against
   the §16.4 score dimensions, and return the winner. Default N ≤ 3 (skill
   config `candidate_count`), so cost stays predictable.

Non-negotiable properties, regardless of mechanism or tier (§9.8):

- **Auditable** — round outputs, candidate counts, scores, and the selection
  rationale land in `metadataJson.loopReport` (§16.4/§19.2). A bare final
  answer with no verification evidence is a contract violation the runner
  rejects.
- **Verified before return** — the skill's own final QC (§19.2 `finalQc`)
  must pass before output is emitted; in Tier 2 the bundle verification gate
  additionally blocks finalize (Feature 106 locked decision #6: "Failed
  verification blocks finalize").
- **Backstopped** — the TS deterministic preflight (§23.1) still runs on
  whatever the skill returns (defense in depth); it is a backstop, not the
  primary QA.

### 9.8 Skill execution tiers — markdown baseline vs executable Agents SDK runtime

The skill is NOT limited to a prompt-only `SKILL.md`. Two sanctioned execution
tiers, sharing identical contracts:

**Tier 1 — markdown skill (baseline; Phases 1–5 default).** `skill.md` body +
TS runner (§9.4) + TS-orchestrated loop rounds (§16.4). Works with today's
registry/runtime with no new infrastructure.

**Tier 2 — executable Agents-Python skill (sanctioned upgrade).** The bundle
becomes a Feature 106/107 native bundle (`target_platform = agents_python`)
running on the Python backend, where the OpenAI Agents SDK
([openai/openai-agents-python](https://github.com/openai/openai-agents-python))
is already installed (`python-backend/requirements.txt:23`,
`openai-agents==0.17.4`). The ENTIRE pipeline — Phases A–K, the three rounds,
candidate comparison, semantic compression, reference-mapping self-check, and
final validation — completes INSIDE the skill workflow (orchestrator +
specialist subagents per Feature 107 §8), and only the final §19.2 structured
output returns to the TS runner in a single invocation.

Tier-2 contract requirements (all mandatory):

1. **Same I/O contract.** Identical `input.schema.json` (§9.6) and §19.2
   output schema as Tier 1 — the TS caller cannot tell the tiers apart except
   by richer loop/candidate evidence.
2. **Gateway-routed LLM calls only.** Every model call inside the workflow
   goes through the platform LLM gateway with the run's credit context (the
   Feature 117 rule); direct provider calls from skill code are prohibited
   (§22).
3. **Phase-supervised checkpoints.** Each round/candidate result is
   checkpointed into run metadata as it completes (Feature 106 locked
   decision #5), so restarts resume mid-loop and audit stays complete.
4. **Verification gate.** The bundle's `scripts/verify.sh` contract validates
   the final output (schema, budgets, global-block markers, guardian/assembly
   directives, mapping claims) and failed verification blocks finalize
   (Feature 106 locked decision #6).
5. **Sandbox loading model.** Runs sandbox-mounted per Feature 106
   (`SandboxAgent` + Skills capability); repo-vetted code only; runtime policy
   beats prose (§24).
6. **Fallback.** If the Tier-2 runtime is unavailable or errors terminally,
   the runner falls back to Tier 1, then to the deterministic fallback (§9.5)
   — the run never dies because of the runtime choice.
7. **Declared in frontmatter.** `execution_mode: agents_python` (additive
   value; the registry passes `execution_mode` through and defaults to
   `llm-only` — `skillRegistry.ts:451,658`). Switching tiers is a per-skill
   change, not a tenant flag.

**Adoption gate ("ถ้าประเมินแล้วดีกว่า"):** Tier 2 is adopted for this skill
only after the §27 tier-parity eval harness shows measurable uplift over
Tier 1 on the same fixtures (§16.4 scores + §25 metrics) at acceptable latency
and cost. It is an assessed upgrade, not a default assumption — Phase 6
(§26).

**Layer note:** §9.8 upgrades the SKILL execution runtime only. The RUN engine
(stages, leases, credits, provider dispatch) remains the Feature 118 machine;
migrating the run engine itself to the Agents SDK remains Feature 117's scope.

---

## 10. Product evidence profile and claim whitelist

### 10.1 `ProductEvidenceProfile`

Built by skill Phase A from `ProductTruth` (name, brand, description, specs, up
to 8 image URLs — Feature 118 §Product Truth) plus visual inspection of the
attached references:

```json
{
  "visible_identity": {
    "shape": [], "colors": [], "materials_visible": [],
    "components_visible": [], "countable_parts": {},
    "mechanisms_visible": []
  },
  "declared_attributes": {
    "dimensions": [], "weight": null, "capacity": null,
    "materials": [], "functions": [], "usage_contexts": [],
    "care_instructions": [], "warnings": []
  },
  "verified_claims": [], "conditional_claims": [],
  "conflicts": [], "excluded_claims": [], "missing_information": [],
  "assembly_documented": false,
  "assembly_evidence": []
}
```

Persisted at `marketplace_auto_review_runs.metadataJson.evidenceProfile`
(JSONB — no schema migration, Feature 134 precedent).

### 10.2 Claim confidence levels

Every product statement carries one level:
`visual_verified` | `text_verified` | `user_confirmed` | `conditional` |
`unsupported` | `conflicting`.

Only `visual_verified`, `text_verified`, `user_confirmed`, and approved
`conditional` claims may appear in dialogue or prompts. `conditional` claims
must use design-intent wording (e.g. "ออกแบบมาให้…", "ช่วยให้ปรับ…ได้สะดวกขึ้น")
— the wording catalog lives in `references/claim-safety.md`, not in TS.

### 10.3 Conflicts and confirmation

`conflicting` and high-value `unsupported` attributes surface in the plan
response as `evidencePreview.needsConfirmation[]` (§20.2). The user confirms or
rejects them in the evidence review UI (§21.3); confirmations flow back as the
additive override `confirmedAttributes` and upgrade the claim to
`user_confirmed`. Unresolved conflicts never appear in output. Generation is
NOT blocked by unresolved conflicts (they are excluded instead) except for the
hard-failure cases in §23.1.

### 10.4 Claim safety (extends shipped blocked-claims)

The run already carries `claimEvidenceMapping.blockedClaims` with a fail-closed
paid-media gate (`marketplaceAutoReviewService.ts:5794,5947` — blocked claims
must be repaired/approved before paid stages). The skill's whitelist feeds this
same mapping. Prohibited classes (canonical Thai/English lists in
`references/claim-safety.md`): superlatives ("ดีที่สุด", "อันดับหนึ่ง", "100%"),
guarantees ("รับรองว่า…", "เห็นผลทันที", "ไม่มีวันพัง"), medical/therapeutic
claims ("ใช้แล้วหาย…", "ป้องกันโรค", "ป้องกันสายตาเสีย", "ไม่ปวดหลังแน่นอน"),
fabricated popularity/sales, and **all price content** (§12.5).

---

## 11. Category classification and review strategy

### 11.1 Category source

Reuse the shipped 21-value category enum
(`marketplaceAutoReviewService.ts:1220-1245`) and inference
(`inferProductReferenceStoryboardCategory`, `:9185`); the skill may refine
subcategory (free text) but the enum value is the routing key for category rule
injection (`appendProductReferenceStoryboardCategoryRules`,
`productReferenceStoryboardCategoryRules.ts:75-149` — fails open to
`missing_category` audit status, unchanged).

### 11.2 Category-aware emphasis

The skill selects features to demonstrate by priority: visually demonstrable →
primary purchase-decision → seller-described → safely explainable → fits shot
duration. A cosmetic, a storage box, an electronic device, and a desk chair
must not receive identical action plans. Per-category emphasis guidance lives
in `references/narrative-patterns.md` (furniture: scale/adjustment/movement;
electronics: ports/controls/stated compatibility; child products:
age-appropriate usage + guardian supervision; food: supplied ingredients/taste
only; etc.). Feature selection is additionally constrained by the
demonstration evidence rule (§11.5): a feature that cannot be DEMONSTRATED
within evidence is NARRATED as a benefit instead of being staged.

### 11.3 Default nine-shot structure (category-configurable)

1. Hook (problem / curiosity / immediate use case — lands within 3 seconds)
2. Product reveal (exact product, hero angle)
3. Who it suits / usage context
4. Primary function demonstration
5. Secondary function demonstration
6. Design or construction feature
7. Material or tactile detail
8. Real-use demonstration and result
9. Balanced summary and soft CTA

This refines (does not replace) the deterministic 9-beat guide of Feature 118;
the deterministic guide remains the fallback plan (§9.5). Hook rules: no
fabricated emergencies, fear, unsupported health warnings, false scarcity, or
price hooks.

### 11.4 Worked example (motivating case: เก้าอี้เด็ก — children's desk chair)

Expected skill behavior for the request's example product (4 seller angle
images + adult character reference attached):

- category: child desk chair → child-related ⇒ `childSubjectPolicy` active
  (§17.2).
- review emphasis: seat-height adjustment (lever visible), mesh backrest,
  padded seat, caster movement, footrest ring (visible), desk fit; armrest
  adjustability only if visible or text-verified.
- excluded/conditional: "ป้องกันสายตาเสีย" (unsupported medical); load-capacity
  figures unless text-verified (and then conditional wording only); any
  pillow/headrest absent from the product images even if the title mentions
  one (§5.3); "กันลัดหัน 90 องศา" spoken as a guarantee → conditional design
  wording grounded in the visible armrest mechanism.
- unsafe → safe transformation:
  "ช่วยเด็กคงท่านั่ง 90 องศาและป้องกันสายตา" →
  "ปรับระดับให้เหมาะกับโต๊ะได้ง่ายขึ้น และควรจัดโต๊ะกับเก้าอี้ให้เหมาะกับสรีระของผู้ใช้"
- every frame that shows the child seated on or using the chair also shows the
  adult guardian (matching the uploaded reference) beside or behind the child;
  hook and product-reveal shots may be product-only or hands-only.
- assembly: no assembly documentation exists in the evidence →
  `assembly_demo` is forbidden (§11.5); the chair is reviewed FULLY ASSEMBLED.
  The height lever and casters may be demonstrated (`usage_demo`) because they
  are visible operating parts in the references — but no screws, no parts
  spread, no "ประกอบง่ายใน 10 นาที" claims.

### 11.5 Demonstration evidence rule — assembly guard (SHARED with 3x3)

Motivating failure observed in production with the 3x3 mode: for furniture,
the planner invents an ASSEMBLY review — parts spreads, fasteners, and
step-by-step builds that exist in no evidence — because nothing tells it how
the product assembles, and it fills the gap with imagination. The resulting
frames show components that do not match the physical product. The rule:

1. Every shot declares `demonstration_type`:
   `finished_product_showcase` | `usage_demo` | `feature_closeup` |
   `benefit_narration` | `problem_solution` | `assembly_demo`.
2. `assembly_demo` (assembly, disassembly, exploded parts, internal-mechanism
   exposure, "what's in the box" contents) is allowed ONLY when
   `evidenceProfile.assembly_documented === true` — explicit assembly
   steps/parts in the captured description/specs (text_verified), a
   seller-provided parts/diagram image (§8.1), or user confirmation. Component
   counts, fasteners, and internal frames must never be depicted beyond that
   evidence.
3. When assembly evidence is absent, the skill must NOT plan assembly
   content. The affected beat pivots to `benefit_narration` or
   `problem_solution` framing ("สินค้านี้ช่วยแก้ปัญหาอะไร / ให้ประโยชน์อะไร")
   over the FINISHED, fully assembled product — the assembled state shown in
   the references is the review's default posture and yields content that
   matches the real product.
4. Visible-operation demos (levers, wheels, folding armrests — mechanisms
   visible operating in the reference images) are `usage_demo` /
   `feature_closeup`, not assembly — they remain allowed.
5. Category defaults (`references/narrative-patterns.md` +
   `references/demonstration-evidence.md`): furniture assembly beats default
   OFF; the wording that replaces them lives in the skill references
   (skill-first — TS never authors the pivot text).
6. Enforcement layers (same shape as §17.3): skill rule (Phases D/F) → loop
   round 1 check (§16.1) → deterministic preflight blocker
   `assembly_demo_unverified` when a prompt stages assembly while
   `assembly_documented` is false (§23.1) → vision-QA field
   `assemblyContentDetected` with reason code `assembly_content_unverified`
   → targeted repair directive "reframe on the fully assembled product;
   remove parts/disassembly imagery".
7. SHARED adoption (§3.4): `buildDemonstrationEvidenceDirective` and the QA
   field apply to the 3x3 mode under `marketplaceReviewEvidenceGuard` —
   injected beside the minor-safety lock into the 3x3 skill contract and both
   deterministic prompt builders (`build3x3StoryboardPrompt` `:15239`,
   `buildShotFramePrompt` `:15353`), and added to the grid vision-QA JSON
   (`:18960`). This retrofits the observed 3x3 failure without waiting for
   sequential GA.

---

## 12. Narrative, dialogue, and duration model

### 12.1 Continuity

Dialogue reads as ONE continuous Thai review across shots 1→9: each shot
connects to the previous, introduces one main point, avoids repeating the full
product name, and hands off naturally to the next shot.

### 12.2 Duration

```yaml
shot_count: 9                       # MAX_SHOT_COUNT = 9 (marketplaceAutoReviewService.ts:235)
max_shot_duration_seconds: 10       # hard cap, validated
default_shot_duration_seconds: 5    # current shipped default remains the baseline
recommended: { hook: 3-5, feature: 4-8, closing: 5-8 }
```

The skill assigns per-shot `duration_seconds` (3–10). Full-video runs pass the
per-shot duration to video generation instead of the fixed 5s where the
selected video model supports it; otherwise the model's supported duration is
used and dialogue is fitted to it.

Deliberate v1 deviation from the source document: `number_of_shots` is fixed
at 9 (the shipped `MAX_SHOT_COUNT`); a configurable shot count is deferred
(§28).

### 12.3 Speech-rate estimation

Deterministic TS estimator (facts-only): Thai ≈ 17 chars/sec with coverage
factor — the shipped VD heuristic (memory `project_vd_extension_speaking_time`)
— targeting the fast-clear review style (≈4.0–5.0 Thai syllables/sec). If
estimated speech exceeds the shot duration, the skill rewrites the dialogue
(preserving factual meaning); the estimator never trims words itself.

### 12.4 Voiceover integration (unchanged surfaces)

Audio strategies and their resolution rules are reused verbatim from
Feature 118 (`resolveMarketplaceAutoReviewAudioStrategy`): native-audio models
embed per-shot Thai dialogue in the video prompt; `separate_tts_voiceover`
keeps video prompts visual-only and routes the full script through
`generateAudioAsync`; the `elevenlabs-product-voiceover-dialogue` rewrite hook
(`marketplaceAutoReviewService.ts:11604`) remains the dialogue polish pass.

### 12.5 Price policy

No spoken or visual price, discount, "ราคาถูกที่สุด", comparison, flash sale,
voucher, or shipping-price content anywhere in dialogue or prompts (price data
goes stale; evergreen output must not embed it). A separate editable overlay
slot outside the spoken script remains a future extension (§28). Deterministic
backstop: a TS price-pattern validator (Thai + numeric patterns) runs in
prompt preflight (§23.1) — detection is deterministic; the rewrite is always
the skill's job.

### 12.6 Tone, structure, and audience inputs (existing overrides reused)

The Auto panel already ships an "อารมณ์และโครงเรื่อง" section — the
"อารมณ์ / โทนการพูด" tone picker (`MarketplaceCaptureProductDetail.tsx:5072`,
carried as `reviewTone` `:4355`) and storytelling-structure selection — backed
by the shipped creative preset system
(`shared/hyperframes/autoReviewCreativePresets.ts:3-12`: families
`tone_preset`, `story_arc_preset`, `pacing_preset`, `camera_motion_preset`,
`visual_style_preset`, `audio_preset`, `platform_preset`,
`segment_structure_preset`; compiled by
`buildAutoReviewCreativePresetDirective` `:311`), plus the
`videoStructureMode` and `motionDirection` overrides
(`shared/hyperframes/autoPlan.ts:59,70`). Sequential mode consumes these SAME
fields — no parallel fields are introduced:

- tone preset / `reviewTone` → skill Phase D/E dialogue register (e.g.
  จริงใจเป็นกันเอง, ผู้เชี่ยวชาญมั่นใจ); claim-safety rules always win over
  tone;
- story-arc / segment-structure presets → Phase D narrative pattern selection;
  `auto` falls back to the category default (§11.3);
- pacing / camera-motion / visual-style / audio presets → the compiled preset
  directive is passed into the skill contract exactly as the 3x3 path receives
  it today;
- `target_audience` (new optional override, §20.1) → Phase D shot 3 ("who it
  suits") and vocabulary level;
- `user_requirements` (new optional free text, §20.1) → Phases A–D; a
  requested feature that cannot be verified against evidence becomes
  `needs_confirmation` (§10.3) and is NEVER silently claimed.

---

## 13. Start-frame image prompts (one per shot)

### 13.1 Mandatory content

Each of the 9 image prompts must contain: reference lock block (§8.4), the
shot's visual event, product components that must remain visible, character
continuity (when present), camera framing/angle, environment + lighting
continuity, photorealistic commercial style, `9:16`, no-text restriction, and
shot-specific negative constraints. The template (adapted from the source doc)
lives in the skill body — TS only verifies the machine-checkable markers
(§23.1).

### 13.2 Start-frame action rule

The start frame depicts the BEGINNING of the shot's action (hand approaching
the lever, product entering frame, hand just above the cushion) — not the
completed end state — unless the shot is a static beauty shot. This gives the
video model a clear motion trajectory (rule text lives in the skill body).

### 13.3 Budget

```text
MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS = 4000   (new constant)
effective budget = min(4000, provider maxPromptLength when defined)
```

Reconciliation note: the source document specifies 4,000; the shipped 3x3
budget is 3,800 (`PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS`,
`productReferenceStoryboardSkillRunner.ts:37`) because one grid prompt must
describe 9 frames. Per-shot prompts describe one frame, so 4,000 with provider
clamp is safe; the constant is mode-scoped and configurable. Counting method:
Unicode character count of the final compiled prompt. Over-budget handling: §15.

---

## 14. Video prompts (one per shot)

### 14.1 Self-contained contract

Each shot's video prompt is submittable as-is (no hidden appended text) and
contains: the mandatory global block (§14.2), duration, scene, camera, one
clear action starting from the shot's generated start frame, spoken Thai
dialogue (audio-strategy dependent, §12.4), performance, shot audio/foley, and
continuity constraints.

### 14.2 Mandatory global video block (compiled per product)

The skill compiles the generalized block for every shot — product- and
character-specific nouns come from the evidence profile; the semantic content
is fixed:

```text
Use @Image1 as the absolute product identity reference[ and @Image(K+1) as the
character identity reference when supplied]. Keep the exact same [PRODUCT
IDENTITY SUMMARY] and the same [CHARACTER IDENTITY SUMMARY] consistent in every
shot. Use the additional product angle references only to keep the product
accurate from every camera direction; never let them override @Image1.

Style: photorealistic commercial short-form review video, 9:16 vertical,
[PROJECT LIGHTING], realistic motion, realistic hands, stable product
structure, clean background, no visible text overlays, no logo, no price
mention.

Dialogue style: natural Thai product-review tone, concise, trustworthy,
family-friendly, no hard-sell shouting, no exaggerated medical or scientific
claims, no guarantee claims, no superlative superiority claims, no false
promises.

Audio: clear Thai voiceover or spoken dialogue, natural room ambience, only
product-relevant foley synchronized with visible actions.
```

Presence of this block in every video prompt is a deterministic preflight
check (marker-based, §23.1) — extending the shipped video reference contract
(`videoReferenceContract` / `buildVideoPrompt`, Feature 118 §Video Prompt
Behavior) and the identity-safety language already shipped in
`product-video-motion-prompt` (`skill.md:86-94`).

### 14.3 Budget

Reuse `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000`
(`marketplaceAutoReviewService.ts:15198`) — identical to `VD_VIDEO_PROMPT_MAX`
(`shared/verticalDramaSeries/contracts.ts:1247`). Over-budget handling: §15.

### 14.4 Start-frame + reference attachment (full-video stages)

Per-shot video jobs follow the VD pattern:

- The shot's approved generated frame is **`referenceImageUrls[0]`** (start
  frame) — `verticalDramaEpisodes.ts:11648-11665` precedent.
- Remaining budget = `maxReferenceImages − 1`, filled priority-first: guardian/
  presenter portrait (when depicted) → primary product → product angles,
  trimmed from the end.
- Single-reference video models (e.g. `grok-imagine-video-1-5-preview`,
  `maxReferenceImages: 1`, `modelRegistry.ts:890-891`) receive ONLY the start
  frame, which carries 100% of identity — the `:11579-11600` guard pattern; the
  prompt text compensates with the product identity summary.
- Reference mode semantics reuse Feature 118's `single_storyboard_frame`
  contract: additional references are immutable product references, never
  alternate frames or stop frames.

### 14.5 Provider capability notes (from `modelRegistry.ts`, informative)

| Video model | Start frame | Max refs | Prompt cap |
|---|---|---|---|
| veo-3 / veo-3-1 (kie.ai) | yes | 3 | 5000 |
| grok-imagine-video-1-5-preview | yes | 1 | 5000 |
| happyhorse/reference-to-video | yes | 9 | — |
| wavespeed seedance 2.0 i2v | required | 4 | — |
| kling-2.6 / sora-2 | no | 0 | 5000 |

Models without start-frame support are not selectable for sequential
full-video runs (plan blocker, §23.2 warning → §23.1 hard fail at start).

### 14.6 Motion direction and internal composition fields

- The existing `motionDirection` override keeps its shipped dual injection in
  this mode: it constrains the concept/story plan AND appears in each
  submitted per-shot video prompt's action/camera language (the
  `product-video-motion-prompt` dual-injection pattern), subject to loop
  round 2 feasibility simplification (§16.2).
- Internally the skill composes each video prompt from structured fields
  (scene, camera, action, dialogue, performance, audio_details,
  continuity_constraints, negative_constraints — source doc §10.3). Only the
  compiled self-contained `video_prompt` is the provider artifact; the
  composition fields MAY be persisted in shot metadata for UI display but are
  never required by the provider path and never re-assembled by TS code.

---

## 15. Prompt length governance (no mechanical truncation)

Applies to both prompt families:

1. In-skill length directives (Phase F/G) using the shipped
   `buildPromptLengthPlan` Thai-aware guidance
   (`promptLengthGuard.ts:83-109`).
2. Loop round 3 (§16.3) performs semantic compression inside the skill.
3. Post-hoc guard: if a FINAL prompt still exceeds budget, invoke the
   `product-reference-storyboard-prompt-optimizer` skill with a new input flag
   `prompt_kind: "sequential_image" | "sequential_video"` (optimizer prompt
   preserves the §13.1 / §14.1 mandatory sets), audit reason
   `final_image_prompt_over_provider_budget` /
   `final_video_prompt_over_provider_budget` — extending the shipped
   `optimizeMarketplaceAutoReviewFinalImagePromptForProvider`
   (`marketplaceAutoReviewService.ts:1535-1549`).
4. Revalidate after rewrite; bounded attempts (§16.4); if still over budget →
   hard failure (§23.1). Never `slice()` a final prompt.
5. `compactImagePromptText` (`:15200-15206`) remains legal ONLY for small
   internal sub-blocks per its existing call sites; adding new call sites
   against final prompts is prohibited and lint-guarded by test (§27).
6. **Provider prompt compilation rule** (source doc §21): neither this spec
   nor the skill body is ever sent verbatim to an image/video provider. The
   runtime compiles, per shot:

   ```text
   Evidence Profile + Category Strategy + Global Identity Lock
   + One Shot Instruction + Relevant Negative Constraints
   = Provider-ready prompt (within budget)
   ```

---

## 16. Three-round loop engineering

### 16.1 Round 1 — evidence and category alignment

Checks: every claim exists in the evidence profile; structure suits category;
visible parts consistent with references; conflicts excluded; no invented
feature; each visual action demonstrates the spoken feature; no shot stages
assembly/disassembly or internal components without documented assembly
evidence (§11.5 — such beats must already be benefit/problem-solution framing
on the assembled product). Actions: rewrite unsupported claims, replace
unsuitable shots, pivot undocumented demonstrations, update claim-to-shot
mapping.

### 16.2 Round 2 — narrative, continuity, production feasibility

Checks: hook lands ≤3s; dialogue flows 1→9; one point per shot; ≤10s per shot;
speech intelligible at estimated rate; every image prompt is a valid START
state; video action can begin from it; camera moves simple enough for current
video models; character/product/wardrobe/room/lighting continuity; physically
plausible hands/mechanisms. Actions: rewrite transitions, simplify actions,
adjust durations, improve start-frame→motion compatibility.

### 16.3 Round 3 — compliance, provider readiness, compression

Checks: no overclaims/guarantees/medical/superlatives; price absent; image
prompts ≤ budget; video prompts ≤ budget and contain the global block; negative
constraints concise; output remains natural after compression. Actions: rewrite
risky dialogue, semantically compress over-length prompts, restore any
mandatory content lost during revision.

### 16.4 Loop mechanics (TS orchestration, facts-only)

- Orchestration is auditable; judgment is skill-driven. The invariant: rounds
  must be durable and auditable — an UNAUDITABLE single LLM call that
  "self-loops" invisibly and returns only a bare final answer is unacceptable
  in either tier. How rounds are driven depends on the execution tier (§9.8):
  - **Tier 1 (markdown skill):** the TS runner executes up to 3 skill
    invocations, each carrying the prior round's retained output plus that
    round's review contract (§16.1–16.3 focus); what each round evaluates and
    rewrites is defined in the skill body (Phases H–J). Use the
    injectable-effects loop orchestrator pattern of
    `videoProjectQualityLoop.ts` (`:60-63`) with `maxLoops = 3` (`:124-126`),
    or the bounded-attempt shape already shipped for prompt preflight
    (`MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS = 3`,
    `marketplaceAutoReviewService.ts:1218`, loop `:9617-9697`).
  - **Tier 2 (executable Agents SDK skill):** the rounds run INSIDE the skill
    workflow, which checkpoints each round's output and scores back into run
    metadata as it goes (Feature 106 phase supervision) and must pass its
    verification gate before returning (§9.8); the TS runner makes ONE
    invocation and receives the final structured output plus the full round
    evidence.
  In both tiers rounds run inside the `prompt_plan` stage; each round's output
  and scores are persisted before the next begins, so a run resumes mid-loop
  after a restart.
- **Best-of-N candidate comparison is a sanctioned mechanism in any round and
  any tier** (§9.7): the skill may generate N complete candidate prompt sets
  (or N candidates for a weak shot), judge them comparatively against the
  score dimensions below, and select the winner. Candidate counts, scores,
  and the selection rationale are recorded per round in
  `loopReport.round_N.candidates[]` so selection is auditable. Default
  N ≤ 3 (`candidate_count` in skill config) to keep cost predictable.
- Each round returns scores (0–10): `evidence_accuracy`, `product_consistency`,
  `narrative_quality`, `dialogue_continuity`, `visual_feasibility`,
  `compliance_safety`, `prompt_completeness`, `length_compliance`. Scoring is
  the skill's judgment; TS only records and compares totals.
- **Best-version retention:** keep the highest-scoring valid version. A later
  round never replaces an earlier one if its total is lower, it introduces
  unsupported claims, drops the global block, breaks continuity, or fails
  length checks (deterministic disqualifiers — TS-checkable).
- Loop report persisted at `metadataJson.loopReport` (`round_1..3`, diffs
  summary, `selected_version`), surfaced in UI (§21.5).

---

## 17. Guardian presence policy (child-product safety)

### 17.1 Policy statement

> If the product is child-related AND a frame depicts a minor, that frame must
> also depict a supervising adult guardian. Frames that cannot satisfy this
> must not depict the minor. The uploaded adult character reference, when
> provided, is the guardian's identity anchor.

### 17.2 Activation

`childSubjectPolicy` is computed at plan time (facts in TS, wording in skill):

- `productChildRelated` = category ∈ child-related set (`mother_baby`,
  kids/child categories of the 21-value enum) OR minor-safety text signals —
  the same trigger family as `marketplaceAutoReviewPlanNeedsMinorSafetyLock`
  (`marketplaceAutoReviewService.ts:1357`, signal regex `:1306`).
- `childDepictionPlanned` = the skill's shot plan marks any shot as depicting a
  minor (`shots[].depicts_minor: boolean`, required output field for every
  shot).
- Guardian requirement active when both are true. The policy cannot be turned
  off by the user for child depiction; the user's alternatives are child-free
  framing (product-only / hands-only / adult-presenter-only shots).

Detailed rule text, allowed framings, and safe wording live in the skill's
`references/guardian-presence.md` (skill-first).

### 17.3 Four-layer enforcement (mirrors `characterPresenceMode`)

| Layer | Mechanism | Fail semantics |
|---|---|---|
| 1. Planner directive | `buildGuardianPresenceDirective(plan)` — appended beside the existing minor-safety clothing lock (`buildMinorSafetyClothingLock`, `:1395-1403`; injection sites `:9211,15145,15176,15333,15400`): "Any frame that shows the child using the product MUST also show a supervising adult guardian in the same frame…never show an unaccompanied minor using the product" | Prompt-side fail-closed: preflight blocker `guardian_directive_missing` when policy active and directive absent (§23.1) |
| 2. Skill rule | Phase D/F rules in skill body + `references/guardian-presence.md`; every `depicts_minor` shot must include the guardian in dialogue-consistent framing | Round 1/2 loop failure → revision |
| 3. Vision QA | Extend the per-frame QA JSON with `adultGuardianPresent: boolean` + `framesMissingGuardian: number[]` beside the existing `minorPresent` family (`visionQaMinorPresenceState` `:1666-1679`); new reason code **`guardian_presence_missing`** in the verdict normalizer (`normalizeShotFrameVisionQaDecision` `:1738-1801`) | **Fail-closed for acceptance**: unlike the fail-open creative checks (`:1765-1771`), when `minorPresent === true` and `adultGuardianPresent !== true`, the frame verdict is `repair`. `guardian_presence_missing` joins the publish-blocking set (`imageReasonCodeBlocksPublishSafety`, `:1650`) so repair-budget exhaustion can NOT accept-with-warnings past it |
| 4. Targeted repair | `buildGuardianPresenceRepairInstruction` — new entry in `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` (`:1443`) + presence-repair shape (`:4795-4806`): "add the supervising adult guardian [matching @Image(K+1)] into the frame OR reframe without the minor" | Bounded by per-unit repair budget; on exhaustion the unit fails (never ships an unaccompanied-minor frame) |

### 17.4 Interplay with existing character machinery (unchanged rules kept)

- "Never bind the uploaded presenter reference to a child" (`:4781,4720`) and
  the character-reference no-age-transform rule
  (`productReferenceStoryboardSkillRunner.ts:1028,1166`) remain in force — the
  uploaded reference is always the ADULT.
- `characterPresenceMode` (`every_frame`/`most_frames`) applies to the adult
  presenter across the 9 sequential frames with identical thresholds (9/9,
  ≥7/9 — `:4766-4783`), now counted across separate images instead of grid
  cells. Guardian presence is a per-frame conditional rule and is evaluated
  independently of (and in addition to) presence mode.
- Any minor depicted also inherits the clothing-safety lock and QA
  (`minor_safety_child_clothing_unverified`, `:1725`) unchanged.

### 17.5 UI

When `childSubjectPolicy` is active the panel shows an informational notice
(Thai primary): "สินค้านี้เกี่ยวกับเด็ก — ทุกเฟรมที่มีเด็กใช้งานสินค้า
ระบบจะใส่ผู้ปกครองอยู่ในฉากด้วยเสมอ คุณสามารถอัปโหลดรูปตัวละครผู้ใหญ่
เพื่อกำหนดหน้าตาผู้ปกครองได้" with the existing "อัปโหลด reference" flow as the
attach point (§21.4). No opt-out control is rendered.

### 17.6 Relationship to Feature 128 (Age-Aware Safety Policy)

Feature 128 governs the **user's** age (who may run generation). This section
governs **depicted persons** in generated content. They compose: prompts from
this mode still pass through the age-safe media enforcer
(`ageSafeMediaEnforcer.ts:32`) and all Feature 128 gates when those ship.
Neither replaces the other.

### 17.7 Shared adoption by the 3x3 mode

Under `marketplaceReviewEvidenceGuard` (§3.4) the guardian directive is also
injected into the 3x3 prompt path (beside the existing minor-safety clothing
lock at the same injection sites) and the grid vision-QA JSON gains
`adultGuardianPresent` + `framesMissingGuardian`, with
`guardian_presence_missing` publish-blocking for grid attempts exactly as in
§17.3. Sequential mode ships it first (Phase 3), but the 3x3 path may enable
it in production as soon as the shared tests pass — it does not wait for
sequential GA.

---

## 18. Generation pipeline (image_generation and beyond)

### 18.1 Image units

For `sequential_shot_storyboard`, `buildInitialImageUnits`
(`marketplaceAutoReviewService.ts:8459`) returns 9 units:

```text
unitId: "sequential-shot-01" … "sequential-shot-09"
role:   "sequential_shot_frame"
```

Each unit submits one provider task via the existing submit path —
`mediaGenerationService.generateImageAsync({ prompt, model, aspectRatio: "9:16",
resolution: "2K", numImages: 1, referenceImageUrls, extraParams: {
__origin_surface: "marketplace_auto_review", referenceImageManifest, … } })`
(`:18584-18626`) — polled via `getTask` (`:18820`). Units are independent: a
failed shot never blocks or regenerates the other 8. Unit progress (provider
task ids, attempt counters, QA envelopes) persists in run metadata exactly as
today's `directImageTasks` / `imageAttemptReviews` records, so background
advancement and service restarts resume incomplete units WITHOUT resubmitting
completed ones.

### 18.2 QA and repair (per unit)

- Per-frame vision QA reuses `ShotFrameVisionQaEnvelope` (`:12018`) with the
  QA prompt extended for: sequential story continuity vs the shot contract
  (reuses reason code `storyboard_continuity_mismatch`), multi-angle product
  fidelity (reuses `product_reference_mismatch`), guardian fields (§17.3), and
  the existing character/minor/ad-text checks, plus the assembly guard
  (`assemblyContentDetected` → reason code `assembly_content_unverified`,
  §11.5). The 3x3 grid-layout QA (`:18960-19240`) is NOT invoked for
  sequential units; the shared evidence-guard fields are added to that grid QA
  separately under its own flag (§3.4).
- Targeted repair reuses the directive machinery (`:1443,1479`) with per-unit
  budget `maxRepairAttemptsPerUnit` (`:2580-2591`) — default 2 repairs/unit, as
  today.
- **Candidate policy:** the 3-candidate best-of rule
  (`MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW = 3`, `:653`) is
  grid-mode-specific and does NOT apply per unit (9 shots × 3 candidates would
  triple cost for little gain — QA+repair per unit replaces best-of). A
  `qualityMode: high` run may generate 2 candidates for the hook and reveal
  shots (units 1–2) and pick by the existing score breakdown (`:6885`); default
  is 1 attempt + repairs.
- Stage completion gate: all 9 units `pass` (or accepted-with-warnings where
  no publish-blocking code is present — guardian and minor-safety codes always
  block, §17.3). The existing repair-budget-exhaustion acceptance flow
  (`:20190-20310`) applies per unit with that constraint.

### 18.3 Storyboard review handoff

`createStoryboardReview` (`:17402`) is reused with
`storyboardFrameUrls = [unit1.url … unit9.url]`; `splitStoryboardGrid` is
skipped. Clip metadata gains `frameStrategy: "sequential_shot_storyboard"`,
per-shot `depicts_minor`, `guardianRequired`, and claim-trace summary (§19.2).
Downstream surfaces (Storyboard Review page, Video Editor projection, render,
Library, provenance metadata) are unchanged.

### 18.4 Per-shot regeneration

New additive tRPC mutation `regenerateAutoReviewSequentialShot({ runId,
shotId })` — re-runs one unit (skill single-shot prompt refresh optional →
image job → QA/repair), following the per-shot mutation pattern of VD
(`generateStartFrameImage`, `repairShotImage`) and the existing manual
selection procedure shape
(`selectAutoReviewImageAttemptForStoryboardReview`,
`routers/marketplaceCapture.ts:1171`). Re-validates reference mapping at
submit (§8.5).

User edits from the per-shot editor (§21.5) — dialogue, image prompt, video
prompt — are stored as
`metadataJson.sequentialStoryboard.shotOverrides[shotId]` and take precedence
at regeneration after passing the SAME deterministic preflight (budgets,
global-block marker, price backstop, guardian directive, mapping validator).
An edit that fails preflight is rejected with the specific blocker id and Thai
message; it is never silently rewritten.

---

## 19. Data model

### 19.1 No migration required

- `marketplace_auto_review_runs.frameStrategy` is `varchar(40)`
  (`drizzle/schema.ts:19075`) — the new 26-char value fits.
- All new state lives in existing JSONB columns (`metadataJson`, `resultJson`,
  stage `outputJson`) and `marketplace_auto_review_artifacts`
  (`artifactKind: "sequential_shot_frame"` — varchar, additive).
- Per the Database Safety Protocol this is a Low-risk change (no DDL); row
  counts unaffected. Any future promotion of evidence profiles to a dedicated
  table is out of scope (§28).

### 19.2 `metadataJson` additions (run-scoped)

```json
{
  "sequentialStoryboard": {
    "skillVersion": "1.0.0",
    "evidenceProfile": { },
    "claimWhitelist": [ ],
    "conflicts": [ ],
    "reviewStrategy": { "hook_type": "", "narrative_pattern": "", "selected_features": [], "excluded_features": [] },
    "childSubjectPolicy": { "productChildRelated": true, "childDepictionPlanned": true, "guardianReferenceRef": "…" },
    "globalContinuity": { "product_identity": "", "character_identity": "", "wardrobe": "", "environment": "", "lighting": "", "video_global_block": "" },
    "shots": [
      {
        "shot_id": 1, "purpose": "", "duration_seconds": 5,
        "demonstration_type": "usage_demo",
        "depicts_minor": false, "guardian_required": false,
        "transition_from_previous": "", "visual_summary": "",
        "dialogue": "", "estimated_speech_seconds": 0,
        "start_frame_image_prompt": "", "image_prompt_character_count": 0,
        "video_prompt": "", "video_prompt_character_count": 0,
        "claim_trace": [ { "text": "", "support": "text_verified" } ],
        "qc": { "evidence_accuracy": 0, "continuity": 0, "compliance": 0, "length_valid": true, "status": "pass" }
      }
    ],
    "loopReport": { "round_1": { "candidates": [] }, "round_2": {}, "round_3": {}, "selected_version": 3 },
    "shotOverrides": { "3": { "dialogue": "…", "start_frame_image_prompt": "…", "video_prompt": "…", "editedAt": "…" } },
    "finalQc": {
      "all_claims_supported": true, "all_shots_under_10_seconds": true,
      "hook_within_3_seconds": true, "price_absent": true, "overclaims_absent": true,
      "all_image_prompts_within_budget": true, "all_video_prompts_within_budget": true,
      "global_block_present_in_every_video_prompt": true,
      "guardian_policy_satisfied": true
    },
    "referenceManifest": [ { "index": 1, "role": "primary_product", "angleLabel": "front", "url": "…" } ]
  }
}
```

This is simultaneously the skill's `output.schema.json` shape (Phase K) —
claim traces are QC-internal and are never sent to image/video providers.

---

## 20. API surface

### 20.1 Shared plan schemas (`apps/web/shared/hyperframes/autoPlan.ts`)

- `frameStrategy` enum member (§7.1).
- New optional override fields (additive, same pattern as
  `characterPresenceMode` `:71-73,182-184,213`):
  - `confirmedAttributes: Record<string, string> | undefined`
  - `forbiddenClaims: string[] | undefined`
  - `targetAudience: string | undefined` (§12.6)
  - `userRequirements: string | undefined` (§12.6)
  - `sequentialImagePromptMaxChars` (bounded 1000–4000, default 4000; admin/
    advanced only)
- Existing creative preset selections, `reviewTone`, `videoStructureMode`, and
  `motionDirection` override fields are REUSED as-is for this mode (§12.6,
  §14.6) — no parallel fields are added for them.

### 20.2 Router / runtime API (additive)

- `startAutoReview` (`routers/marketplaceCapture.ts:667`): enum member;
  `referenceAnchors.productAngleImages` (§8.2).
- `getAutoStoryboardReviewPlan` (`:829` → `hyperframesRuntimeApiService.ts:1110`):
  when the flag is on and strategy is sequential, the plan output adds optional
  `evidencePreview` (`needsConfirmation[]`, `verifiedHighlights[]`,
  `childSubjectPolicy`) and `referenceCapacity` (`modelCap`,
  `attachedAngles`, `trimmedAngles`) — all optional fields; existing clients
  are unaffected.
- `startAutoStoryboardReview` (`:854` → API `:1309-1423`): no signature change;
  plan-hash guard already covers the new defaults (`expectedPlanHash`
  PRECONDITION_FAILED on stale plan).
- NEW `regenerateAutoReviewSequentialShot({ runId, shotId })` (§18.4).
- All new inputs validated with zod; router tests stub JWT_SECRET via
  `vi.hoisted` per repo convention.

---

## 21. UI requirements

All copy bilingual via `hyperframesUiCopy.ts`; reuse existing panel patterns
(repo rule: copy the equivalent working UI pattern before redesigning).

### 21.1 Strategy selection

`AutoStoryboardAdvancedOverrides.tsx` `frameStrategyOptions` (`:276-285`) gains:

- Label (TH): "9 ภาพต่อเนื่อง (Sequential) — 1 prompt ต่อ 1 ภาพ"
- Description (TH): "สร้างภาพแยก 9 ภาพเป็นเรื่องเดียวต่อเนื่อง เน้นสินค้าตรงทุกมุม"
- Hidden entirely when the tenant flag is off.

The Auto panel summary card shows the active strategy so the choice is visible
without opening advanced overrides.

### 21.2 Multi-angle product references

Extend the existing product image attachment surface (Media Panel → Product
tab + `Product Images` drag/upload, Feature 118 §Media Panel):

- Angle chips on each attached product image (front/back/side/top/base/detail/
  package/scale/other) — default `other`; primary anchor stays the existing
  `productImageUrl` selection.
- Capacity meter: "ใช้ได้ {n}/{modelCap} ภาพอ้างอิงต่อภาพ (โมเดล {model})" with
  a warning chip listing angles that will be trimmed (§8.3 step 4).

### 21.3 Evidence & conflict review (collapsible section in the Auto panel)

- Verified highlights (visual/text) — read-only chips.
- `needsConfirmation` items with ยืนยัน / ตัดออก actions → `confirmedAttributes`
  override; unresolved items show "จะไม่ถูกใช้ในรีวิว".
- Free-text "คำที่ห้ามใช้" → `forbiddenClaims`.

### 21.4 Guardian notice

§17.5 notice, rendered only when `childSubjectPolicy` is active; links the
existing "อัปโหลด reference" character flow as the guardian attach point. The
"การปรากฏของบุคคลในภาพ 3x3" label is generalized for sequential mode to
"การปรากฏของบุคคลในภาพ" (same field, per-frame semantics — §17.4).

### 21.5 Per-shot review & loop report

Storyboard Review page (existing clip cards) shows per shot: dialogue, both
prompts with char counts, claim sources, QC status, guardian badge when
applicable, and a "สร้างภาพนี้ใหม่" action (§18.4). Prompt and dialogue fields
are editable; saving runs the deterministic preflight and shows the specific
blocker on failure (§18.4). A "Loop Report" section summarizes the three
rounds (claims removed, dialogue rewritten, prompts compressed, selected
version).

### 21.6 Existing pickers apply unchanged

The shipped "อารมณ์และโครงเรื่อง" tone + story-structure pickers, the
motion-direction text, character/presenter modes, and model selectors
(rendered by `AutoStoryboardAdvancedOverrides.tsx` /
`AutoStoryboardStoryMotionFields`) apply to sequential mode without
relocation (§12.6, §14.6). Two new optional free-text fields:
"กลุ่มเป้าหมาย (ไม่บังคับ)" → `targetAudience` and
"ความต้องการเพิ่มเติม (ไม่บังคับ)" → `userRequirements`.

---

## 22. Credits and estimates

- Plan-card estimate (`buildHyperframesCreditEstimate`,
  `hyperframesFeatureAccessService.ts:137-227`) gains an `imageJobCount` input:
  9 for sequential vs 1 for grid; `autoPlanWorkerComplexityMultiplier`
  (`hyperframesAutoPlanService.ts:167-182`) adds a sequential factor (proposed
  1.10, tuned in rollout) alongside the existing start_stop 1.15.
- Actual generation spend is unchanged mechanically: per-task reserve/reconcile
  through `mediaGenerationService` and per-stage LLM credit reconciliation
  (`reconcileMarketplaceLlmCredits`, `marketplaceAutoReviewService.ts:19116`).
  Expected profile vs 3x3: ~9× image tasks (smaller per-task pixel budget than
  the 2K grid), +1 skill planning call with vision inputs, +3 loop rounds
  amortized inside the planning call, + per-unit QA calls (9× small vision QA
  vs 3× grid QA).
- The Estimate card must reflect the higher image-job count before the user
  starts (no surprise billing).
- Tier 2 (§9.8) does not change billing surfaces: every LLM call the Agents
  SDK workflow makes MUST route through the platform LLM gateway with the
  run's credit context (the Feature 117 rule), so credits, provider usage
  logs, and audit trails are identical across tiers. Direct provider calls
  from skill code are prohibited. Candidate comparison (§9.7) multiplies LLM
  spend by ≤ `candidate_count`; the bound exists so planning cost stays
  predictable.

---

## 23. Validation rules

### 23.1 Hard failures (block generation or the affected stage)

1. No primary product reference resolvable.
2. Required references exceed the image model's reference cap (§8.3 step 5).
3. Skill output missing shots or prompts (`sequential_prompt_set_incomplete` —
   fewer than 9 shots / missing either prompt on any shot) after bounded
   retries and fallback is also impossible.
4. Any final image prompt over budget after allowed LLM rewrites
   (`prompt_too_long_for_image_provider` — existing blocker id).
5. Any final video prompt over 2,000 chars after allowed LLM rewrites.
6. Mandatory global video block missing (`video_global_block_missing`).
7. Guardian policy active but directive absent from an affected prompt
   (`guardian_directive_missing`); or a completed frame with `minorPresent`
   and no guardian after repair budget (`guardian_presence_missing` — publish
   blocking, §17.3).
8. Price content detected in dialogue or prompts (`price_claim_detected`)
   after rewrite attempts.
9. A shot exceeding 10 seconds.
10. Reference-index mapping mismatch after corrective retry (§8.5).
11. Minor-safety clothing lock missing when required
    (`minor_safety_clothing_lock_missing` — existing blocker).
12. Attached product references appear to show DIFFERENT product models and
    the conflict is unresolved by role assignment/confirmation
    (`product_reference_model_conflict` — skill Phase A detection; the skill
    cannot determine which product is the subject).
13. Selected image model accepts no reference images at all — product
    identity lock is impossible (special case of item 2).
14. A medical, therapeutic, or safety-guarantee claim without explicit
    text-verified/user-confirmed evidence surviving to final output
    (deterministic backstop for §10.4; normally removed by loop rounds 1/3).
15. A prompt stages assembly/disassembly or internal components while
    `evidenceProfile.assembly_documented` is false
    (`assembly_demo_unverified` — §11.5; applies to BOTH modes when the
    evidence-guard flag is on).

### 23.2 Warnings (do not block; surfaced in plan/run)

Only one product angle available; rear structure not visible; material not
visually verifiable; ambiguous category; a described mechanism not visible in
any reference; assembly documentation present but PARTIAL (only the
documented steps may be depicted — §11.5); a load-capacity/weight figure
present in text without supporting documentation (conditional wording only);
no character reference
while presence mode expects one; a `user_requirements` feature excluded as
unverifiable; per-shot duration fitted to a video model's fixed duration;
angles trimmed by model capacity.

---

## 24. Security, safety, and policy layering

- Prompts pass the age-safe media enforcer (`ageSafeMediaEnforcer.ts:32`)
  before any provider call, as today.
- No secrets in prompts or skill inputs (repo secret-exposure rules apply; the
  skill receives URLs and product facts only).
- Evidence profile contains only captured product/marketplace data already
  stored in `marketplaceProducts` — no new PII class.
- Guardian policy is enforcement-layered (§17.3) with publish-blocking QA; the
  degraded deterministic fallback (§9.5) preserves all safety locks verbatim.
- SSRF/URL rules for reference resolution unchanged
  (`resolveProductReferenceStoryboardReferenceImageUrl` + storage abstraction).
- Captured marketplace text (title/description/specs) is UNTRUSTED content:
  the skill contract instructs the model to treat product data strictly as
  data — instructions embedded in product text must never override the
  contract, alter reference bindings, or lift safety locks. Deterministic
  preflight (budgets, global-block marker, guardian directive, price backstop,
  mapping validator) runs regardless of what the product text says. The Tier-1
  skill runtime has no tool access at all.
- Tier-2 executable skills (§9.8) are repo-vetted code only, sandbox-mounted
  per the Feature 106 loading model (`SandboxAgent` + Skills capability), with
  no filesystem/network reach beyond the sanctioned gateway endpoints and no
  path for untrusted product text to trigger tools or handoffs. Runtime policy
  beats prose (Feature 106 locked decision #9): the security boundary is
  bundle metadata + script invocation policy + path restrictions, not wording
  in `SKILL.md`.

---

## 25. Observability

Audit events (existing JSONL audit log + run stage attempts/evidence tables):

- `sequential_skill_plan_round` (round index, scores, duration, model).
- `sequential_prompt_degraded_fallback` (§9.5).
- `final_image_prompt_over_provider_budget` /
  `final_video_prompt_over_provider_budget` (existing family, new prompt_kind).
- `guardian_presence_missing` / `guardian_directive_missing` occurrences with
  shot id (never with image content).
- Reference capacity trims (`sequential_reference_angles_trimmed`).
- Per-unit QA verdict distribution — reuses `imageAttemptReviews[]` metadata
  and stage-attempt evidence rows (`marketplace_auto_review_stage_attempts`).
- `assembly_content_unverified` / `assembly_demo_unverified` occurrences per
  mode (measures how often the assembly guard fires — §11.5).
- **Mode-comparison quality metrics (feed the §26 GA gate):** per-mode rates
  of `product_reference_mismatch`, `storyboard_continuity_mismatch`, repair
  attempts per accepted frame, publish-safety blocks, and average
  `qualityScore` from `buildImageAttemptScoreBreakdown` (`:6885`) — recorded
  for BOTH 3x3 and sequential runs so the quality-uplift claim is measured,
  not assumed.

Debugging follows the mandatory LLM/media protocol: all skill calls and
provider submissions carry `traceId` into `provider_usage_log` and the JSONL
audit files.

---

## 26. Feature flags and rollout

| Flag | Scope | Default | Gates |
|---|---|---|---|
| `marketplaceSequentialStoryboard` | tenant | off | strategy visibility + server-side start rejection (§7.3) |
| `marketplaceReviewEvidenceGuard` | tenant | off | SHARED guards (§3.4) for BOTH modes: demonstration/assembly guard (§11.5), guardian presence (§17.7), claim-whitelist + conflict-exclusion injection (§10) |

The two flags are independent: a tenant may enable the evidence guard for its
existing 3x3 flow without ever enabling the sequential strategy, and vice
versa.

### Phases

1. **Foundation (dark).** Enum + zod + plan pass-through + skill bundle +
   runner + evidence profile generation. Flag off everywhere; snapshot tests
   prove existing strategies byte-identical.
2. **Sequential image pipeline.** 9 units, multi-angle resolver + capacity
   assertion + mapping validator, per-unit QA/repair, storyboard review
   handoff, per-shot regeneration. Internal tenant only.
3. **Evidence-guard package (SHARED).** Guardian policy end-to-end (directive,
   QA fields, repair, publish-blocking, UI notice) + demonstration/assembly
   guard + claim-whitelist/conflict injection, wired for BOTH modes behind
   `marketplaceReviewEvidenceGuard`. Verified with child-product AND
   furniture fixtures (the invented-assembly case). The 3x3 path may enable
   this flag in production as soon as its tests pass — independent of
   sequential GA (§3.4).
4. **Full-video per-shot.** Start-frame-as-reference video jobs, global block
   preflight, per-shot durations, audio strategies.
5. **Evidence review UI + loop report + GA.** Enable per tenant; monitor QA
   pass rates and credit profiles; then default-on for flagged tenants.
   **GA quality gate:** over the pilot window, sequential runs must show a
   measurably LOWER `product_reference_mismatch` and repair-per-frame rate
   and a HIGHER average `qualityScore` than the tenant's 3x3 baseline on the
   §25 mode-comparison metrics, with zero guardian/minor publish-safety
   regressions. If the uplift does not materialize, sequential GA is blocked —
   but the evidence-guard package still ships to 3x3 (the shared improvements
   are not hostage to the new mode).
6. **Executable skill runtime upgrade (optional, assessed).** Package the
   skill as a Feature 106/107 native Agents-Python bundle and run it on the
   python-backend runtime (Tier 2, §9.8). Adopt for production ONLY if the
   §27 tier-parity eval shows measurable quality uplift at acceptable latency
   and cost; otherwise stay on Tier 1. The switch is per-skill
   (`execution_mode: agents_python`), not a tenant flag; rollback = set the
   skill back to `llm-only`.

Rollback: each flag off restores its pre-feature behavior instantly (no
migration to reverse; runs already started continue under their recorded
strategy and guard configuration).

---

## 27. Testing plan

Patterned on the shipped test families (real-file skill tests, service tests
with test exports, router tests with `vi.hoisted` JWT stubs). Vitest from
`apps/web`.

### Unit / service

- `productReviewSequentialStoryboardSkill.test.ts` — loads
  `skill.md`/`SKILL.md` from disk (no mocks — the
  `reviewerSkillsUpgrade.test.ts:6-70` pattern), asserts frontmatter policy,
  twins identical, schemas parse, and body contains phase/global-block/guardian
  rule markers (guards the taught-not-wired failure class:
  memory `project_vd_skill_taught_not_wired`).
- Runner tests: sync/load/throw paths, input-schema hard-fail before spend,
  lenient JSON retry integration, degraded fallback emission.
- `referenceIndexMap.test.ts` — mismatch detection, leniency on silent
  prompts, corrective-retry-then-throw.
- Multi-angle resolver: ordering, dedupe, trim-from-end, capacity
  PRECONDITION_FAILED; proof that `approvedProductReferenceUrls` (3x3 path) is
  untouched (single-anchor throw still fires).
- Guardian: directive builder (active/inactive), QA normalizer fail-closed on
  `minorPresent && !adultGuardianPresent`, `guardian_presence_missing` in the
  publish-blocking set, repair directive text, accept-with-warnings refusal.
- Prompt governance: budget constants, optimizer invocation over budget, "no
  new `slice()` call sites against final prompts" guard test, global-block
  marker preflight, price-pattern backstop.
- Loop: 3 rounds recorded, best-version retention including the deterministic
  disqualifiers, loopReport persistence.
- Demonstration guard: plan fixture with undocumented assembly → round-1
  pivot to benefit/problem-solution; preflight blocker
  `assembly_demo_unverified`; QA `assembly_content_unverified` repair path;
  `parts_diagram`/`package` references excluded from generation attachments;
  shared directive present in `build3x3StoryboardPrompt` AND
  `buildShotFramePrompt` output when `marketplaceReviewEvidenceGuard` is on,
  absent when off.
- Estimate: `imageJobCount = 9` reflected; complexity multiplier.
- In-skill QA evidence (§9.7): runner rejects a skill return that lacks
  loop-round/candidate evidence in `loopReport`; candidate scores recorded
  per round; `candidate_count` ceiling respected.
- Tier parity + eval harness (§9.8): contract tests assert BOTH tiers accept
  the same `input.schema.json` and emit the same §19.2 output schema; a
  fixture-set eval compares tiers on §16.4 scores + §25 metrics and gates
  Tier-2 adoption; Tier-2 tests assert per-round checkpoints persisted,
  gateway-routed LLM calls only (no direct provider calls from skill code),
  and a failing verification gate blocks finalize (Feature 106 locked
  decision #6).

### Isolation snapshots (Phase 1 gate)

- With BOTH flags off: `getAutoStoryboardReviewPlan` output,
  `build3x3StoryboardPrompt` output (via
  `buildMarketplaceAutoReview3x3StoryboardPromptForTest`, `:15404`), and
  `buildShotFramePrompt` output byte-identical to committed snapshots for
  fixed fixtures.
- With ONLY `marketplaceReviewEvidenceGuard` on: 3x3 prompts differ from the
  baseline snapshots ONLY by the enumerated shared directive lines (assembly
  guard, guardian directive, claim-whitelist/conflict exclusions) — asserted
  by a diff-shape test, so no unrelated 3x3 behavior can piggyback on the
  guard flag.

### Router / integration

- zod acceptance/rejection of the new enum + `productAngleImages` + overrides;
  flag-off `PRECONDITION_FAILED`; plan-hash staleness; `regenerate…SequentialShot`
  happy path and unit isolation (other 8 units untouched).

### Real-LLM gate (pre-GA, manual/CI-tagged)

- One full sequential run against a live model for a child-product fixture
  (เก้าอี้เด็ก with 4 angle images + adult reference): asserts 9 frames, guardian
  present in every minor frame, no price tokens, prompts within budgets, global
  block present ×9 — the "prove with real-LLM gate" rule from memory
  `project_vd_skill_taught_not_wired`.

### Acceptance criteria

1. Skill classifies the product before generating content; category recorded.
2. Every dialogue/visual claim traces to the evidence profile; unsupported and
   conflicting claims absent from output.
3. Nine-shot narrative is category-appropriate; hook completes ≤3s; each shot
   ≤10s; dialogue continuous 1→9 in Thai.
4. Every shot has one start-frame image prompt (≤ effective budget, default
   4,000) and one self-contained video prompt (≤2,000) containing the mandatory
   global block.
5. Over-length prompts were LLM-rewritten; no mechanical truncation of any
   final prompt (audit trail proves rewrite events).
6. Multi-angle references attach in manifest order on every image job within
   the model cap; capacity violations fail before credit reservation;
   reference-index mapping mismatches never reach a provider.
7. No completed run contains a frame with a minor using a child-related
   product without an adult guardian in-frame; `guardian_presence_missing` is
   publish-blocking.
8. No price and no prohibited claim class in any output.
9. Three loop rounds recorded with scores; highest-scoring valid version
   retained; loop report visible in UI.
10. A single shot can be regenerated independently.
11. Structured output (§19.2) persisted and editable via UI fields.
12. With the tenant flag off, all existing strategies behave byte-identically
    (snapshot suite green) and the new strategy is rejected server-side.
13. Tone / story-structure / motion-direction / target-audience /
    user-requirements inputs are honored by the skill output, and claim-safety
    rules override tone in every conflict.
14. Estimated speech seconds are recorded per shot and never exceed the shot
    duration in the selected version.
15. Attached references showing a different product model surface
    `product_reference_model_conflict` and block generation until resolved.
16. Edited per-shot prompts are preflight-revalidated and used by
    regeneration (§18.4); a failing edit is rejected with its blocker id.
17. No run (in EITHER mode, with the evidence guard on) contains
    assembly/disassembly or internal-component content without documented
    assembly evidence; undocumented assembly beats are replaced by
    benefit/problem-solution framing on the fully assembled product (§11.5).
18. The shared evidence-guard package activates for the 3x3 mode with only
    `marketplaceReviewEvidenceGuard` on (no sequential dependency), and §25
    mode-comparison metrics are recorded for both modes so the §26 GA quality
    gate is measurable.
19. The skill never returns unverified prompts: every return carries
    loop-round/candidate evidence in `loopReport` and a passing `finalQc`
    (§9.7); in Tier 2 the bundle verification gate additionally passed before
    return. Returns lacking this evidence are rejected by the runner.
20. Tier 2 (executable Agents SDK runtime) is adopted only after the
    tier-parity eval shows measurable uplift over Tier 1 at acceptable
    latency/cost (§9.8, §26 Phase 6); both tiers satisfy identical I/O
    schemas and the TS deterministic preflight backstop.
21. Verification commands pass:
    `npm --prefix apps/web run test -- <new test files>` and
    `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
    (baseline: pre-existing tsc errors only).

---

## 28. Future extensions (out of scope for v1)

- `auto` frame-strategy preferring sequential for flagged tenants.
- Configurable shot count (e.g. 5–12) and per-platform duration presets.
- Platform-specific compliance profiles; multilingual dialogue.
- TTS-based speech-duration estimation replacing the char-rate heuristic.
- Visual-similarity QC between generated frames and product references
  (automated angle-fidelity scoring); product part-count/color checks.
- Automatic 3×3 contact-sheet artifact generated FROM the 9 approved frames
  (inverse of today's split — for thumbnail/share surfaces).
- Editable price-overlay slot outside the evergreen spoken script.
- Reusable character identity packs; catalog reuse of stored evidence
  profiles.
- Migration of this mode onto the Feature 117 Agents SDK stage runtime.

---

## 29. Source references

- Feature specs: `specs/feature/113-marketplace-capture-extension/spec.md`,
  `117-production-director-agents-sdk-auto-storyboard-video/spec.md`,
  `118-marketplace-auto-review-create-storyboard-video-review-auto/spec.md`
  (implemented snapshot this feature extends),
  `119-hyperframes-marketplace-auto-review-render-adapter/spec.md`,
  `122-video-segment-planner-multi-shot-storyboard-review/spec.md`,
  `128-age-aware-safety-policy/spec.md`,
  `131-vertical-drama-series-storyboard-video-flow/spec.md`,
  `132-vertical-drama-story-character-quality-engine/spec.md`,
  `134-character-portrait-candidate-batch/` (no-migration precedent),
  `135-hermes-grok-media-worker/spec.md` (flag/rollout template),
  `101-openai-agents-sdk-chat-team-orchestration/spec.md`,
  `106-openai-agents-python-native-skill-system/spec.md` (locked decisions:
  bundle contract, sandbox loading, verification-before-finalize),
  `107-openai-agents-python-subagent-skill-runtime/spec.md` (§8 bundle shape),
  `130-hybrid-flow-openai-agents-sdk-runtime/spec.md` (Tier-2 runtime prior
  art).
- Key implementation files (verified 2026-07-21):
  `apps/web/server/services/marketplaceAutoReviewService.ts`,
  `apps/web/server/services/productReferenceStoryboardSkillRunner.ts`,
  `apps/web/server/services/productReferenceStoryboardCategoryRules.ts`,
  `apps/web/server/services/mediaGenerationService.ts`,
  `apps/web/server/services/modelRegistry.ts`,
  `apps/web/server/services/hyperframesAutoPlanService.ts`,
  `apps/web/server/services/hyperframesFeatureAccessService.ts`,
  `apps/web/server/services/videoProjectQualityLoop.ts`,
  `apps/web/server/services/ageSafeMediaEnforcer.ts`,
  `apps/web/server/routers/marketplaceCapture.ts`,
  `apps/web/shared/hyperframes/autoPlan.ts`,
  `apps/web/shared/verticalDramaSeries/characterIdentityMap.ts`,
  `apps/web/server/services/verticalDramaStartFrameGeneration.ts`,
  `apps/web/server/routers/verticalDramaEpisodes.ts`,
  `apps/web/skills/product-reference-storyboard/`,
  `apps/web/skills/product-video-motion-prompt/`,
  `apps/web/skills/product-reference-storyboard-prompt-optimizer/`,
  `python-backend/requirements.txt` (`openai-agents==0.17.4`, line 23).
- External: [openai/openai-agents-python](https://github.com/openai/openai-agents-python)
  (Tier-2 skill runtime SDK, §9.8).
- Original request + adapted source document: `request.md` in this folder.
