# Marketplace Auto Review — mandatory TEXT storyboard review gate (ชั้น 0)

Date: 2026-07-23 · Status: APPROVED by user (mandatory for ALL runs) · Owner: conductor session

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
- There is NO user-approval gate between plan authoring and image generation today (no
  planApproved / needs_plan_review anywhere).

## Design (smallest correct shape)

1. New run status `awaiting_plan_review`, entered after the prompt_plan stage completes and
   BEFORE the first image credit reservation. Mandatory: every run stops here.
2. Storyboard Review page (or the product page run card) renders the TEXT plan for review:
   - per-shot table (1–9): shot title, visual summary, บทพูด/voiceover line, image-prompt
     summary; plus productDetail (facts lock) and the selected tone/structure settings SIDE BY
     SIDE so mismatch is visible instantly.
   - inline edit of dialogue/voiceover + shot visual summary (reuse the existing
     `saveAutoReviewSequentialShotOverride` per-shot override machinery where possible).
   - actions: [ยืนยัน สร้างภาพ] → resumes the run into image generation;
     [ให้ AI ร่างใหม่] → re-runs prompt_plan only (text cost only, no image credits);
     [ยกเลิก] → cancel run, zero image spend.
3. Resume path reuses the existing background stage-advancement (same as
   `awaiting_credit_authorization` handling) — no new scheduler concept.
4. Estimate shown at the gate: first-pass N images + worst-case N × rounds (reuse the
   quality-mode estimate copy shipped in 7c308dce2/4f4f5932a).

## Related root causes shipped this session (context)

- QA minor-safety false positives fixed (depicts_minor grounding) — see
  planning/marketplace-multi-product-reference-images/plan.md addendum + commit (pending).
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
- [~] UI: AutoReviewPlanReviewPanel (agent in flight) — approve / redraft-with-notes / cancel +
  settings-vs-plan side-by-side + per-shot text table + credit estimate line.
- [ ] Deploy backend+frontend together (single restart) + verify.
