# Implementation Plan: Unified Vertical Drama Reasoning Quality

## Objective

Make every LLM-driven action inside Vertical Drama use one consistent, provider-aware
quality policy, while improving story coherence through shared canonical context and
semantic acceptance gates. The implementation must continue safely when a model/provider
does not support the requested reasoning mode.

## Current-codebase fit

The existing code already has three reusable foundations:

1. `verticalDramaEpisodeGenerationSettings.ts` normalizes image and LLM settings and
   contains the first OpenRouter-only reasoning guard.
2. `verticalDramaStoryBible.ts` owns JSON planning retries and forwards
   `extraBodyParams` to `llmRouter.ts`.
3. `llmRouter.ts` owns provider resolution, provider-specific request-body construction,
   raw request delivery, physical attempt observers, and credit-safe execution ordering.

The implementation should strengthen these boundaries rather than create a second LLM
transport. The main gap is that many callers bypass the reasoning helper and do not receive
the persisted series/episode settings.

## User-facing contract

The Series Settings page will show two independent groups:

### LLM group

- selected LLM model (existing control)
- one quality selector: `Balanced`, `High`, `Maximum`
- helper copy: the system automatically adjusts effort by task and falls back safely when
  the selected model does not support a requested level
- effective-capability status: optional non-blocking text such as
  `This model supports up to High`

### Image group

- selected image model (existing control)
- image quality (existing separate control)

No per-stage quality inputs appear in the normal UI. Advanced diagnostics may show the
effective quality in job details, but users do not manage raw provider parameters.

## Canonical data contract

Introduce a normalized internal policy without immediately breaking stored JSON:

```text
VerticalDramaQualityProfile = balanced | high | maximum
VerticalDramaReasoningMode = auto | effort | max_tokens | disabled

VerticalDramaQualityPolicy {
  profile: VerticalDramaQualityProfile
  selectedModelId: string | null
  source: series | episode | default
  version: number
}

VerticalDramaEffectiveReasoning {
  requestedProfile: ...
  taskClass: ...
  modelId: string
  providerName: string
  protocol: openrouter | openai_responses | anthropic_messages | gemini | none
  appliedMode: ...
  effort?: ...
  maxTokens?: number
  extraBodyParams: Record<string, unknown>
  applied: boolean
  downgradeReason?: ...
}
```

Compatibility rules:

- Existing `generationSettings.llm.reasoning.mode/effort/modelId` is read and converted to
  the new normalized profile.
- Existing `llmModelPolicy.defaultModelId` remains the authoritative selected model.
- New writes prefer the profile representation; legacy fields may be written during a
  transition window for old clients.
- Image settings remain untouched and cannot be used to construct an LLM policy.
- Keep the existing JSONB columns; this first release should not add a new relational
  column or migration. Extend the validated JSON shape additively and only introduce a
  migration if production data proves that JSONB compatibility is insufficient.

## Stage policy

Add a server-owned task-class registry. It must be data-driven and testable, not scattered
conditional logic inside individual skills.

Recommended first-release mapping:

| Task class | Balanced | High | Maximum | Notes |
|---|---|---|---|---|
| story_architecture | high | xhigh | max/xhigh | Highest impact on global coherence |
| story_bible / season_plan | high | xhigh | max/xhigh | Canonical source creation |
| episode_script | high | xhigh | xhigh | Dialogue, beats, timeline |
| character_dna / character_variant | high | xhigh | xhigh | Identity and continuity |
| storyboard / continuity_plan | high | xhigh | xhigh | Cross-shot logic |
| semantic_quality_review | high | xhigh | xhigh | Must produce repairable issues |
| start_frame_plan | medium | high | xhigh | Raise when grounded references exist |
| dialogue_audio_plan | medium | high | high | Structured but context-heavy |
| video_motion_prompt | medium | high | high | Prompt translation, not story authorship |
| location_detector / visual_bible | medium | high | high | Use high when reference-grounded |
| clip_dialogue / ad_banner | low/medium | medium | high | Narrow, bounded task |
| extraction / normalization / mapping | disabled/low | low | medium | Reasoning adds little value |

The registry must apply a ceiling: a stage cannot exceed the user-selected profile. For
example, `Balanced` may use `high` for architecture but must not use `xhigh`; `Maximum`
may use `max` only when the model explicitly advertises it.

## Capability and provider adapter design

### Resolver responsibilities

Create a resolver that receives the normalized policy, task class, requested model, and
actual provider candidate. It must:

