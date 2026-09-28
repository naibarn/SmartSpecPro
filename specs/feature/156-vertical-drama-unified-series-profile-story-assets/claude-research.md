# Deep-plan Research

## Research decision

- Codebase research: required. This is an existing TypeScript/React/Drizzle
  monorepo and the feature changes a router, persistence, wizard, media
  ownership, and prompt boundaries.
- Web research: not required for the first implementation wave. The spec is
  defined around repository contracts and no new provider contract is being
  introduced; Google Maps/Places adapters are explicitly deferred.
- Testing research: required and completed from the repository. The web app
  uses Vitest, React Testing Library/jsdom for browser-facing unit tests,
  Drizzle schema tests, and Playwright for route/browser proof.

## Codebase findings

### Existing creator flow

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
  owns the six-step wizard and currently exposes separate `seriesFormatKind`,
  look-lock, `visualNarrativeEnabled`, and optional `productTieIn` controls.
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
  owns the stable step IDs: `basic`, `story`, `characters`, `bible`,
  `product`, and `review`. The implementation must preserve these IDs and
  count.
- The wizard currently creates a client workspace ID with a legacy
  `Math.random` helper. The new Source Pack authority must use a server-issued
  or cryptographically random, owner-bound session and must not treat legacy
  IDs as authorization.
- The wizard already has an independent Draft Quality QC/foundation gate. The
  Source Pack gate is additive and must be represented as one combined
  readiness summary so the creator does not encounter two contradictory flows.

### Existing server flow

- `apps/web/server/routers/verticalDramaSeries.ts` contains the canonical
  `verticalDramaSeries.create` mutation, not a separate `createSeries`
  mutation. It creates the series shell and currently accepts `seriesFormat`,
  `lookLock`, `productTieIn`, bible, memory, and draft-QC receipt payloads.
- `updateSeries` handles metadata updates after creation. New normalized Source
  Pack mutations should be pack-scoped and owner/tenant checked rather than
  overloading the series bible JSON.
- `startDraftComposition` already accepts `draftSessionId` and creates a
  durable pre-QC composition job before a series row exists. The new flow must
  resolve the staged Source Pack by that session and inject only a bounded
  server-built digest.
- `synthesizeGenrePreset` is transient preview/synthesis work and must remain
  unable to persist canonical factual claims or Source Pack approvals.
- `generateStoryBible`, `generateStoryBibleDeep`,
  `extendStoryDraftHorizon`, `repairDraftQualityQc`, storyboard handoff, and
  media-prompt paths are downstream gate consumers.

### Existing shared contracts

- `apps/web/shared/verticalDramaSeries/seriesFormat.ts` contains the existing
  seven format kinds. The new twelve-profile registry must map to these as a
  compatibility projection without adding a second creator-facing selector.
- `apps/web/shared/verticalDramaSeries/seriesLookLock.ts` contains the
  fiction-only legacy look enum. Non-fiction profile keys must not be written
  into that enum.
- `apps/web/shared/verticalDramaSeries/visualGrounding.ts` contains strict
  grounding presets. Review profiles need explicit profile-specific contracts,
  not a generic documentary fallback.
- `apps/web/drizzle/schema.ts` already contains managed media asset and
  analysis tables, plus vertical-drama series/character/location/shot
  references. New Source Pack rows should use managed `mediaAssetId` authority
  and normalized tenant/session/series indexes.
- `apps/web/server/services` contains existing draft composition, Draft QC,
  story-generation assurance, credit reservation, and media-asset services.
  The implementation should reuse these boundaries rather than duplicate
  ledgers or provider polling.

## Testing approach

- Focused TypeScript tests: Vitest in `apps/web`, colocated with shared
  contracts, server services, routers, and wizard components.
- Browser-facing component tests: jsdom and React Testing Library, with mocks
  for tRPC/query state and media uploads.
- Schema/migration tests: Drizzle schema tests and a gated DB integration test
  where the environment is available. No destructive production migration is
  run as part of local verification.
- Browser proof: Playwright only after focused tests pass; report separately
  if credentials, running services, or provider media are unavailable.
- Quality gates: `npm --workspace apps/web test -- <focused files>`,
  `npm --workspace apps/web run typecheck`, and Prettier on changed files.

## Fallback note

SocratiCode MCP was not available in this runtime. The research used targeted
`rg`, line-range reads, existing tests, and package scripts instead; this
fallback is recorded so later implementation reviews do not mistake shell
discovery for an indexed graph result.
