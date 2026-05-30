# Orchestra Plan

## Task
Update every `*-reference-storyboard` skill so the old Scene Descriptions input is removed and replaced with a spoken script/voiceover input, while storyboard prompt generation follows Storyboard Guide + spoken script first and keeps product/reference fidelity locked.

## Classification
- scope: large
- risk: low
- affected_domains: skill schemas, skill prompt instructions, Media Studio production reference storyboard sync, focused tests
- estimated_file_count: 60+
- chosen_route: installed-skill-flow + direct-inline-standard-light
- task_summary: Replace scene-description-driven storyboard prompt input with voiceover-script-driven prompt input across production reference storyboard skills.
- bug_route: n/a
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Skill Activation
- orchestra: explicitly requested; owns routing, impact notes, gates, and progress artifacts.
- brainstorming: used for compact design approval before behavior change.
- skill-creator: used because the task updates existing skill contracts and instructions.

## SocratiCode Preflight
- status: green; index and watcher active for `/home/dev/projects/SmartSpecPro`.
- narrowed areas:
  - `apps/web/skills/*-reference-storyboard/**`
  - `apps/web/client/src/lib/productionReferenceStoryboard.ts`
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/lib/productionReferenceStoryboard.test.ts`
  - `apps/web/server/services/__tests__/productReferenceStoryboardSkills.test.ts`
- impact:
  - `apps/web/client/src/lib/productionReferenceStoryboard.ts`: SocratiCode reported no graph callers, but direct text references exist in MediaStudio and tests.
  - `apps/web/client/src/pages/MediaStudio.tsx`: SocratiCode reported no graph callers; treat as user-facing production workflow surface.

## Existing Worktree State
- Existing dirty files overlap this task:
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/production-director.e2e.test.tsx`
  - `apps/web/client/src/lib/productionReferenceStoryboard.test.ts`
  - `apps/web/client/src/lib/productionReferenceStoryboard.ts`
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/skills/media-production-storyboard-planner/SKILL.md`
  - `apps/web/skills/media-production-storyboard-planner/skill.md`
  - `apps/web/client/src/features/media-production/storyConceptVariation.ts`
- Work with these changes; do not revert unrelated or prior user edits.

## Proposed Design
Recommended approach: introduce `voiceover_script` as the replacement input for `scene_descriptions`.

Design rules:
- `storyboard_guide` remains the primary shot/visual/camera/timing contract.
- `voiceover_script` is the spoken line/script contract. It should preserve shot numbering and timing when available.
- Prompt logic must use `storyboard_guide` + `voiceover_script` as the primary storyboard content source, without inventing a new story when those fields already contain separated shots.
- `production_concept_details` controls product concept, real product facts, audience, problem, hook, selling points, and claim safety.
- `reference_product_images` lock product geometry/material/color/labels/scale.
- `reference_character_images` lock recurring character identity.
- `reference_environment_images` lock scene mood/location/lighting only and must not override product or character references.

## Planned Changes
- Replace schema field `scene_descriptions` with `voiceover_script` in every `apps/web/skills/*-reference-storyboard/schemas/input.schema.json`.
- Replace UI order/help for `scene_descriptions` with `voiceover_script` in every matching `ui.schema.json`.
- Update `SKILL.md`, `skill.md`, and reference contracts to remove Scene Descriptions as an input and document Storyboard Guide + Voiceover Script priority.
- Update Media Studio sync to send `voiceover_script` instead of `scene_descriptions`.
- Rename/update helper and tests from scene descriptions to voiceover script behavior.

## Quality Gates Planned
- Focused Vitest for production reference storyboard helper.
- Focused Vitest for production reference storyboard skill schema contracts.
- JSON parse validation for changed skill schemas.
- Targeted `rg` verification that `scene_descriptions` no longer remains in the `*-reference-storyboard` skill set or production reference storyboard sync path.

## Follow-Up Task: Cinematic Quality And Fidelity Locks

User requested stronger image quality rules across every `*-reference-storyboard` skill:
- higher-quality cinematic photorealism
- dimensional lighting, camera, and depth aligned to `storyboard_guide` + `voiceover_script`
- clear recurring character faces, stable identity across shots, natural human skin rather than plastic/CG-looking people
- stricter product immutability from reference images: no added/removed parts, reshaping, recoloring, retexturing, relabeling, or material/geometry drift

Classification:
- scope: large
- risk: low
- route: installed-skill-flow + direct-inline-standard-light
- domains: skill prompt contracts, skill schemas, focused tests
- dispatch: no sub-agents; standard light direct update

## Follow-Up Task: Shot Mapping And Product Fidelity From Test Output

User supplied a real 3x3 Greenforst bedside-table test output where the storyboard looked pleasant but did not strictly map each generated panel to the Storyboard Guide + Voiceover Script, and the product drifted toward a generic bedside table.

Plan:
- Add a shot-by-shot frame mapping rule to all production reference storyboard skills.
- Require explicit numbered/timed Storyboard Guide + Voiceover Script parsing, including collapsed whitespace.
- Make category default 3x3 maps fallback-only when no explicit shot list exists.
- Replace generic `SCENE DESCRIPTION` output guidance with frame-level `SHOT-BY-SHOT STORYBOARD PROMPT` guidance.
- Add per-frame product fidelity matrix/QA requirements so countable product facts are repeated inside every product-visible frame.
- Update helper/test expectations and run focused gates.

## Follow-Up Task: Cinematic And Video Continuity From Second Output

User supplied a second Greenforst 3x3 output after the shot-mapping changes. It improved sequence alignment but still showed:
- flat/catalog-like lighting and not enough frame-level camera/light/color direction
- a product-use frame with back/head/no clear face, risky for video identity continuity
- a confirmation frame where the character is correct but the product changes into a different bedside table
- readable/non-product prop text risk in no-text mode

Plan:
- Require a dedicated `CINEMATIC REALISM LOCK` plus per-frame camera/light/color notes.
- Require video-safe person framing: clear front/three-quarter face for identity frames, otherwise hands-only/partial-body-without-head.
- Require same canonical product instance across lifestyle/result/confirmation/CTA frames.
- Forbid competing similar products from environment references.
- Suppress readable non-product prop/background text in no-text mode.

## Follow-Up Task: Unified Product Reference Storyboard Skill

User proposed consolidating the 20 `*-reference-storyboard` skills into one shared skill because the storyboard/voiceover/cinematic/product-lock logic is now identical and only product-category fidelity rules differ.

Plan:
- Add one enabled `product-reference-storyboard` skill for Media Studio Production.
- Add `product_category` input so Production can pass the detected product category into the skill.
- Move product-specific rule differences into `references/product-categories/*.md` with 20 category files.
- Keep legacy category skills on disk for compatibility but disable them from Production selection.
- Update client routing to return the unified skill id while separately detecting product category.
- Update server skill execution to append the selected category rule file for `product-reference-storyboard`.
- Update focused tests and run JSON/schema, TypeScript, and diff checks.
