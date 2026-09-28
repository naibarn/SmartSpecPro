# Feature 160 Deep-Plan Research

## Research decision

- Codebase research: required because this is an existing git repository with a TypeScript/React web application, Drizzle PostgreSQL schema, tRPC routers, managed media storage, and an established Vertical Drama pipeline.
- Web research: required for implementation guardrails around tRPC input validation, Drizzle transactions/indexes, and browser video metadata/timeline behavior.
- Testing research: required; the repository uses Vitest for server/client unit tests and Playwright for browser evidence.
- SocratiCode: unavailable in this runtime. Research used targeted `rg`, line-range reads, existing tests, and schema inspection instead. Any implementation plan that changes shared routers, schema, or exported contracts must repeat the intended impact check with available repository tooling before editing.

## Codebase architecture findings

### Existing source-pack foundation

Feature 156 is already implemented in:

- `apps/web/drizzle/schema.ts`
  - `vertical_drama_source_pack_sessions`
  - `vertical_drama_source_packs`
  - `vertical_drama_source_assets`
  - `vertical_drama_source_slots`
  - `vertical_drama_source_analyses`
  - `vertical_drama_source_pack_audit_events`
- `apps/web/server/services/verticalDramaSourcePackService.ts`
  - draft session creation and staged pack loading
  - source slot persistence
  - source asset persistence
  - rights/readiness checks
  - stored digest and B-roll manifest projections
  - atomic attach into series creation
- `apps/web/server/routers/verticalDramaSeries.ts`
  - source-pack session, read, slot/asset mutation, attach, and series creation procedures
- `apps/web/shared/verticalDramaSeries/sourcePack.ts`
  - shared validation and source-pack contract types
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
  - existing source-pack step and persistence behavior

The safest implementation is additive: preserve the source-pack identity and attach transaction, then add media modality/provenance/segment metadata and visual-canon snapshots around it. Do not replace the existing source pack or overload `productTieIn`/episode JSONB.

### Managed media and ownership

The repository treats `media_assets` and managed storage URLs as the durable media registry. Vertical Drama source assets reference `mediaAssetId`; shot references also require a canonical `mediaAssetId`. Existing services and tests enforce tenant/user ownership boundaries and provider URL durability rules. New source-media and B-roll records must therefore reference canonical media assets and must fail closed when tenant identity or owner scope is absent.

### Story generation and deep-story entry points

Relevant code paths are concentrated in:

- `apps/web/server/services/verticalDramaStoryBible.ts`
  - `generateStoryBible`
  - `generateStoryBibleDeep`
  - premium deep generation and resume/chunk flows
  - `userPremise` propagation and persisted story outputs
- `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`
  - run contract, source revision/fingerprint, snapshot, checkpoints, validation reports, and finalization fields
- `apps/web/server/routers/verticalDramaSeries.ts`
  - story-generation procedures and durable async job execution
  - existing source-pack digest/B-roll manifest admission near story generation
- `apps/web/server/services/verticalDramaStoryArchitecturePlanner.ts`, `verticalDramaStoryboardGeneration.ts`, and `verticalDramaStartFrameGeneration.ts`
  - architecture, storyboard, shot prompt, and start-frame boundaries

The implementation must pass one immutable visual-source snapshot into standard draft, deep draft, premium, retry, resume, start-frame, and shot-prompt paths. Existing run-level `sourceRevision/sourceFingerprint/sourceSnapshotJson` are the correct place to fence stale work; new records should extend this contract instead of creating a second run identity.

### Shot references and assembly boundaries

- `apps/web/drizzle/schema.ts` defines `vertical_drama_shot_references` for canonical image/reference assets.
- `apps/web/server/services/verticalDramaShotReferences.ts` owns reference manifest loading and tenant-safe persistence.
- `apps/web/server/services/verticalDramaAssembly.ts` builds episode assembly manifests and currently expects generated clip sources.
- `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts` resolves clips, storage URLs, ffmpeg probing, and durable assembly behavior.

The spec's B-roll requirement must not turn `vertical_drama_shot_references` into a mixed image/video timeline. Add a typed B-roll binding/projection and integrate it at the assembly boundary, keeping reference rows for image/reference conditioning and keeping exact video segment in/out values in the B-roll contract.

### Client surfaces and test conventions

- Series creation/source-pack UI is in `CreateSeriesWizard.tsx` and source-pack components under `client/src/components/verticalDramaSeries`.
- Series planning and story generation UI is in `VerticalDramaSeriesDetailPage.tsx` and its tests.
- Episode shot/start-frame/reference/B-roll-adjacent UI is in `VerticalDramaEpisodePage.tsx`, `VerticalDramaEpisodeWorkspace.tsx`, and `VerticalDramaStoryboardPanel.tsx`.
- Server and client tests use Vitest. Browser evidence uses Playwright through `apps/web/playwright.config.ts` and existing `tests/e2e` suites.
- Existing test patterns mock tRPC hooks and service dependencies, assert owner/tenant behavior, and use focused test commands rather than the whole monorepo test command.

## Web research findings

### tRPC input validation and procedures

Use the existing tRPC router/procedure conventions and keep all new inputs schema-validated on the server. The implementation should accept only bounded IDs, revisions, enums, timestamps, and segment bounds; never accept model-provided URLs, tenant IDs, or evidence status as authoritative.

Source: https://trpc.io/docs/server/procedures

### Drizzle transactions and constraints

Use a Drizzle transaction for operations that update a source slot, snapshot/revision, dependent bindings, and stale markers together. Use explicit composite indexes/unique constraints for owner scope, source pack/slot identity, idempotency keys, and active binding uniqueness rather than relying on application-only checks.

Sources:

- https://orm.drizzle.team/docs/transactions
- https://orm.drizzle.team/docs/indexes-constraints
- https://orm.drizzle.team/docs/get-started-postgresql

### Browser video metadata and timeline input

Video duration is available only after media metadata is loaded and may be unknown (`NaN`) or indefinite (`Infinity`). The UI must therefore keep segment editing disabled until metadata is ready, validate finite non-negative in/out values client-side, and repeat the same validation server-side. Use the existing managed media URL/proxy and do not expose provider URLs as the durable binding.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video

## Testing approach

- Unit/server: Vitest, focused files under `apps/web/server/**/__tests__`.
- Client: Vitest with jsdom/happy-dom and Testing Library patterns already used by Vertical Drama pages/components.
- Schema: existing Drizzle migration/schema tests; add migration contract tests without requiring destructive live backfills.
- Browser: Playwright evidence for the dialog flow, source media upload/segment binding, story propagation, news evidence/correction, and final B-roll readiness.
- Validation order: focused tests → `pnpm --dir apps/web typecheck`/existing typecheck script → targeted lint/format if configured → relevant Playwright project. Full suite remains a final integration check and baseline failures must be separated from feature failures.

## Planning implications

1. Prefer additive shared contracts over new parallel media systems.
2. Implement schema/contract and deterministic resolver gates before UI generation controls.
3. Treat user-uploaded stills/video as first-class source media, but treat AI-origin media as illustrative by default and never as news evidence.
4. Keep prompt expansion preview separate from apply; use compare-and-swap and return to the existing flow after confirmation.
5. Make `news_report` a separate editorial profile using shared source/media infrastructure, with stricter evidence, freshness, attribution, and correction gates.
6. Build the implementation in dependency order so draft/full/deep story propagation receives a stable snapshot before start-frame and assembly integration.
