# Orchestra Review Findings

## Round 1

- Scope reviewed: `apps/web/client/src/lib/productionReferenceStoryboard.ts`, `apps/web/client/src/pages/MediaStudio.tsx`, `apps/web/server/services/__tests__/productReferenceStoryboardSkills.test.ts`, and all `apps/web/skills/*-reference-storyboard/` schema/instruction contract updates.
- Completeness: clean. `scene_descriptions` is removed from production reference storyboard skill schemas/UI schemas and Media Studio sync; replacement `voiceover_script` exists.
- Contract correctness: clean. `storyboard_guide` remains the visual shot contract, `voiceover_script` is the spoken script contract, and `production_concept_details` remains product concept/product-truth/claim-safety context.
- Product/reference fidelity: clean. Skill instructions explicitly prevent product, character, label, scale, material, and environment reference locks from being overridden by concept or script text.
- Gates reviewed: focused Vitest, JSON parse validation, no-old-input `rg`, TypeScript check, `git diff --check`.
- Findings: none.
- Clean status: clean round 1.

## Round 2

- Scope reviewed: rechecked stale-gate risk after no further implementation changes.
- Completeness: clean. All 20 `*-reference-storyboard` directories share the new input contract pattern.
- Security: clean. No auth, tenant isolation, secrets, CORS/CSP, infrastructure, dependencies, uploads, or endpoint changes.
- Quality: clean. Existing mirror test verifies `SKILL.md` and `skill.md` equality across production reference storyboard skills; new contract test covers `voiceover_script`.
- Deferred optional items: none.
- Clean status: clean round 2.
- Stop reason: required clean rounds reached with no material findings.

## Follow-Up Round 1

- Scope reviewed: all `apps/web/skills/*-reference-storyboard/SKILL.md`, mirrored `skill.md`, input schemas, output contracts where present, and `productReferenceStoryboardSkills.test.ts`.
- Completeness: clean. Every reference storyboard skill now requires `CINEMATIC REALISM LOCK`, `CHARACTER FACE AND IDENTITY LOCK`, and immutable product evidence behavior.
- Character fidelity: clean. Instructions explicitly reject identity swaps, hidden/cropped/blurred faces, waxy/plastic/CG-looking skin, and invented people when reference identity cannot be preserved.
- Product fidelity: clean. Instructions explicitly reject adding/removing/reshaping/recoloring/retexturing/relabeling/simplifying/redesigning product parts or material/structure.
- Gates reviewed: focused Vitest, JSON parse validation, rule presence script, TypeScript check, `git diff --check`.
- Findings: none.
- Clean status: clean round 1.

## Follow-Up Round 2

- Scope reviewed: stale-gate risk after no further implementation changes.
- Contract consistency: clean. `SKILL.md` and `skill.md` remain byte-identical by focused test; schemas parse; output contracts include the new locks where output contract files exist.
- Security: clean. Skill text/schema/test changes only; no auth, endpoint, dependency, DB, infra, upload, CORS/CSP, or secrets surface changed.
- Deferred optional items: none.
- Clean status: clean round 2.
- Stop reason: required clean rounds reached with no material findings.

## Shot-Mapping Follow-Up Round 1

- Scope reviewed: all `apps/web/skills/*-reference-storyboard/SKILL.md`, mirrored `skill.md`, input schemas/UI schemas, output contracts where present, `productionReferenceStoryboard.ts`, and focused tests.
- Completeness: clean. Every production reference storyboard skill now requires explicit shot-by-shot mapping from `storyboard_guide` + `voiceover_script`, parses numbered/timed shots, treats category default 3x3 maps as fallback-only, and avoids generic `SCENE DESCRIPTION` output for explicit storyboard runs.
- Product fidelity: clean. Every skill now requires a canonical product fidelity matrix and repeated product facts inside every product-visible frame, covering countable parts, material/color/finish, support/base structure, markings, scale, and no-go substitutions.
- Runtime boundary: clean. Media Studio already passes `storyboard_guide`, `voiceover_script`, and `production_concept_details`; helper policy now preserves one-beat-to-one-frame mapping when beat count matches requested frame count.
- Gates reviewed: focused Vitest, JSON parse validation, rule presence script, old-default-map/old-input `rg`, TypeScript check, `git diff --check`.
- Findings: none.
- Clean status: clean round 1.

