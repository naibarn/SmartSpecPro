# Deep Plan Research

## Research decision

- Codebase research: required because SmartSpecPro is an existing git repository with
  Drizzle, tRPC, React, and a disk-loaded skill bundle.
- Web research: skipped. The requested behavior is repository-specific and no external
  API contract or new library is required.
- Testing research: required; existing web tests use Vitest, Testing Library, and focused
  service/router suites.

## SocratiCode status

The configured SocratiCode transport returned `Transport closed` during discovery. The
research therefore used targeted `rg`, line-range reads, git status, audit traces, and
existing tests. This fallback must be recorded in the implementation report and should
not be mistaken for an index-backed impact result.

## Current runtime findings

1. `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` loads
   `apps/web/skills/vertical-drama-character-visual-bible/skill.md` as one large system
   prompt. It does not currently load `prompts/system.prompt.md` as a separate mandatory
   layer. The uppercase `SKILL.md` is stale and is not used by this runtime.
2. The active skill body is approximately 1,269 lines and contains good DNA, recall,
   anti-clone, reference, safety, and role guidance, but its generic examples and
   repeated defaults can overwhelm current target facts.
3. The production trace for series 7 showed `ภาพเต็มตัว หน้าตรง ชุดหรูหรา` reached the
   skill and the model completed normally, yet the primary prompt still behaved like a
   generic close portrait. This proves prompt stuffing is not deterministic enforcement.
4. `apps/web/server/routers/verticalDramaCharacters.ts` currently has
   `buildCharacterRenderPrompt` and `VD_CHARACTER_CUSTOM_REQUIREMENTS` append logic. It
   must be removed after the skill contract can author compliant prompts itself.

## Current role-flow findings

1. The preset synthesizer and Story Bible contracts expose a free string `role`; examples
   teach occupational labels such as `Shop owner`.
2. The Create Series Wizard serializes characters as `name — role: description`, losing
   structured narrative intent before seed persistence.
3. `vertical_drama_characters.role` is a nullable varchar and has no canonical narrative
   role field.
4. `characterRowToDto` and shared character contracts expose only the free-text role.
5. The UI renders that role directly as a badge, so occupation text is presented as if it
   were the story role.
6. `resolveCharacterRoleTier` and `isLeadRole` infer importance from keywords. `ซีอีโอหญิง`
   and `อดีตทหารบอดี้การ์ด` therefore miss lead behavior; `ตัวร้ายเงาในเครือข่าย` works only
   accidentally.
7. Story Bible refinement currently saves to the series bible but does not reconcile
   canonical role fields to the durable character roster.

## Relevant code surfaces

- Skill bundle: `apps/web/skills/vertical-drama-character-visual-bible/`
- Character image runtime: `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- Character route and render branches: `apps/web/server/routers/verticalDramaCharacters.ts`
- Character design context: `apps/web/server/services/verticalDramaCharacterDesignContext.ts`
- Preset synthesis: `apps/web/server/services/verticalDramaPresetSynthesis.ts`
- Story Bible: `apps/web/server/services/verticalDramaStoryBible.ts`
- Series/character routers: `apps/web/server/routers/verticalDramaSeries.ts`
- Wizard: `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- Character UI: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- Shared contracts: `apps/web/shared/verticalDramaSeries/characterProfile.ts` and
  `contracts.ts`
- DB schema: `apps/web/drizzle/schema.ts`
- Existing focused tests under `apps/web/server/services/__tests__`, router tests, shared
  contract tests, and skill bundle fixtures/tests.

## Existing conventions to preserve

- Drizzle schema changes use additive migrations and shared row-to-DTO mappings.
- Server input and output validation uses Zod alongside JSON skill schemas.
- Prompt generation uses bounded retries and server-owned deterministic evidence
  normalization.
- UI uses existing vertical-drama card/chip/editor patterns and localized copy modules.
- The dirty worktree contains unrelated work; implementation must stage only scoped files.

## Testing

The web application uses Vitest with colocated `*.test.ts`/`*.test.tsx` files, service and
router suites under `apps/web/server/**/__tests__`, shared contract tests under
`apps/web/server/shared` or `apps/web/shared`, and Testing Library for React behavior.
Skill-pack fixtures are validated by the bundle's `scripts/verify.sh` and manifest tests.
Use focused `pnpm vitest run <paths>` (or the repository's package script) before the web
typecheck. Browser-visible changes require the standard Playwright/manual evidence matrix.

## Planning implications

The safe order is shared enums/contracts and additive DB migration first, then preset/
wizard/Story Bible reconciliation, then DTO/UI, then V2 skill schemas/assembler/runtime,
then removal of external prompt composition, followed by semantic and end-to-end gates.
Schema changes must remain single-writer and sequential. UI and skill work can be reviewed
independently only after the shared contract is fixed.
