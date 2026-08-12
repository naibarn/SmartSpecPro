# Implementation plan: Vertical Drama end-to-end coverage hardening

## Objective

Make all supported creation modes follow one durable contract from input selection through story generation, episode creation, media reference attachment, episode QC, repair/re-review, and final assembly. The completion bar is not merely “the wizard submits”; each mode must preserve its governing facts at every downstream boundary and must fail with an actionable state when a required fact or QC result is missing.

## Current-codebase fit

The existing architecture already has the correct seams:

- Wizard synthesis and draft fingerprinting in `CreateSeriesWizard.tsx`.
- Series create and lineage ownership/transaction logic in `verticalDramaSeries.ts`.
- Product tie-in config construction in `verticalDramaProductTieIn.ts`.
- Tenant/user-scoped media URL resolution patterns in `verticalDramaEpisodes.ts`.
- Start-frame product mapping in `verticalDramaEpisodePipeline.ts`.
- Episode repair/re-review in `verticalDramaEpisodes.ts` and `verticalDramaQualityLoop.ts`.
- Provider routing seam in `verticalDramaEpisodePipeline.ts` / `verticalDramaProviderRouting.ts`.

The implementation should extend these seams rather than introduce a parallel creation flow.

## Workstream 1 — Canonical product-reference resolution

### Targets

- `apps/web/server/services/verticalDramaProductTieIn.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- Prefer a new focused service such as `apps/web/server/services/verticalDramaProductReferenceResolver.ts` if importing router-private helpers would create a cycle.
- `apps/web/server/routers/verticalDramaSeries.ts`

### Changes

1. Add a canonical resolver that accepts the persisted tie-in config plus `{tenantId, userId}` and returns:
   - resolved uploaded-reference URLs from `referenceAssetIds`;
   - Marketplace Capture selected URLs;
   - direct `productImageUrl`;
   - deduplicated, capped output with a documented priority order.
2. Resolve uploaded IDs with the existing ownership pattern (`tenantId`, `userId`, non-expired) and preserve durable storage URLs.
3. Use this resolver in the pipeline's `start_frame_render_plan` mapping. Ensure the resulting frame references reach both start-frame image generation and video clip reference inputs.
4. Preserve the storyboard picker override semantics: an explicit user-cleared/customized frame must not be overwritten by automatic re-resolution.
5. Normalize managed asset URLs into provider-fetchable durable/signed URLs; do not pass relative application URLs or raw storage keys to external providers.
6. Change special-edition upload registration from silent best-effort to an all-requested-assets success contract. Stage the asset rows, validate every requested upload, and either commit the complete reference set or run compensating cleanup/mark a recoverable orphan task.
7. Validate any API-provided `referenceAssetIds` before persistence; do not trust arbitrary client IDs.
8. Extend `listProductImages` and its UI picker to include uploaded references so the user can see, select, clear, and audit the actual images used after reload.
9. Add structured observability for `requested`, `resolved`, `missing`, `trimmed`, `not_fetchable`, `customized_override`, and cleanup outcomes.

### Acceptance

- An uploaded special-edition image appears in the generated start-frame request as an owned durable URL.
- Cross-tenant/user asset IDs resolve to no URL and cannot be used.
- Marketplace, direct URL, uploaded, and mixed sources follow the documented cap/priority rule.
- A failed upload cannot silently produce a special edition that proceeds without the requested reference.
- The picker after reload shows the same persisted uploaded references that generation can use.
- Every provider-bound reference is fetchable and owned; no relative/private URL leaks out.
- Legacy direct product URLs continue to work byte-for-byte where no uploaded IDs exist.

## Workstream 2 — Explicit lineage contract for every sequel route

### Targets

- `apps/web/server/services/verticalDramaEpisodeContinuation.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaScriptGeneration.ts` if the episode script path needs the same context.
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`

### Changes

1. Create a bounded, serializable `EpisodeLineageContext` derived from the child series' stored lineage plus current series memory.
2. Pass it explicitly to `generateNextEpisodesViaLlm` and render it in a clearly bounded prompt block alongside the child bible and existing episode summaries.
3. Keep parent facts authoritative: carried relationships, written-out characters, open thread IDs, canonical facts, visual identity/look-lock, and season number. Do not send the full parent episode list.
4. Ensure special edition uses the same parent lineage context while keeping its 1–2 episode and allowed-story-function constraints.
5. Add tests for S2 and S3-style child rows, parent-memory-present, parent-memory-absent, deleted-parent snapshot fallback, and direct continuation without first regenerating the full story bible.
6. Make the post-create full-story job durable: persist queued/running/succeeded/failed state, expose retry, and ensure the UI does not imply story/QC readiness from shell creation alone.

### Acceptance

- Every sequel/special creation path has lineage context before story synthesis.
- Every direct episode-continuation path receives lineage context without requiring a parent DB read at generation time.
- No original-mode prompt or payload changes when lineage is absent.
- No parent cross-tenant data can enter the child or continuation prompt.

## Workstream 3 — Unified QC policy and enforcement