## Shot-Mapping Follow-Up Round 2

- Scope reviewed: stale-gate and consistency check after no further implementation changes.
- Contract consistency: clean. All 20 production reference storyboard `SKILL.md` files contain the shot mapping and product matrix rules; mirrored `skill.md` files remain byte-identical; all 19 output contracts contain frame-level mapping/product-facts guidance.
- Security: clean. Prompt contract/schema/test changes only; no auth, endpoint, DB, dependency, upload, tenant, CORS/CSP, infrastructure, or secret surface changed.
- Deferred optional items: none.
- Clean status: clean round 2.
- Stop reason: required clean rounds reached with no material findings.

## Cinematic/Continuity Follow-Up Round 1

- Scope reviewed: latest Greenforst 3x3 generated output and generated prompt, all production reference storyboard skill contracts, mirrored skill files, output contracts, and skill contract tests.
- Findings addressed:
  - Cinematic quality: prompt used cinematic language but lacked mandatory per-frame camera/light/color notes; added a dedicated cinematic shot plan requirement.
  - Character continuity: frame 5 style over-shoulder/back-of-head composition can cause video generation to reinterpret the person; added video character continuity rules requiring clear front/three-quarter face or hands-only/partial-body-without-head framing.
  - Product continuity: frame 8 used a different bedside table/background furniture instead of the referenced Greenforst product; added same-product-instance and sellable-product exclusivity rules.
  - No-text mode: prop text such as books/mugs/clocks can introduce unwanted readable text; added prop text suppression.
- Security: clean. Skill text/schema/test changes only.
- Gates reviewed: focused Vitest, JSON parse validation, rule presence script, TypeScript check, `git diff --check`.
- Clean status: clean round 1.

## Cinematic/Continuity Follow-Up Round 2

- Scope reviewed: stale-gate consistency after verification.
- Contract consistency: clean. All 20 production reference storyboard `SKILL.md` files and mirrored `skill.md` files include cinematic shot plan, video character continuity, same-product-instance, sellable-product exclusivity, and prop-text suppression rules.
- Output contracts: clean. All 19 output contract files include camera/light/color notes, same canonical product instance requirements, person-correct-product-wrong fatal wording, and non-product prop/background text suppression.
- Security: clean. No auth, endpoint, DB, dependency, upload, tenant, CORS/CSP, infrastructure, or secret surface changed.
- Deferred optional items: none.
- Clean status: clean round 2.

## Unified Skill Follow-Up Round 1

- Scope reviewed: `product-reference-storyboard` package, 20 category rule files, legacy skill production-disable flags, `productionReferenceStoryboard.ts`, `MediaStudio.tsx`, server skill execution category injection, and focused tests.
- Completeness: clean. Production routing now resolves to one skill id and sends detected `product_category`; product-specific rules are split into 20 category markdown files.
- Runtime boundary: clean. `executeCustomSkill` appends the selected category rule file only for `product-reference-storyboard`; `auto` category falls back to shared product-reference locks and current references.
- Backward compatibility: clean. Legacy saved skill ids are normalized to the unified skill id, while legacy skill folders remain present and mirrored.
- Gates reviewed: focused Vitest, JSON parse validation, unified/legacy/category presence script, TypeScript check, `git diff --check`.
- Findings: none.
- Clean status: clean round 1.

## Unified Skill Follow-Up Round 2

- Scope reviewed: stale-gate consistency after verification.
- Contract consistency: clean. One Production-enabled skill owns shared storyboard/cinematic/face/product-lock behavior; category files contain only product-specific fidelity additions.
- Security: clean. Endpoint change only reads local category markdown from a fixed allowlisted category set; no auth, tenant, dependency, upload, CORS/CSP, infrastructure, or secret surface changed.
- Deferred optional items: none.
- Clean status: clean round 2.
