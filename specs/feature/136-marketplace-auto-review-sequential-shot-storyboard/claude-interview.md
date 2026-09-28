# Claude Interview — Feature 136

Date: 2026-07-21
Format: single round, 3 questions (spec v1.3.0 had already settled most
decisions through three user-driven review rounds; only genuine
business/scope decisions were asked).

## Q1 — Implementation plan scope

**Q:** Implementation plan ควรครอบคลุม scope แค่ไหน? (spec แบ่ง 6 phases:
1 Foundation, 2 Sequential image pipeline, 3 Evidence-guard shared,
4 Full-video per-shot, 5 Evidence UI + GA, 6 Tier-2 Agents SDK แบบ assessed)

**A:** **Phases 1–5.** Phase 6 (Tier-2 executable Agents SDK skill) stays a
documented assessment gate (spec §9.8, §26 Phase 6) and gets NO
implementation sections in this plan. The skill ships as Tier 1 (markdown +
TS-orchestrated loop).

## Q2 — GA quality-gate thresholds

**Q:** เกณฑ์ตัวเลขของ GA quality gate (sequential ต้องชนะ 3x3 baseline)
ควรกำหนดตอนไหน?

**A:** **ตัดสินตอน pilot** — per spec §26: collect §25 mode-comparison
metrics first, pin numeric thresholds at the Phase-5 review from real data.
The plan must therefore ensure metrics recording lands EARLY (Phase 2) so a
baseline exists by pilot time.

## Q3 — Real-LLM gate / pilot category focus

**Q:** Real-LLM gate และ pilot ควรโฟกัสสินค้าหมวดไหนก่อน?

**A:** **เด็ก + เฟอร์นิเจอร์** — the two motivating failure cases: children's
desk chair (guardian presence) and furniture (invented assembly reviews).
Test fixtures and the pre-GA real-LLM gate use these two categories.

## Auto-decisions (technical — decided from codebase research, not asked)

1. **Flag-off rejection error code = `FORBIDDEN`** (typed error), following
   the shipped hermes precedent (`mediaTransportResolver.ts:96-101`,
   `hermesMediaScheduler.ts:538-540`) — NOT `PRECONDITION_FAILED` as spec
   §7.3 wrote. Deviation recorded; spec's intent (server-side hard reject +
   Thai copy) is preserved.
2. **Plan-level sequential visibility** uses the hyperframes access/blocker
   pattern (`buildBlocker`, `hyperframesAutoPlanService.ts:126-139`) rather
   than throwing from the plan query: flag off → strategy absent from
   defaults + blocker entry; start mutations throw FORBIDDEN.
3. **Tone/structure/presets need no new zod** — `reviewTone`,
   `storytellingStructure`, `creativePresets` already exist in
   `startAutoReview.referenceAnchors` (router :730-758) and flow into the run;
   the skill input contract consumes them from resolved anchors.
4. **`GetAutoStoryboardReviewPlanOutputSchema` is `.strict()`** → new
   `evidencePreview`/`referenceCapacity` are added as optional fields inside
   the object (runtimeApiSchemas.ts:63-70).
5. **Voiceover rewrite hook reused as-is** (called unconditionally in
   concept_story, SVC:17993-18005); no audio-strategy gate added in v1.
6. **qualityMode candidate policy**: implement spec default (1 attempt +
   per-unit repairs); the optional high-quality 2-candidate path for units
   1–2 is included in the Phase-2 section as specced (spec §18.2), gated on
   `qualityMode: high` — no new user decision needed.
7. **Video model default unchanged** (veo-3.1 lite family per Feature 118);
   sequential full-video adds only the start-frame-support blocker.
8. **Testing**: Vitest from `apps/web` via
   `npm --prefix apps/web run test -- <files>`; router tests with
   `vi.hoisted` JWT stub; real-file skill tests
   (`reviewerSkillsUpgrade.test.ts` pattern); tsc against ~987-error
   baseline.
9. **Evidence review panel default collapsed**; capacity meter and angle
   chips reuse existing chip/meter UI patterns in the marketplace panel.
10. **New skill id/slug**: `product-review-sequential-storyboard`
    (folder `apps/web/skills/product-review-sequential-storyboard/`).
