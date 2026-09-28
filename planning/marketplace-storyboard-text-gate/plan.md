# Marketplace Auto Review — mandatory TEXT storyboard review gate (ชั้น 0)

Date: 2026-07-23 · Status: APPROVED by user (mandatory for ALL runs) · Owner: conductor session

## Implementation amendment — staged Job Workbench (2026-07-26)

The legacy text gate described below remains the compatibility path for existing
runs. New Marketplace Auto Review jobs use Feature 141's staged Job Workbench
contract and must not run as an uninterruptible end-to-end job.

### Surface boundaries

- `Product Detail` contains product facts, product images, selected product/scope,
  job history, and a link to create/resume a job. It does not host storyboard
  review controls or provider execution controls.
- `Job Setup` (`/marketplace/auto-review/new/:productId`) receives the selected
  product/scope and creates a durable staged run.
- `Job Workbench` (`/marketplace/auto-review/:runId`) is the only execution/review
  surface. It persists the current checkpoint, pauses after every checkpoint,
  and exposes approve, reject, edit, retry, refresh, and stop/cancel actions.
- `Storyboard Review` is the downstream creative review/editor surface. It links
  back to the same Job Workbench when a durable checkpoint or shot needs repair;
  it never starts a hidden second run. Its paid `Render Final Composite` path
  also fails closed until the staged run's `final_assembly` checkpoint is
  explicitly approved/consumed in Job Workbench.

### Job history navigator

The Job Setup and Job Workbench surfaces must use a persistent left-side job
navigator, following the same interaction pattern as Storyboard Review's
project list:

- list every Auto Review run belonging to the selected product, newest first;
- show a stable job label, run date, staged/legacy type, current checkpoint, and
  a human-readable status for each run;
- highlight the currently open run and open any historical run without losing
  its durable checkpoint state;
- provide `สร้าง Job Review ใหม่` as a separate action, not as an implicit
  resume of the newest run;
- keep Product Detail focused on product facts and references; it links to the
  job area but does not become the job-history workspace;
- on narrow screens, collapse the navigator into a selectable job drawer.

An existing staged run held at `blocked_needs_user` is shown as `รอตรวจ/ยืนยัน`
and must not be described as an actively generating job. Opening `/new` only
loads the job list and configuration; it does not silently create, resume, or
approve a run.

### Job-scoped product reference selection

Job Setup must include the product-reference picker in the new workflow surface,
not leave it hidden in Product Detail. The picker shows every image attached to
the product, marks the selected Product Anchor, and—when sequential storyboard
is active—allows the user to select/deselect supporting angles and optionally
label each angle. The selection is job-scoped and is included in the same
reference-anchor payload used by plan preview and run start; it never mutates
the product's stored image set.

### Mandatory checkpoint sequence

Each run advances only after the user approves the current checkpoint:

`story_plan` → per-shot `image_prompt` → image provider → per-shot
`image_result` → per-shot `video_prompt` → video provider → per-shot
`video_result` → optional `audio_plan`/TTS → `final_assembly` → render/final video.

The provider guard rejects missing, stale, rejected, superseded, consumed, or
hash-mismatched approvals before reserving credits. A generated result also
pauses for inspection: an image or video result must be explicitly accepted or
rejected before the next dependent stage/shot proceeds.

### Shot-local repair and credit safety

- Story synopsis/dialogue edits create a new revision. A run-level story edit
  resets all downstream work; a shot-level story/dialogue edit resets only that
  shot and any audio/final output that depends on its dialogue.
- Image prompt/result repair invalidates only that shot's image, video prompt,
  video result, and final assembly. Other accepted shots remain intact.
- Video prompt/result repair invalidates only that shot's video and final
  assembly. It never regenerates the image or unrelated shots.
- Audio and final-assembly edits supersede only their own downstream artifact.
- Retry is never automatic after a provider error or browser timeout. The user
  must inspect the correction state and explicitly retry the affected unit.
- `consumed` records the paid operation. Repair creates a new revision and a new
  idempotent operation; it does not silently replay or charge unrelated units.
- Stop/cancel is terminal for the run, prevents queued advancement, requests
  provider cancellation where possible, and reconciles refundable reservations,
  including staged image/video/audio tasks stored in `stagedPipeline.tasks`.
  Completed staged artifacts are preserved and are never refunded as if they
  were still provider work in flight.

### Completion rule

No run may report completed while any required story, shot prompt, image result,
video prompt, video result, audio, final assembly, or finalization proof is
awaiting/rejected/stale. Every checkpoint state survives reload and can be
repaired from the same run until the final video is accepted by the pipeline.

## Problem statement (user-reported, verbatim intent)

Images are generated straight from an LLM-authored plan the user never sees. When the plan is
wrong, the user pays for a full image set (9–27 images) to discover text-level mistakes that a
10-second read would have caught:
- wrong product facts (material พลาสติก described/rendered as ผ้า, wrong properties)
- words that must not be used (claims, superlatives)
- dialogue/voiceover that does not match the selected tone (ตลกขำ selected → flat descriptive
  script came out)
