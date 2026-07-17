# Feature 134 Research

## Research decision

- Codebase: required. SmartSpecPro is an existing TypeScript/React/tRPC/PostgreSQL codebase.
- SocratiCode: available and indexed; used before targeted reads and impact analysis.
- Web: skipped. The feature uses repository-local contracts and no unstable external API
  behavior is needed for the implementation decision.
- Testing: Vitest through `npm --workspace @smartspec/web run test -- <files>` plus the web
  workspace `check` script and the Skill bundle verifier.

## Current control plane

### Browser

`apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
owns preview, paid submission, task polling, media URL resolution, asset linking, reference
selection, and the current single generated portrait display. The prompt-preview state holds
one prompt and one approved design snapshot. `pollCharacterImageTask` assumes one task URL
and links it immediately as `primary_portrait`.

The closest established UX is
`apps/web/client/src/components/verticalDramaSeries/VerticalDramaContactSheetPicker.tsx`:
responsive candidate cards, `aria-pressed`, selected rings/badges, independent status, and
retained alternatives. The new feature should reuse that interaction grammar without using
a 3x3 contact-sheet media artifact.

### Router and credits

`apps/web/server/routers/verticalDramaCharacters.ts` exposes
`previewCharacterPrompt` and `generateCharacterImage`. The current paid procedure resolves
one model, calculates cost with `numImages: 1`, reserves credits, submits one async task,
and persists Character DNA before the user has seen the rendered result. That persistence
point must move to explicit candidate selection for first-time batches.

The Media task contract and most consumers expose one `resultUrl`, even when an image request
accepts `numImages`. Independent tasks are therefore the stable way to provide separate
status, URL, reconciliation, and retry behavior per candidate.

`media.getTask` already reconciles completed/failed async task credits. Feature 134 should
refund only immediate submission failures and must not duplicate terminal reconciliation.

### Skill runtime

`apps/web/server/services/verticalDramaCharacterImageGeneration.ts` loads the
`vertical-drama-character-visual-bible` bundle, validates one normal character prompt pack,
applies deterministic lead-quality checks, derives an approved visual-bible snapshot, and
charges actual LLM usage.

The current Skill internally creates three directions and returns one winner. Candidate mode
must be a distinct lean output contract so count 5 does not multiply all five sheet prompts.
The deterministic runtime can compare canonical face-DNA fields pairwise while leaving all
visual prose authored by the Skill.

Bundle files that must remain synchronized include `SKILL.md`, `skill.md`, input/output
schemas, prompt/contract references as required by the verifier, fixtures, and content tests.

### Persistence

`apps/web/server/services/verticalDramaCharacterStock.ts` owns tenant/user/series-scoped
character asset links. `getPrimaryPortraitUrl` filters strictly on role
`primary_portrait`, so `portrait_candidate` is naturally excluded from identity locking.
Role and metadata are already string/JSONB fields; no migration is required.

The browser contract in `apps/web/shared/verticalDramaSeries/characterAssets.ts` currently
projects no metadata. Add only bounded candidate fields; never expose stored approved DNA.
Dedicated service operations are safer than sending candidate DNA through the existing
open-ended browser `linkAsset` metadata input.

`persistCharacterVisualBible` preserves sibling JSON fields with `jsonb_set`, but atomic
primary promotion requires the candidate-role and character-data updates to share one DB
transaction or transaction-compatible helper.

## Impact analysis

SocratiCode reported:

- `verticalDramaCharacters.ts`: four direct dependents, primarily router tests and the
  location router.
- `verticalDramaCharacterImageGeneration.ts`: eight dependents across the router, location
  service, script, character tests, and quality-agreement tests.
- `VerticalDramaCharacterStockPanel.tsx`: no imported callers; changes are localized to its
  route surface and tests.

No symbol deletion or public rename is planned. Existing normal prompt/image behavior stays
backward compatible.

## Dirty-worktree constraints

The component, router, prompt service, Skill markdown, and Orchestra progress already carry
uncommitted role-quality work. Implementation must use focused patches and file-scoped diffs;
no broad rewrite, staging, reset, or commit is safe.

## Test surfaces

- `server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`
- `server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts`
- `server/services/__tests__/verticalDramaCharacterStock.test.ts`
- a focused new/extended router test beside existing character router tests
- `client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.*`
- Skill bundle `scripts/verify.sh`
- workspace `check` after focused tests
- browser evidence at 390x844, 768x1024, and 1440x900 when authentication/dev server allows