### Targets

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaQualityLoop.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaProviderRouting.ts`
- Relevant UI: `CreateSeriesWizard.tsx`, `VerticalDramaStoryboardPanel.tsx`, production wizard state components.

### Changes

1. Introduce one server-side `resolveVerticalDramaProductionQcGate` policy function. It must distinguish:
   - draft/story QC;
   - episode script/storyboard quality review;
   - tie-in naturalness QC;
   - structural/provider routing QC;
   - artifact/visual QC availability.
   Persist the evaluated candidate/episode revision, policy version, and gate decision in the existing run/artifact ledger so a stale review cannot unlock a changed script, storyboard, reference set, or clip pack. Define the revision hash inputs explicitly for draft, episode, visual-plan, and final-assembly gates.
2. Enforce the policy at every paid or irreversible entry point: start-frame render, video clip render, and final assembly. Do not rely only on UI state.
3. Keep `dry_run`, `plan_only`, preview, and legacy grandfather behavior explicit; never label absent visual QC as a pass.
4. Close the create API bypass for new creation flows. Add an explicit server-recognized modern workflow/contract marker; new Wizard/direct generated-draft requests must carry a valid owner-scoped draft-QC receipt and matching candidate fingerprint, or receive a precondition error. Provide a named, audited, time-bounded compatibility marker only for existing/manual migration callers.
5. Keep the existing repair → re-review loop as the canonical remediation. The gate should return the latest blocking reasons and the exact action (`run QC`, `apply repair`, `re-review`, `resolve tie-in`, or `repair missing reference`).
6. Extend `ProviderRoutingPort` so production mode wires the configured runtime and returns an explicit QC outcome or an explicit `unavailable` result. A successful routing decision without a rendered artifact and artifact QC must not be interpreted as final media QC. Remove the ambiguity around the currently unused `runtime` option.
7. Add audit events for gate pass, block, explicit override, unavailable QC, and legacy compatibility bypass.
8. Update UI status cards to show one consistent state model and avoid presenting advisory review as final approval.

### Acceptance

- A new series cannot bypass draft QC by calling the create mutation without a receipt.
- A paid start-frame/video/final assembly request cannot proceed when mandatory episode QC is missing or below policy floor.
- A review for an older script/storyboard/reference revision cannot unlock a newer revision.
- A provider-routing `ready` result without a real artifact is visible as planned/unavailable, never succeeded/passed.
- Shell creation and story/QC readiness are shown as separate durable states with retry on generation failure.
- Tie-in QC remains an additional fail-closed rule when enabled.
- Repair and re-review make the same gate pass without a second bespoke path.
- Every blocked state is actionable and owner-scoped.

## Workstream 4 — Regression, integration, and rollout proof

### Targets

- Existing Vertical Drama unit/router tests.
- New focused tests near the resolver, lineage continuation, QC gate, and provider port.
- A production-like integration fixture using tenant/user ownership, DB, Redis draft-QC receipt, and queued episode stage state.

### Changes

1. Add a mode matrix test covering:
   - original/no preset with premise;
   - original/no preset with only basic facts;
   - selected single preset;
   - selected multi-preset blend;
   - sequel S2 with and without live parent memory;
   - S3/deleted-parent snapshot;
   - special edition with no image, Marketplace image, direct URL, and uploaded image.
2. Add end-to-end propagation assertions from wizard payload to persisted series JSON, story prompt context, start-frame plan, image generation request, video request, QC report, and assembly gate.
3. Add negative tests for empty input, stale draft fingerprint, unowned reference asset, missing uploaded asset, missing lineage parent, missing episode QC, failing tie-in QC, and unavailable provider QC.
4. Add lifecycle tests for partial upload failure, cleanup/idempotent retry, relative managed URLs, picker reload parity, and post-create story-job failure/retry.
5. Stabilize `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` by updating its async-job and precondition fixtures, then keep its full suite as a required regression gate.
6. Run focused Vitest, `git diff --check`, changed-file typecheck/lint, and a browser/manual evidence pass for Wizard + storyboard QC states.
7. Roll out in this order: resolver in shadow mode → picker parity → special-upload lifecycle hardening → durable story-job status → lineage direct-continuation gate → draft create gate → episode production-QC gate → final assembly enforcement.

## Risks and mitigations

- **Asset URL exposure:** use tenant + user filters and existing durable URL rules; never return arbitrary asset rows.
- **Reference-cap regressions:** test priority and explicit picker overrides against each model's `maxReferenceImages`.
- **Legacy data deadlock:** grandfather existing rows and give users a repair/review action rather than silently failing.
- **Async race:** gate against the latest episode row and review artifact immediately before paid work; use idempotency keys and revision checks.
- **Flag drift:** resolve the gate policy once per mutation and persist the resolved policy/version in the run artifact.
- **False QC confidence:** distinguish structural routing QC, advisory review, and actual artifact QC in both API and UI.

## Definition of done

- All mode-matrix tests pass.
- Uploaded special-edition references are demonstrably present in provider-bound requests.
- Direct sequel continuation carries bounded lineage facts.
- New create and production entry points cannot bypass mandatory QC.
- Repair/re-review and tie-in defer paths remain functional.
- Focused tests pass and the known async-router suite is either fixed or explicitly documented as a separate baseline blocker.
