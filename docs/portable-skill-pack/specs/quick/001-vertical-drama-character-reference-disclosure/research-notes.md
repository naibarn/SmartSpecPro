# Research notes

## Repository and package

- Repository: `/home/dev/projects/SmartSpecPro`
- Web package: `apps/web`
- Package manager: pnpm workspace
- SocratiCode MCP was unavailable in this session; discovery used scoped `rg`
  and targeted reads.

## Current implementation

- Main surface: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`.
- The component already has:
  - `setPrimaryPortrait` mutation for promoting an owned `primary_portrait`.
  - identity-reference picker using `buildReferenceCandidates`.
  - candidate count cards for 1–5 images.
  - existing preview/generate/poll/select candidate batches.
  - a persistent right-side reference panel with its own
    `isReferencePanelCollapsed` state.
- The reference asset list is rendered in the right column while the identity
  picker and casting controls are rendered in the selected-character detail
  column. A shared boolean can coordinate their visibility without changing
  the mutation/API contracts.
- The existing roster portrait uses `resolveCharacterCardPortraitAsset`, so
  the disclosure default must use that same resolver.
- Existing pure-test precedent is
  `VerticalDramaCharacterStockPanel.characterCrud.test.ts`; mounting this
  roughly 9k-line component is deliberately avoided unless needed.

## Risk scan

- No schema, auth, tenant, provider, credit, or migration boundary changes are
  needed.
- Collapsing must not unmount polling logic in a way that stops polling. The
  candidate query/polling state must remain alive; only the visual content is
  conditionally hidden or moved behind the disclosure.
- Dirty checkout contains broad unrelated edits and untracked artifacts; only
  the approved spec/plan files and focused component/test files are in scope.
