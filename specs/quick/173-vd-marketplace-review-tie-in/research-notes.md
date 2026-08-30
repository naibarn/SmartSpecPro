# Research notes

- Existing Special Tie-in UI: `apps/web/client/src/components/verticalDramaSeries/SpecialTieInEpisodeDialog.tsx`.
- Existing Special Tie-in server path: `verticalDramaEpisodes` router,
  `verticalDramaSpecialEpisodes.ts`, `verticalDramaSpecialSkillAdapter.ts`,
  and `specialTieInContracts.ts`.
- Existing Marketplace product/image access is in
  `marketplaceProductService.ts` and `marketplaceCapture.ts`.
- Confirmed screenshot error path: `materializeMarketplaceImageReference()`
  passes a Marketplace `/api/storage/files/...` URL into
  `ingestVerticalDramaMediaAsset()`. The latter treats every such URL as an
  already-registered Vertical Drama media asset and throws when the key exists
  only in Marketplace storage.
- Model selector currently filters the special catalog by exact requested
  duration, 9:16, reference capacity, start-frame support, and native dialogue.
  The default 10-second UI state can therefore produce an empty video list when
  the DB/static model metadata only advertises 8 seconds. Unknown image
  reference capacity is also treated as one image, which can hide usable models.
- `AuthenticatedMediaImage` already supports protected media but the special
  dialog does not return/use the materialized managed URL and has no reference
  lightbox/fullscreen control.
- Skill folder sync/import already makes a valid `skill.md` appear in Admin
  Skills; the new skill should use the same YAML frontmatter and JSON schema.
- Existing `vertical-drama-special-edition-planner` and
  `vertical-drama-product-tie-in-planner` are adjacent capabilities, but neither
  owns the requested three-card Marketplace-to-series review story output.
- Existing character and location reconciliation code can be extended with
  explicit pending slot-request records/inputs; existing approved looks/scenes
  must remain untouched.
- SocratiCode MCP was unavailable in this session, so discovery used targeted
  `rg` and line-range reads instead.
