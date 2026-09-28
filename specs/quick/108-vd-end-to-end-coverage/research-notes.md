# Research notes

## Discovery method

SocratiCode was not callable in this runtime, so the repository AGENTS.md discovery requirement was handled with bounded `rg`, exact line-range reads, focused test runs, and ownership-aware file inspection. No broad rewrite or source edit was performed.

## Current evidence

### Preset entry points

- `CreateSeriesWizard.tsx` allows zero selections when a premise, basic seed, or lineage seed exists and sends empty `selectedPresetIds` through synthesis.
- `verticalDramaPresetSynthesis.ts` has zero-selection prompt and validation behavior, including no fabricated primary preset.
- Selected presets flow through blend validation, visual identity synthesis, draft application, look-lock, and create.
- Draft QC is started from the current candidate and uses a candidate fingerprint before create.

### Series creation and lineage

- `verticalDramaSeries.create` validates the optional draft-QC receipt when present, validates owned parents, persists lineage columns, and clones the cast inside the create transaction.
- Deep story generation passes `seasonLineage`/memory context for sequel rows.
- `generateNextEpisodesViaLlm` currently receives the child bible and existing episodes but has no explicit lineage context parameter. This is safe only when the child bible already contains all parent facts; it is not an independently enforced contract.

### Special edition references

- Wizard sends `productTieIn.uploadedReferences`.
- Series create registers those attachments as media assets and stores `referenceAssetIds`.
- Special-edition story drafting receives only `hasReferenceImages: boolean`, which is correct for text generation.
- `verticalDramaEpisodePipeline` resolves product image URLs from Marketplace Capture and `productImageUrl`, but not from `productTieIn.referenceAssetIds`.
- `resolveShotProductReferenceUrls` accepts only `https://` values. Numeric media asset IDs are consequently dropped before image generation.
- Existing `resolveMediaAssetUrlsByIds` already demonstrates the required tenant/user-scoped resolver pattern and can be extracted/reused.
- Existing product-reference/provider contracts can carry reference asset IDs, but the episode product-tie-in path does not currently bridge the persisted special-edition IDs into that path.
- `verticalDramaSeries.listProductImages` also omits uploaded `referenceAssetIds`, so the storyboard product-reference picker cannot show or reselect those images after series creation.
- `createAssetFromAttachment` stores a durable relative `/api/storage/files/...` URL for managed uploads, while the current shot resolver accepts only absolute `https://` URLs. The implementation must define a provider-fetchable URL normalization step, not merely convert numeric IDs to strings.
- Special-edition asset registration is best-effort and occurs before the series row is persisted. Partial failure can leave orphaned `media_assets` rows and can produce a persisted special edition with fewer references than the user requested.

### QC and final production

- Draft QC is a hard gate for the modern Wizard path when a receipt is supplied, but the server intentionally keeps legacy/manual create payloads compatible when no receipt is supplied.
- Episode quality review requires script + storyboard, persists a scorecard, and supports repair/re-review. Its own documentation describes it as advisory.
- Tie-in shots have a fail-closed gate when `verticalDramaSeriesTieInQc` is enabled.
- Generic `ProviderRoutingPort.runQc` is optional. The production factory currently returns only `routeAndRenderStage`; the runner therefore has no provider QC result unless a provider result supplies one.
- Final assembly validates clips and render inputs, but there is no single shared mandatory episode-QC gate covering every final paid/render entry point.
- Episode quality-review artifacts currently do not carry a content revision fingerprint. A pass can therefore be read back after script/storyboard/start-frame/clip changes unless the new gate binds the review to a revision hash.
- The Wizard creates a shell and fires full-story generation as a best-effort background mutation after the create response. The plan needs durable admission/progress/failure visibility so “created” is not confused with “story/QC ready”.
- `createVerticalDramaProviderRoutingPort` documents a dry-run-safe path and exposes a `runtime` option, but the current factory does not wire a real runtime or implement `runQc`; the plan must define the production runtime contract and an explicit `unavailable` state rather than treating routing readiness as rendered/QC-passed.

## Focused validation already observed

- Main preset/no-preset/lineage/special-edition/draft-QC/quality-loop/start-frame/storyboard batch: 235 tests passed.
- Supplemental special-edition, tie-in draft, product tie-in, quality-loop, and start-frame batch: 165 tests passed.
- `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` has 56 failures in its 272-test run because several fixtures/mocks no longer match the async pipeline and current preconditions. This must be stabilized separately; it is not used as proof of the two confirmed architectural gaps.
