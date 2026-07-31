# Media model opt-in provider input defaults (`apiConfig.defaultInputParams`)

Date: 2026-07-31
Reporter: user (Thai) — "ไม่แน่ใจว่าติดปัญหาอะไร" (seedream/5-pro task stuck at
รอดำเนินการ, no external id, no credits)

## Problem statement

Selecting `seedream/5-pro-text-to-image` as the Vertical Drama character tab's
image-EDIT model produced a task that never left `pending`. Audit trail:

```
python-backend/logs/media-debug/media-routing-2026-07-31.jsonl
  image.generate.kie.error  model=seedream/5-pro-image-to-image
  error="Kie.ai task submission failed: This field is required"
```

kie's docs for `seedream/5-pro-image-to-image` list four REQUIRED input fields:
`prompt`, `image_urls`, `aspect_ratio`, **`quality`** (`basic` | `high`).

The outbound payload (audit `media_request`, traceId c0c9582d) carried the
first three and not `quality`. Python's `generate_image` builds
`input_params` as `prompt / aspect_ratio / resolution / output_format` plus
optional extras — `resolution` is a field seedream does not accept, and
`quality`, which it requires, is never supplied.

The catalog row DOES declare `quality` with `"default": "basic"` — but inside
`configJson.inputFields`, which is a FORM schema consumed only by Media
Studio's dynamic input form. A server-initiated generation never renders that
form, so the default is never applied.

**Not a regression.** Across every audit log in the repo, `seedream/5-pro` has
0 completed and 1 failed generation, all time. The model has never worked; the
text-to-image/image-to-image model split shipped earlier today simply routed a
render to it for the first time.

## Design

Add an explicit opt-in key, `configJson.apiConfig.defaultInputParams`, layered
UNDER the caller's own `extraParams` so an explicit caller value always wins.

Rejected alternative: "apply every `inputFields` default server-side". Measured
blast radius — **90 of 148 enabled models** carry `inputFields` defaults, and
most generate correctly today precisely by letting the provider choose its own
default. Changing the outbound payload of 90 models to fix one is not a trade
worth making. With the opt-in key, a model that declares nothing is
byte-identical to before.

| # | File | Change |
|---|---|---|
| S1 | `mediaGenerationService.ts` | `readModelDefaultInputParams(configJson)` — scalars only; non-scalars are a config error, not a provider field |
| S2 | `mediaGenerationService.ts` | `applyModelDefaultInputParams(callerExtraParams, defaults)` — caller wins; returns the caller's own object untouched when there are no defaults |
| S3 | `mediaGenerationService.ts` | `resolveEffectiveMediaRequestModel` also returns `defaultInputParams`; `generateImage` + `generateImageAsync` merge it into `extra_params` |
| D1 | DB | `media_models` row `seedream/5-pro-text-to-image` gains `apiConfig.defaultInputParams = {"quality": "basic"}` |

`buildEffectiveApiConfig` needs no guard: `mergeApiConfigRecord` already skips
non-scalar values, so the nested `defaultInputParams` object cannot leak into
the `api_config` string map sent to Python.

Not wired: video/audio paths. The mechanism is generic, but no model declares
defaults for them, and wiring an unused path is speculative.

## Database safety

Followed the Database Safety Protocol (single-row UPDATE, medium risk):

```
.db-backups/media_models_20260731_162136.sql   (pg_dump --data-only, 401K)
```

Verified after the UPDATE:
- row count 237 → 237 (unchanged)
- the row's other `apiConfig` keys intact (`kie_model_id_with_references`,
  `reference_image_input_key`, `reference_image_input_type`)
- exactly 1 row in the whole table carries `defaultInputParams`

## Verification

1. `mediaGenerationService.defaultInputParams.test.ts` — 8 unit tests, including
   the explicit "declaring `inputFields` defaults must NOT opt a model in".
2. `tsc` on apps/web; fail-set diff vs baseline.
3. Live: re-run a character look with `seedream/5-pro-text-to-image` as the edit
   model and confirm the task leaves `pending`. REQUIRES a web restart.

## Progress

- [x] S1–S3 code
- [x] D1 catalog row (backed up + verified)
- [x] tests
- [ ] live re-run after restart — user to confirm
