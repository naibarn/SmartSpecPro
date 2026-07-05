[2026-07-05T09:45:00Z] NOT-AUTO-APPROVED (STOP condition — genuine product
ambiguity): User explicitly requested a thorough written PLAN before
implementation this round ("ช่วยวาง plan... วางแผนให้ครบถ้วน รอบคอบจริง ๆ"), after
noting prior rounds left this exact area (character-image reuse in the
Storyboard view, persistent panel) incomplete twice. Rather than proceeding
straight to auto-approved implementation, 4 genuine product decisions were
identified during research (character-sheet button scope, stat-field
sourcing, sheet default language, persistent-panel responsive fallback) and
presented to the user via AskUserQuestion, with recommended defaults stated
explicitly in `orchestra/plan.md` so the user can also choose to skip
answering and let implementation proceed with those defaults.
Reason: `auto_by_default` mode still applies to execution details, but this
specific STOP condition ("product intent remains ambiguous... present the
ambiguity, ask only for the product decision") is in the routing table
precisely for cases like this — proceeding without asking would repeat the
exact pattern the user is frustrated about (features shipped in a form they
didn't actually want, requiring yet another correction round).
Risk: N/A (planning-stage decision, no code changed yet)
Files affected: orchestra/plan.md, orchestra/progress.md (new planning cycle)

[2026-07-05T10:20:00Z] User answers to the 4 planning questions: (1) separate
"Generate full Character Sheet" button — recommended, accepted; (2) AI-invented
stats sidebar content — recommended, accepted; (3) English default with a
Thai toggle — recommended, accepted; (4) persistent panel required on ALL
screen sizes (collapsible + resizable), NOT desktop-only-with-modal-fallback
as I had recommended — user override. Implemented section 4 with the
pre-existing `ResizableCollapsiblePanel` component (already used in
`StoryboardReviewPage.tsx`), which satisfies "all screen sizes" natively
(stacks below `xl`, sidebar at `xl`+) without needing a separate modal path.

[2026-07-05T10:22:00Z] Live-verification-only fix, auto-approved (not a
product decision): all 3 character-image `generateImageAsync` call sites were
missing `aspectRatio`, causing a hard provider-side failure
("This field is required" from Kie.ai `google-banana-2-lite`). Same bug class
already fixed once this session for the 3x3 multi-angle grid feature. Fixed
by adding `aspectRatio: "9:16"` to match the convention used elsewhere in this
router (start-frame / multi-angle generation). This is a pure bug fix with an
obvious root cause and a one-line-per-site change mirroring an
already-established pattern — no product ambiguity, so no STOP triggered.
Re-verified live post-fix: real character-sheet image generated and visually
inspected, confirmed coherent.