- storytelling structure ignored (Hook→Problem selected → no Problem anywhere; the script just
  says "สินค้าคุณภาพดี แข็งแรง" which solves nothing)

User decision (2026-07-23): the gate is **MANDATORY for every run** — no opt-out — because
"สินค้าส่วนใหญ่คาดเดาไม่ถูกว่าระบบจะบรรยายอะไรมา ส่วนใหญ่จะใช้ไม่ได้ทุกคำ".

## What already exists (verified in code)

- The TEXT plan is authored before any image: `storyboardGuide`, `voiceoverScript`,
  `productDetail` (marketplaceAutoReviewService.ts:912-926), and for sequential runs the
  per-shot contracts `sequentialStoryboard.shots[]` (title / visual_summary /
  start_frame_image_prompt / video_prompt / dialogue / depicts_minor …).
- Pause-before-spend states already exist in the run lifecycle: `awaiting_credit_authorization`,
  `blocked_before_image_provider_submit`, `blocked_needs_user`.
- The original gap was closed by the backend/UI work recorded below: the current gate uses
  `statusDetail.state=awaiting_plan_review` plus `metadataJson.planReview` before image spend.
  Feature 141 is a separate staged-v2 architecture and must not be inferred from this
  legacy gate. New jobs enter the dedicated Job Setup/Job Workbench flow described above.

## Design (smallest correct shape)

1. New plan-review detail state `awaiting_plan_review`, entered after the prompt_plan stage
   completes and BEFORE the first image credit reservation. The run remains `running`; the
   state is carried by `statusDetail.state` and `metadataJson.planReview`. Mandatory: every
   run stops here.
2. Storyboard Review page (or the product page run card) renders the TEXT plan for review:
   - for sequential runs, a per-shot table (1–9) shows shot title, visual summary,
     บทพูด/voiceover line, and image-prompt summary; productDetail (facts lock) and the selected
     tone/structure settings appear SIDE BY SIDE so mismatch is visible instantly.
   - the shipped legacy editor supports inline dialogue editing only. Visual-summary changes
     are requested through the whole-plan redraft notes action; they are not silently written
     through the dialogue mutation.
   - actions: [ยืนยัน สร้างภาพ] → resumes the run into image generation;
     [ให้ AI ร่างใหม่] → re-runs the existing text authoring path (concept_story + prompt_plan,
     and the sequential per-shot pack where applicable; text cost only, no image credits);
     [ยกเลิก] → cancel run, zero image spend.
3. Resume path reuses the existing background stage-advancement (same as
   `awaiting_credit_authorization` handling) — no new scheduler concept.
4. Estimate shown at the gate for sequential runs: first-pass N images + worst-case N × rounds
   (reuse the quality-mode estimate copy shipped in 7c308dce2/4f4f5932a). It is intentionally
   omitted for legacy 3x3/start-stop runs until each strategy has an authoritative estimator.

## Scope boundary and compatibility with Feature 141

This plan documents the mandatory safety gate wired into the legacy Marketplace Auto Review
stage machine and the boundary to Feature 141's staged pipeline. The amendment above is the
authoritative product/workflow contract for the implemented new Job Workbench path.

| Flow | Gate behavior in this plan | Feature 141 relationship |
|---|---|---|
| Legacy 3x3 / start-stop | Gate is mandatory; the current projection shows aggregate text and selected settings. No honest per-shot table or credit estimate is claimed. | Remains legacy and is explicitly out of Feature 141's redesign scope. |
| Legacy sequential | Gate is mandatory; the current panel shows sequential shot text and estimate. Dialogue is inline-editable; visual corrections use redraft notes. | Existing Feature 136 path; not the staged v2 state machine. |
| Feature 141 staged sequential v2 | Uses `planningArchitecture=staged_two_skill_v2`, architecture-aware state/projection, dedicated Job Workbench UI, and mandatory checkpoints for story approval, each image prompt/result, each video prompt/result, audio/TTS, and final assembly before the corresponding credit-bearing stage. | Implemented for new Job Workbench runs; provider/browser/rollout evidence remains a release gate. |

Known legacy limits are accepted and must remain explicit: the panel does not promise visual-summary
inline persistence, the 3x3/start-stop panel does not invent per-shot data, and the estimate is not
shown where the current strategy cannot provide a trustworthy N. Any Feature 141 UI may provide a
different contract, but it must not reinterpret these legacy limitations as evidence that v2 has
already shipped.

## Related root causes shipped this session (context)

- QA minor-safety false positives fixed (depicts_minor grounding) — see
  `planning/marketplace-multi-product-reference-images/plan.md` addendum and its associated
  implementation history.
- Repair round = WHOLE-set regeneration on 3x3; sequential is per-shot targeted. The user's
  07-23 run was sequential but all 9 shots failed QA every round BECAUSE of the false
  positives above → 27 unique paid images, zero usable sets.

## Settings-fidelity problem (NEW, user-reported — investigate before/with the gate)

Symptom: tone ตลกขำ → generic flat script; Hook→Problem → no Problem present. Content rarely
matches what was configured ("สุ่มตลอด ใช้ไม่ได้มากกว่าใช้ได้").

