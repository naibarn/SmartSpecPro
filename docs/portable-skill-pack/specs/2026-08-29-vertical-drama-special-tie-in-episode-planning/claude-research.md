# Deep-plan research — special tie-in episodes

## Research decision

- Codebase research: required because this is an existing TypeScript/React/tRPC/Drizzle
  repository with an established Vertical Drama production flow.
- Web research: not required for the implementation boundary. The named
  `idea-to-video-prompt` skill and Marketplace Capture APIs are local contracts in this
  repository; no external provider behavior is needed to decide the additive design.
- Testing research: use the repository's Vitest suites (`apps/web/package.json`), with
  focused shared/server/router/component tests first and the existing full web test
  command for integration evidence.
- SocratiCode: the configured MCP discovery tools were not available in this runtime.
  Targeted `rg`, line-range reads, package metadata, and existing tests were used instead.

## Existing architecture findings

### Episode and prompt flow

- `apps/web/server/routers/verticalDramaEpisodes.ts` owns the current episode mutations,
  including normal creation, stage generation, start-frame generation, video generation,
  and per-shot prompt generation. Normal `generateNextEpisodes` is Story Bible-driven and
  must keep its current semantics.
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` contains normal story,
  storyboard, start-frame, and motion assumptions, including a nine-logical-shot normal
  duration profile. A special episode must enter only the validated downstream contracts;
  it must not call normal story generation or mutate normal duration profiles.
- `apps/web/server/services/verticalDramaInteractiveJobs.ts` already provides durable
  Redis-backed queued/running/succeeded/failed interactive jobs, ownership scope, active
  dedupe, idempotency, trace IDs, bounded errors, and BullMQ enqueue integration. The
  special adapter can add a closed job kind and a distinct episode scope rather than
  creating a second job system.
- Existing start-frame and motion contracts in
  `apps/web/shared/verticalDramaSeries/contracts.ts` already carry selected image/video
  model IDs and per-shot prompt/artifact data. Special output should populate these same
  fields so the existing storyboard, prompt editing, polling, rendering, download, and
  assembly surfaces remain reusable.
- `VerticalDramaEpisodePage.tsx` and
  `VerticalDramaStoryboardPanel.tsx` already contain prompt editing, asynchronous task
  polling/resume, render controls, credit confirmation, and media display. Special mode
  should be an additive view-mode/episode-kind branch that hides normal story/stage
  actions while retaining shared downstream controls.

### Persistence and migration

- `vertical_drama_episodes` currently has a tenant/user/series scope, normal episode
  number uniqueness, JSONB stage payloads, and additive hand-authored migrations for
  newer episode fields. The feature should add nullable/special-only data and a non-null
  defaulted discriminator using the same migration convention.
- Normal episode numbering is already unique by tenant, series, and `episodeNumber`.
  Special numbering therefore needs an independent per-series sequence/counter or ledger;
  deletion must not make a previously used special sequence reusable.
- Existing location tables and location assets use canonical media-asset IDs rather than
  provider URLs. This is the correct persistence boundary for a generated tie-in scene
  slot.

### Marketplace Capture

- `apps/web/server/routers/marketplaceCapture.ts` exposes authenticated,
  tenant/user-scoped `listProducts` with query, platform, category, sort, cursor, and
  limit, plus `listProductImages` with product filtering and pagination.
- `ProductImagePicker.tsx` is an existing product-image selection primitive, but its
  current capture-oriented shape groups selected IDs by main/description/review and is
  not itself the special dialog. The special flow should reuse/adapt its selection
  behavior through a controlled picker, showing product search/results first and image
  choices second.
- `verticalDramaProductTieIn.ts` has older URL-oriented helpers for normal storyboard
  tie-ins. The special API must not accept a raw URL as the canonical selection. It must
  persist managed media/product-image references and resolve short-lived authorized
  provider URLs only at skill/provider execution time.

### Skill contract

- `apps/web/skills/idea-to-video-prompt/` contains `SKILL.md`, input/UI/output JSON
  schemas, and video-prompt rules. Current skill output is 1–5 shots and current input
  supports product/person/location references, dialogue, and 9:16.
- The current skill contract lists durations 8, 10, 15, 20, 24, and 30 seconds and
  speaker references up to three. Special mode needs an additive adapter contract for
  12 seconds, a 5,000-character idea cap, 1–4 selected dialogue-capable characters,
  optional non-speaking cast/background characters, and per-shot consistency checks.
- Current `skillExecutor.ts` is a generic LLM-only skill invocation path. It does not by
  itself provide the special structured adapter, output schema validation, managed
  reference resolution, model snapshot, or stale-result protection required here.

## Testing conventions found

- Vitest is the repository test runner. Existing suites are colocated under shared,
  server/services, server/routers, client/components, and client/pages.
- Existing Vertical Drama tests cover model selection, prompt generation, location
  references, async job behavior, and storyboard UI. New tests should follow these
  patterns and use dependency injection/fakes for Redis, skill execution, media URLs,
  and provider calls.
- Full typecheck/test runs can be noisy or resource-heavy in this repository; final
  evidence must distinguish focused passing tests from unverified provider, browser,
  migration execution, and deployment boundaries.

## Design implications

1. Add special behavior behind a feature flag and explicit `episodeKind`, with normal
   records defaulting to `normal` and normal router/pipeline branches left untouched.
2. Use a dedicated special creation/reconciliation service and a durable interactive job
   scope `series:{seriesId}:episode:{episodeId}:special`.
3. Keep canonical media references as managed IDs/source metadata; derive authorized
   URLs only for the skill invocation.
4. Persist the skill's structured shot output directly into existing start-frame and
   motion prompt contracts, with an episode-local image model/video model snapshot and
   no read/write to normal series model memory.
5. Reuse the existing episode page/storyboard components and add only special-specific
   entry, input dialog, Marketplace Capture picker, special status, and gating logic.
