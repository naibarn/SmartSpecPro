# Vertical Drama Episode Quality Settings Design

## Status

Approved for implementation by the user on 2026-09-10. The user requested autonomous completion, focused tests, and real provider verification where safe and authorized.

## Goal

Allow each Drama Series episode to configure two independent quality controls:

1. Image quality, forwarded as the provider-specific `quality` input when the selected image model exposes it (for example GPT Image 2.5 quality levels).
2. LLM reasoning quality, forwarded to the selected skill/model when the model and provider support reasoning. OpenRouter is the primary LLM transport and uses its unified `reasoning` request object.

An episode setting is durable for that episode. Saving a setting also updates the series default used only when creating future episodes. Existing episodes are not rewritten and must not start inheriting a later series-default change.

## Current-code fit

- Episode image/video model selection already persists inside `startFramePlan` and `motionPromptPack` through `setEpisodeModelSelection`.
- `media_models` already exposes `thinkingModeDefault`, `thinkingModes`, and dynamic `configJson.inputFields`, including quality metadata for GPT Image 2.5 catalog rows.
- `generateImageAsync` already has an `extraParams` -> provider `extra_params` path and model default input parameters.
- Vertical Drama LLM calls already resolve through `resolveVerticalDramaSeriesModel`; LLM catalog rows expose `supportsThinking`, and the OpenRouter request config allows `reasoning` passthrough.
- Episode creation is centralized by `insertEpisodeWithSafeNumber`, which is used by plain creation and continuation/materialization paths.

## Data contract

Add an optional `generationSettings` JSONB object to both series and episode rows. The shared contract is intentionally additive and forward-compatible:

```ts
type VerticalDramaEpisodeGenerationSettings = {
  image?: {
    quality?: string | null;
    modelId?: string | null;
  };
  llm?: {
    reasoning?: {
      mode: "auto" | "effort";
        effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      modelId?: string | null;
    };
  };
};
```

`image.quality = null` and `llm.reasoning.mode = "auto"` mean no episode-level override. The model's/provider's default remains authoritative. `modelId` is a provenance guard: an image quality value is only applied when it matches the currently resolved image model; otherwise the UI presents the selected model's default and the runtime omits the stale value.

The LLM model itself remains selected by the existing Vertical Drama series model policy/resolver. This feature adds an episode-level reasoning override, not a second per-episode model selector.

## OpenRouter reasoning behavior

For an explicit effort, the runtime sends exactly one unified object:

```json
{
  "reasoning": {
    "effort": "high",
    "exclude": true
  }
}
```

The adapter uses `effort` only in this first version; it never sends `effort` and `max_tokens` together. The supported UI vocabulary covers OpenRouter's effort levels except `none` (which is represented by Auto/omission): `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. `auto` omits the episode override. The effort selector is filtered by model capability metadata when available. Unsupported or mandatory constraints are enforced server-side before a paid/LLM call. `exclude: true` keeps provider reasoning tokens out of the user-facing result while preserving internal reasoning.

When an explicit episode reasoning override is present, the request builder must not also inject a second legacy thinking field from the skill policy. When the episode is `auto`, existing skill policy behavior remains unchanged.

## Image quality behavior

The UI derives selectable values from the selected model's declared quality field or `thinkingModes`. The server validates the selected value against the current model catalog. A supported value is passed as `extraParams.quality`, allowing the existing media-generation transport to place it in the provider payload. Models without a quality capability receive no explicit quality value and continue using their provider/catalog default.

No provider is silently substituted. If a selected model becomes unavailable, the existing model-selection validation remains responsible for that failure; a stale quality value is ignored rather than applied to a different model.

## Persistence and inheritance

- Add nullable `generationSettings` columns to `vertical_drama_series` and `vertical_drama_episodes` with an idempotent manual migration, matching this repository's existing manual-migration convention.
- `setEpisodeGenerationSettings` authenticates and ownership-checks both series and episode, validates model-specific capabilities, then transactionally updates the episode row and the series default.
- `insertEpisodeWithSafeNumber` receives a snapshot of the series default and writes it into the new episode row. All creation paths use this helper, so Mode A and Mode B continuation inherit the same default.
- Existing episode rows remain unchanged. A null episode setting resolves to built-in auto behavior, not the current series default, preventing retroactive changes.
- Changing a setting never regenerates media or spends credits. It affects only subsequent runs.

## UI/UX contract

### Target user / JTBD

- Role: Drama Series creator.
- Goal: Tune image rendering quality and LLM reasoning independently for one episode.
- Entry point: Episode workspace settings area near the existing image/video model controls.
- Success: The selected values survive reload, are visibly separate, affect the next run, and become defaults for newly added episodes.

### Existing pattern reference

- Reuse the existing episode model selectors and dynamic input metadata in `VerticalDramaEpisodePage.tsx`, `VerticalDramaEpisodeWorkspace.tsx`, and `VerticalDramaStoryboardPanel.tsx`.
- Reuse existing Radix Select/Label/Tooltip styling and the page's Thai/English copy conventions.
- Do not create a second generic model-settings dialog or duplicate paid confirmation. Saving is free.

### Surface inventory

| Surface | Change |
|---|---|
| Episode workspace header/settings | Add independent Image quality and LLM thinking controls. |
| Episode detail query | Return effective settings and capability options. |
| Episode creation | Snapshot series defaults into new rows. |
| LLM/image runtime | Consume validated episode settings. |

### State matrix

| State | Expected behavior |
|---|---|
| Loading | Controls show existing loading treatment and do not send partial values. |
| Auto/default | Show provider/model default; no explicit override is sent. |
| Supported | Show selectable values and persist immediately on change. |
| Unsupported | Disable the control with a clear explanation; preserve existing generation behavior. |
| Saving | Disable only the changed control and show existing save feedback. |
| Save error | Revert optimistic state and show the server error. |
| Model changed | Re-evaluate the quality options; never apply a stale value to a different model. |

### Responsive and accessibility acceptance

- Keep the controls usable at 390x844, 768x1024, and 1440x900 without horizontal overflow.
- Every control has an associated label, keyboard navigation, visible focus state, and disabled explanation.
- Use existing semantic colors/tokens and existing component primitives; no global reset or raw color system changes.
- Respect reduced-motion behavior already used by the workspace.

## Failure, security, and cost boundaries

- All mutations use existing tenant/user ownership helpers.
- Capability validation happens server-side even if the UI hides unsupported options.
- No provider call occurs during setting save.
- Real provider verification, if run, must use one deliberately bounded test generation and report credits separately. Normal unit/integration tests use mocks and must not incur credits.
- Existing dirty worktree files are out of scope and must remain untouched.

## Acceptance criteria

1. Image and LLM quality controls are visibly independent.
2. GPT Image 2.5 quality selection reaches the provider payload as `quality` when the catalog says it is supported.
3. OpenRouter LLM calls receive the exact selected `reasoning.effort` and `exclude: true`, with no duplicate legacy thinking field.
4. Unsupported model/provider combinations do not receive an unsupported parameter.
5. Episode settings persist across reload.
6. A changed episode setting is inherited by future episodes only.
7. Existing episode settings and generated artifacts remain unchanged.
8. Focused server, shared, UI, migration/schema, and runtime tests pass; build/typecheck results are reported separately from focused proof.

## External reference

OpenRouter Reasoning Tokens documentation: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