- load capability metadata for the exact model/provider pair;
- choose the highest valid effort within the stage target and user ceiling;
- prefer `reasoning.effort` when the model supports it;
- use `reasoning.max_tokens` only when the model advertises token-budget reasoning;
- never send both effort and max_tokens;
- return an empty provider payload for unsupported reasoning;
- return diagnostics for audit and UI job detail.

### Adapter responsibilities

Provider adapters translate the effective semantic policy only after the physical provider
candidate is known:

- OpenRouter chat/responses: `{ reasoning: { effort, exclude: true } }` or
  `{ reasoning: { max_tokens, exclude: true } }`.
- Anthropic-compatible messages: provider-native thinking/output configuration only when
  the mapped model advertises it.
- OpenAI Responses: native reasoning object where supported.
- Gemini and non-reasoning providers: omit reasoning unless an explicit adapter contract
  exists.

The transport must call the adapter for every fallback candidate. A payload built for
OpenRouter must never be reused for another provider.

## Shared execution wrapper

Create one Vertical Drama wrapper around the existing planning/LLM execution primitives.
It should own:

1. Resolve series/episode policy and selected model.
2. Resolve task class and target quality.
3. Resolve actual provider candidate.
4. Build effective reasoning adapter payload.
5. Call `executeJsonPlanningCallWithRetry`, vision-aware equivalent, or generic skill
   fallback through one typed interface.
6. Re-apply the adapter on provider/model fallback.
7. Handle one bounded capability downgrade retry when the provider returns a parameter-
   unsupported 400.
8. Return model, provider, effective quality, downgrade reason, usage, and parsed result.

All 33 JSON-planning paths and the 17 generic/direct LLM paths found by the audit must be
classified. Each in-scope path must either migrate to the wrapper or be explicitly marked
`non_reasoning_deterministic` with a test proving why it is excluded.

## Story-quality architecture

Reasoning alone will not fix contradictory stories. Add a versioned Story Truth Package
used by all story-producing and story-reviewing stages. It should contain bounded, typed
facts:

- series premise, genre, audience, tone, and narrative promise;
- character registry, role, age, relationships, identity constraints, and approved DNA;
- locations, visual identity, props, and reference provenance;
- season/episode timeline and known story state;
- locked facts and unresolved questions;
- source version and producer input version.

Each stage receives only the relevant compact projection plus previous authoritative outputs.
Downstream stages must not silently replace locked facts. The package is versioned and
included in stage receipts so stale outputs cannot be presented as current.

### Quality loop

For quality-critical stages:

1. Generate structured draft with the stage profile.
2. Run deterministic checks: schema, required entities, timeline ordering, speaker/character
   membership, continuity anchors, and source-version match.
3. Run semantic critic using the stage's review profile.
4. If blocking issues exist, send a targeted repair prompt containing only the issues and
   relevant context.
5. Re-run deterministic and semantic gates.
6. Persist only an accepted artifact; retain rejected attempts as bounded diagnostics.

Retry limits must be explicit. A retry that repeats the same prompt and same settings is
not considered a repair strategy.

## Failure and fallback policy

### Unsupported reasoning

- Detect before request whenever capability metadata is available.
- If the provider still returns an unsupported-parameter response, retry once without the
  reasoning field or at the highest known supported level.
- Mark the result as downgraded; do not charge for a failed attempt and do not deduct twice
  for the accepted result.

### Provider failure

- Re-resolve provider-specific payload for each provider candidate.
- Preserve the selected model pin unless the existing model-fallback policy explicitly
  permits a different model.
- If a different model is selected by policy, recompute capability and effective quality.

### Timeout / malformed output

- Keep existing bounded transport and schema retry budgets.
- Use targeted repair for semantic failures.
- Do not increase retry counts merely because the user selects Maximum.

### Database/settings failure

- Use normalized safe default `Balanced`/`auto` for non-explicit missing settings.
- If an explicit model pin cannot be resolved, preserve the existing fail-closed model
  selection behavior and return an actionable error before spending credits.

## Cost, latency, and concurrency budgets

- Capability metadata lookups should be cached for the lifetime of one logical skill run;
  do not query the model catalog once per retry or per shot.
- A quality profile changes the request policy, not the retry count. Existing bounded
  physical, schema, transient, and semantic-repair budgets remain hard limits.
- Compact Story Truth projections are mandatory. Do not attach the full series history to
  every shot-level call.
- Each logical skill run must expose an estimated maximum call count and timeout budget in
  diagnostics before the first paid request where the current product already exposes
  readiness/credit confirmation.