Evidence so far: the skill runner HAS plumbing (`tone_preset` :612, `segment_structure_preset`
:619, `review_tone` :660/:807, `video_structure_mode` :662/:808 in
productReviewSequentialStoryboardSkillRunner.ts) — so the suspicion is the known
taught-not-wired class ([[project_vd_skill_taught_not_wired]]): either (a) the Auto panel's
อารมณ์/โครงเรื่อง selections never reach those runner inputs, or (b) they reach the prompt but
the skill never VALIDATES the draft against them (no review-loop check: "does shot 2 actually
state a Problem?"), so the LLM ignores them.
TODO (next step): trace Auto panel → hyperframesRuntimeApiService → runner inputs with one real
run's metadata; then add a skill-first review check (the skill's finalQc loop should score
tone/structure adherence and reject drafts that ignore them).
The GATE is also the mitigation while this is being fixed: the user sees the mismatch before
paying.

## Status
- [x] User approved: mandatory gate, all runs (2026-07-23) + "ทำให้ครบถ้วนสมบูรณ์ ไม่ต้องรอยืนยันอีก"
- [x] Backend gate — committed f997ba1a9. Key facts: both flows converge on
  startMarketplaceAutoReviewRun (one gate covers Standard + Auto); the hold rides the EXISTING
  blocked-stage short-circuit in advanceMarketplaceAutoReviewRun (idempotent + zero-credit by
  construction); metadataJson.planReview { required, status awaiting|approved, heldAt,
  approvedAt, redraftCount, lastNotes }; statusDetail.state "awaiting_plan_review" (added to
  MARKETPLACE_AUTO_REVIEW_DETAIL_STATES); mutations approveAutoReviewPlanReview({runId}) +
  requestAutoReviewPlanRedraft({runId, notes<=2000}) (redraft re-runs concept_story+prompt_plan —
  prompt_plan alone is bookkeeping for 3x3; sequential also clears+reruns the per-shot pack;
  notes go in as a labeled directive, creativeBrief unmutated). 25/25 gate tests verified by
  conductor. Trade-off: redraft doesn't refresh the Director Project record (stale text possible
  in media-studio production tab).
  ⚠ DEPLOY RULE: gate is mandatory — do NOT restart the server until the review UI ships; the
  running process is pre-gate until restart, so nothing strands.
- [x] Settings-fidelity — ROOT CAUSE CONFIRMED taught-not-wired: review_tone/segment_structure
  reach the prompt but finalQc never verified adherence. Fixed 4f25bfe0d: finalQc +2 required
  keys (tone_preset_adhered, structure_beats_present), criteria skill-first in skill.md twins
  (ตลกขำ = humorous phrasing in hook + ≥2 shots judged on actual dialogue; Problem beat must
  state a concrete problem, not "สินค้าคุณภาพดี แข็งแรง"), output.schema.json required set,
  5 fixture files updated. 112/112 + neighbors green.
- [x] UI: AutoReviewPlanReviewPanel — committed 50efde08d. Mounts first in the run section when
  planReview awaiting; approve / redraft-with-notes(≤2000) / reuses the page's single cancel;
  settings-vs-plan side-by-side (only fields actually persisted); per-shot text table for
  sequential; estimate line sequential-only (no honest N exists for 3x3/start-stop — omitted,
  not invented). KEY WIRING FACT: the page polls a TRIMMED runs list (summary:true) that omits
  the heavy plan text — the panel drives a narrow getAutoReviewRun query enabled only while a
  run is held. Client gate also requires live run + currentStage image_generation because
  cancel never clears planReview (stale "awaiting" on a cancelled run must not show buttons).
  Follow-up commits added prompt-verification aids (`8e5267aac`), redraft idempotency and
  durable degrade evidence (`c0dbd127e`), the no-dialogue approval block (`5933fe8af`), and
  failed-draft reason persistence (`9e7084adf`).
- [x] Reported deployed 2026-07-23 ~20:52 — a single restart was reported to activate the gate,
  adherence QC, and UI together (b1b4afd1c carries the 2 new degraded-fallback `finalQc` keys).
  This deployment/health claim is operational evidence, not independently reproducible from the
  repository; verify the live process separately before another rollout. The repository itself
  proves the gate implementation, not which process is currently serving production.

## Verification recorded for this plan

Focused verification should cover the service gate, router mutations, panel states, and page
wiring together:

```text
cd apps/web
pnpm exec vitest run server/services/__tests__/marketplaceAutoReview.planReviewGate.test.ts server/routers/__tests__/marketplaceCapture.planReviewGate.test.ts client/src/components/marketplaceCapture/__tests__/AutoReviewPlanReviewPanel.test.tsx client/src/pages/__tests__/MarketplaceCaptureProductDetail.planReviewGate.test.ts
```

The expected proof is all four focused files green. A full repository test run is not a suitable
signal for this plan while the worktree contains unrelated user changes. Actual Feature 141
verification on 2026-07-26 includes the dedicated staged UI/server batch: 14 files, 56 tests
passed. Provider-credit, browser, deployment, and rollout evidence are still separate release
gates; restarting or redeploying the legacy gate alone does not enable staged v2.
