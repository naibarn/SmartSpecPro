# Implementation Plan

## Objective

Implement reference-guided casting candidates using `character-candidate-prompt` while preserving the no-reference path and existing preview → batch → image task → polling → selection lifecycle.

## Workstreams

### 1. Skill adapter

Add a focused service that loads/syncs the named skill, builds a facts-only JSON input plus optional additional instructions, resolves the skill execution policy, sends multimodal reference images, validates non-empty plain text, and settles exactly one skill run. Export pure builders and bounded option types for unit tests.

### 2. Candidate persistence and router

Extend `previewCharacterPrompt` input with casting options and reference asset-link IDs. In candidate mode, branch only when reference IDs are present; validate and resolve assets under the existing owner. Call the new adapter with authoritative character facts. Create 1–5 draft rows from the returned prompt, marking them reference-guided and omitting DNA snapshot.

Extend private candidate metadata and claim/preflight projections with optional reference asset IDs and mode/options. At submit time resolve references again, pass them to normal image generation and Hermes references, keep one output per candidate, and retain existing credit reservation/polling behavior. Make selection conditional: write DNA only when a snapshot exists.

### 3. UI and tests

Add casting controls above the existing generate button: reference-guided explanation, lock clothing, pose radio, camera framing select, optional additional-instructions textarea, and existing count selector. Send only the new fields in candidate preview. Keep no-reference generation on the old path. Add focused client/server/service tests for both branches and copy/state behavior.

## Target files

- `apps/web/server/services/verticalDramaCharacterReferenceCasting.ts` (new)
- `apps/web/server/services/verticalDramaCharacterStock.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- related focused tests beside each module
- `apps/web/client/src/lib/i18n/locales/{th,en}.ts` only if existing local copy conventions require keys

## Acceptance criteria

1. With no reference asset, existing preview and candidate batch behavior is unchanged.
2. With one or more owned references, the adapter calls `character-candidate-prompt` with image count, lock clothing, pose, framing and optional instructions.
3. Unowned/foreign asset IDs cannot be used.
4. Candidate images are independent single-image tasks and use the validated reference assets.
5. The user sees explicit new-person/guideline copy and can choose 1–5 candidates.
6. Selecting a prompt-only candidate promotes the image without overwriting existing Character DNA.
7. Existing snapshot-backed candidates still select and persist DNA as before.
8. Focused tests and diff checks pass; baseline-wide typecheck noise is reported separately.

## Rollback

The branch is additive and activated only when reference IDs are present. Removing the new branch/metadata fields restores the old path; no database migration or destructive data operation is required.