- Parallel work is allowed only for independent tasks with independent credit reservations;
  continuity-critical stages remain sequential so later stages cannot race stale story
  state.

## Security and data boundaries

- Series and episode policy reads/writes must retain the existing tenant/user ownership
  predicates; a quality setting is not a cross-tenant model or prompt capability.
- Story Truth projections may include only authorized series facts and managed media
  references already allowed to the caller. Do not turn the new wrapper into a reference
  URL bypass.
- Audit metadata must be redacted: no API key, full prompt, raw reasoning text, private
  reference URL, or unbounded model response may be written by this feature.
- Provider error normalization must expose a stable user-safe category while retaining a
  bounded internal diagnostic id for operators.

## Observability and error UX

Record, without prompt or raw reasoning content:

- requested profile;
- task class;
- effective effort or token budget;
- provider/model actually used;
- reasoning applied or downgraded;
- downgrade reason;
- fallback attempt ordinal;
- schema/semantic gate result;
- story truth version.

Errors shown to users must identify the actual provider/model and distinguish:

- unsupported quality setting (recoverable downgrade);
- provider unavailable (retry/fallback);
- invalid output (repair exhausted);
- credit/authorization failure (no retry).

## File and module workstreams

### Backend policy and adapter

- Extend `apps/web/shared/verticalDramaSeries/generationSettings.ts` with the normalized
  quality profile and compatibility normalization.
- Add a focused policy/capability module near
  `apps/web/server/services/verticalDramaEpisodeGenerationSettings.ts`.
- Add provider adapter types and OpenRouter/Responses/Messages/Gemini mapping near
  `apps/web/server/services/llmRouter.ts` or a dedicated adapter module.
- Extend `apps/web/server/services/llmProviderCatalog.ts` / enabled model loading only as
  needed to expose supported efforts, max-token support, and mandatory reasoning.

### Shared wrapper and call sites

- Add the wrapper beside `verticalDramaStoryBible.ts` so it can reuse existing planning
  retry and vision-aware functions.
- Migrate Script, Storyboard, Start Frame, Dialogue, Video Motion first as regression
  anchors.
- Migrate Character Prompt/Visual Bible, Character Variant, Location, Special Tie-in,
  Episode Quality Review, Series Memory, Ad Banner, Shot Image Action, and all remaining
  LLM-driven Drama services.
- Add a manifest/coverage test listing every registered Vertical Drama LLM skill and its
  wrapper entry point.

### Story quality

- Add shared Story Truth Package types, projection builders, version checks, and semantic
  issue contracts under `apps/web/shared/verticalDramaSeries/`.
- Integrate with existing script/storyboard/character/quality-review persistence without
  deleting or rewriting user-authored dialogue or approved assets.

### UI and router

- Update `VerticalDramaSettingsTab.tsx` to show one LLM quality profile and separate image
  quality controls.
- Update the series settings mutation to validate and persist the normalized policy while
  preserving existing model-policy and episode-copy behavior.
- Add effective-quality/downgrade detail to the job/detail surface without showing raw
  reasoning.

## Delivery order

1. Add policy types, capability fixtures, and adapter contract tests.
2. Implement resolver and provider adapters with exact request-body tests.
3. Implement shared wrapper and migrate the five already-wired episode stages.
4. Migrate all remaining LLM-driven Drama skills using the coverage manifest.
5. Add Story Truth Package and deterministic/semantic quality gates.
6. Update settings UI, validation, localization, and new-episode propagation.
7. Run focused tests, full relevant checks, browser verification, and non-paid provider-
   mocked smoke tests.
8. Run one controlled real-provider smoke only after deployment/configuration review, using
   a low-cost model and a deliberately small test input.

## Acceptance criteria

- One visible LLM quality profile is persisted at series level and copied to new episodes.
- Existing image quality remains independent.
- Every in-scope Drama LLM call is covered by the wrapper manifest or explicitly excluded
  with a reason and test.
- OpenRouter requests contain exactly one supported reasoning control when applicable.
- Unsupported models/providers never fail only because of the reasoning setting.
- Provider fallback recalculates the payload and never leaks OpenRouter-specific fields.
- Requested/effective quality and downgrade reason are observable.
- Story output cannot pass solely because JSON is valid when blocking semantic continuity
  issues remain.
- No duplicate credit deduction occurs across capability downgrade or retry.
- Settings UI is understandable in Thai and English and passes mobile/tablet/desktop QA.
- Focused, integration, typecheck, and browser gates are documented separately.
