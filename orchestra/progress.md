# Orchestra Progress

[COMPLETE] step-0-state — Archived stale orchestra session files under `orchestra/archive/2026-05-30T01-51-24Z/` and started a fresh standard-mode session.
[COMPLETE] step-1-discovery — SocratiCode green; narrowed production reference storyboard skill files and Media Studio sync points.
[COMPLETE] design — Selected `voiceover_script` as the replacement input and documented Storyboard Guide + Voiceover Script precedence.
[COMPLETE] implementation — Updated Media Studio production reference storyboard sync, helper/tests, and all 20 `*-reference-storyboard` skill contracts/schemas/UI schemas.
[COMPLETE] quality-gates — Focused Vitest passed, JSON parse validation passed, `rg` old-input check clean, TypeScript check passed, and `git diff --check` passed.
[COMPLETE] review-convergence — Two targeted clean conductor review rounds found no material remaining gaps.
[COMPLETE] follow-up-cinematic-fidelity — Added stronger cinematic realism, character face identity, and immutable product reference rules across all production reference storyboard skills.
[COMPLETE] follow-up-quality-gates — Focused Vitest passed, JSON parse validation passed, all 20 SKILL.md files contain the new lock rules, output contracts contain the new lock blocks, TypeScript check passed, and `git diff --check` passed.
[COMPLETE] follow-up-shot-mapping — Added shot-by-shot mapping, fallback-only category maps, no generic `SCENE DESCRIPTION` output for explicit storyboard runs, and per-frame product fidelity QA based on the user's Greenforst test output.
[COMPLETE] follow-up-shot-mapping-quality-gates — Focused Vitest passed, JSON parse validation passed, all 20 SKILL.md files contain shot mapping/product QA locks, all 19 output contracts contain frame-level mapping/product-facts guidance, no old default-map/scene-description inputs remain, TypeScript check passed, and `git diff --check` passed.
[COMPLETE] follow-up-cinematic-video-continuity — Tightened cinematic camera/light/color notes, video-safe character face framing, same-product-instance continuity, background product contamination, and non-product prop text suppression based on the latest Greenforst storyboard output.
[COMPLETE] follow-up-cinematic-video-continuity-quality-gates — Focused Vitest passed, JSON parse validation passed, all 20 mirrored skills contain the new cinematic/video/product continuity rules, all output contracts contain the new contract bullets where present, TypeScript check passed, and `git diff --check` passed.
[COMPLETE] follow-up-unified-product-storyboard — Added unified `product-reference-storyboard` skill, 20 product-category rule files, `product_category` input, legacy skill production-disable flags, client category detection/routing, and server category-rule injection.
[COMPLETE] follow-up-unified-product-storyboard-quality-gates — Focused Vitest passed, parsed 83 reference-storyboard JSON files, verified unified skill enabled with 20 legacy skills disabled and 20 category files present, TypeScript check passed, and `git diff --check` passed.
[COMPLETE] follow-up-admin-skill-visibility — Fixed `/admin/skills` DB listing to force folder skill resync so newly added skill folders appear without a server restart, and ensured folder sync updates frontmatter `configJson`.
[COMPLETE] follow-up-auto-category-frame8-fix — Auto mode now infers product category server-side and appends the selected category rule file; tightened unified skill rules so product-introduction onward, especially Frame 8/reconfirming-value, must visibly show the same locked product and reject wrong nightstand/drawer/table substitutions.
[COMPLETE] follow-up-frame-level-product-verify — Latest prompt was improved but still relied too much on global product lock, so added mandatory frame-level `PRODUCT VERIFY:` clauses for all post-introduction product frames.
[COMPLETE] follow-up-cinematic-frame-clauses — Latest prompt still had generic per-frame camera/lighting/depth and invented wardrobe risk, so added structured `VISUAL`, `CAMERA/LIGHT/DEPTH`, `STORY MATCH`, `PRODUCT VERIFY`, and `HUMAN REALISM` frame clauses plus stricter human skin/wardrobe continuity rules.
[COMPLETE] follow-up-rear-view-video-safety — Added hard-fail rules for back-facing/no-face visible identity frames in video-bound storyboards, with a narrow rear-only exception requiring `VIDEO MOTION LOCK` and no turn/no face reveal.

## Advisory Worktree State

Uncommitted work existed before implementation and overlaps the production reference storyboard area. The task will work with those changes and will not revert them.
