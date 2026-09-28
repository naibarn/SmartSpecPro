# Section 03 — Media preview, Marketplace selection, and model catalog

## Ownership

- Marketplace-to-Vertical-Drama managed media conversion.
- Special model catalog compatibility/default behavior.
- Fullscreen preview contract.

## Targets

- `verticalDramaMediaAssetService.ts` / `verticalDramaSpecialReferences.ts`.
- `verticalDramaSpecialModelCatalog.ts`.
- `SpecialTieInEpisodeDialog.tsx` and focused tests.

## Acceptance

Marketplace images can be selected and materialized under the current account;
returned thumbnails render through protected media; every thumbnail has an
accessible fullscreen action; model selectors show valid options or a clear
actionable explanation and never fail silently.
