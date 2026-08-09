# MiniMax H3 (kie.ai) — N-way mode routing for media models

Status: **SHIPPED** 2026-08-03 (migration applied, services restarted, live on smartaihub.app; post-audit config propagation gap closed)
Date: 2026-08-03

## Changes from the approved plan (found during implementation)

1. **`defaultInputParams` cannot be a per-mode override.** It is applied on the
   Node side (`mediaGenerationService.ts:267`) before the request reaches
   Python, which has no idea which mode will be selected. Dropped from the
   per-mode key list; not implemented.
2. **No pricing-alias change was needed.** `pricingAliases` is a per-field
   descriptor on one hardcoded suite field (`video_list`), not a global registry.
3. **Two blockers in `VideoGenerationRequest` (both pre-existing bugs):**
   * `api_config` was typed `Dict[str, Union[str, int, float, bool]]` — a
     scalar-only annotation that would have rejected the whole request, because
     `apiConfig.modes` is a list of nested objects. Widened to `Dict[str, Any]`
     (which `ImageGenerationRequest` already used).
   * `reference_video_urls` (plural) **was not declared at all**, so Pydantic
     silently dropped it and only `reference_video_url` (the first clip)
     survived. Every multi-clip video model has been receiving one clip.
4. **`referenceImageUrls` Zod cap on the video procedures raised 5 → 9** to fit
   reference-to-video. Per-model caps still come from
   `configJson.maxReferenceImages`.
5. **Audio counting added on both sides.** There is no studio-level reference-
   audio attachment channel (`support.audioUrls` is computed in
   `mediaModelInputs.ts` but consumed nowhere), so audio arrives through the
   model's own `audio_urls` inputField. Both the provider
   (`_first_extra_param`) and the chip (`countModelInputFieldReferences`) read
   it from there, or mode selection would miss it.
6. **`_get_api_config_str_list` added.** `_get_api_config_value` returns strings
   only, so list-valued settings (`drop_params`,
   `reference_image_overflow_keys`) silently read as absent.
7. **Nested mode config propagation was completed after audit.** The Node
   config builder and video tRPC schemas previously reduced `apiConfig.modes`
   to scalar values, so the Python resolver could not see the catalog modes on
   a real MediaStudio request. Structured mode predicates/overrides are now
   preserved end-to-end, and generic video validation enforces the catalog's
   reference-video `maxItems` limit.

## 1. Problem statement

We need to add `minimax-h3` from kie.ai. Unlike every model added so far, it is
**not one endpoint** — it is three endpoints with *different* input contracts:

| kie model id | required inputs | notes |
|---|---|---|
| `minimax-h3/text-to-video` | `prompt`, `aspect_ratio` (required), `duration` | no attachments |
| `minimax-h3/image-to-video` | `prompt`, `first_frame_url` **and/or** `last_frame_url`, `duration` | **no `aspect_ratio` param at all** |
| `minimax-h3/reference-to-video` | `prompt`, `reference_image_urls[≤9]` **or** `reference_video_urls[≤3]`, optional `reference_audio_urls[≤3]`, `aspect_ratio` (incl. `adaptive`), `duration` | audio requires an accompanying image or video |

Shared: `duration` integer 4–15 (default 6), 2K output, aspect ratios
`21:9 16:9 4:3 1:1 3:4 9:16` (+`adaptive` on r2v only).

Sources:
- <https://docs.kie.ai/market/minimax-h3/text-to-video>
- <https://docs.kie.ai/market/minimax-h3/image-to-video>
- <https://docs.kie.ai/market/minimax-h3/reference-to-video>

### Why the existing mechanism is not enough

The current auto-switch (`apiConfig.kie_model_id_with_references`, see
`memory/project_kie_t2i_i2i_auto_switch.md`) is **2-way and image-only**, and it
is wired **only into the image path**:

- `kie_ai_provider.py::resolve_image_api_model()` — used at line ~1517 (`generate_image`)
- `media_generation.py::_resolve_async_image_model()` — async image path

`generate_video()` (line ~1647) calls plain `resolve_api_model()`. **There is no
reference-aware model switching on the video path at all.** So even the simple
"attach an image → use i2v" behaviour the user describes from last time does not
exist generically for video; it was achieved by giving each variant its own row.

Three further blockers for a single unified row:

1. **3 modes, not 2.** The third mode is selected by *video/audio* presence, not
   image presence.
2. **Per-mode payload shape.** `omit_aspect_ratio` exists but is a single global
   flag on the row. i2v needs it **on**; t2v and r2v need it **off**. Same for
   the reference key/type: `first_frame_url` (string) vs `reference_image_urls`
   (array) on the same row.
3. **No first/last-frame mapping.** With `reference_image_input_type: "url"` only
   `refs[0]` is used and `refs[1]` is silently dropped — but MediaStudio already
   produces an ordered 2-image list from its start/stop-frame flow
   (`MediaStudio.tsx:33142`), which is exactly `first_frame_url` + `last_frame_url`.
4. **Reference audio is not plumbed anywhere.** `reference_audio_urls` appears in
   zero files across `apps/web` and `python-backend`.

Hardcoding a `_is_minimax_h3_request()` branch would repeat the `_is_veo_extend_request`
pattern — a per-family special case in the provider. The next multi-mode model
(and there will be one) pays the cost again.

## 2. Proposed solution — declarative `apiConfig.modes`

Generalize the 2-way switch into an **ordered, first-match-wins list of modes**,
selected on the *shape of the attachments* (image / video / audio counts). A mode
is a **partial override of `apiConfig`**. Resolution happens once at the top of
`generate_video()`; the entire existing body then runs unchanged against the
merged config — because every downstream helper already reads from `api_config`.

```jsonc
// media_models.configJson.apiConfig
{
  "kie_model_id": "minimax-h3/text-to-video",   // base = the no-attachment mode
  "modes": [
    {
      "id": "reference-to-video",
      "when": { "minVideos": 1 },                     // any reference video wins
      "kie_model_id": "minimax-h3/reference-to-video",
      "reference_image_input_key": "reference_image_urls",
      "reference_image_input_type": "array",
      "reference_video_input_key": "reference_video_urls",
      "reference_video_input_type": "array",
      "reference_audio_input_key": "reference_audio_urls",
      "reference_audio_input_type": "array"
    },
    {
      "id": "reference-to-video-audio",
      "when": { "minAudios": 1 },
      "kie_model_id": "minimax-h3/reference-to-video",
      "reference_image_input_key": "reference_image_urls",
      "reference_image_input_type": "array",
      "reference_audio_input_key": "reference_audio_urls",
      "reference_audio_input_type": "array"
    },
    {
      "id": "reference-to-video-multi-image",
      "when": { "minImages": 3 },                     // i2v only has 2 frame slots
      "kie_model_id": "minimax-h3/reference-to-video",
      "reference_image_input_key": "reference_image_urls",
      "reference_image_input_type": "array"
    },
    {
      "id": "image-to-video",
      "when": { "minImages": 1, "maxImages": 2 },
      "kie_model_id": "minimax-h3/image-to-video",
      "reference_image_input_key": "first_frame_url",
      "reference_image_input_type": "url",
      "reference_image_overflow_keys": ["last_frame_url"],   // image[1] -> last frame
      "omit_aspect_ratio": true                              // i2v rejects it
    }
    // no match -> base config -> minimax-h3/text-to-video
  ]
}
```

### Predicate vocabulary (`when`)

`minImages` `maxImages` `minVideos` `maxVideos` `minAudios` `maxAudios` — all
optional, all AND-ed. A mode with no `when` (or `when: {}`) is an unconditional
catch-all; put it last. Bounds are inclusive.

### Per-mode override keys

Any of: `kie_model_id`, `endpoint`, `reference_{image,video,audio}_input_key`,
`reference_{image,video,audio}_input_type`, `reference_image_overflow_keys`,
`omit_aspect_ratio`, `omit_duration`, `defaultInputParams`, `drop_params`.
Anything omitted falls through to the top-level `apiConfig`.

### Why this shape

- **Zero migration for existing rows.** No `modes` key → resolution is a no-op →
  byte-identical behaviour for all 100+ current rows.
- **Data, not code.** The 4th mode of the next model is a JSON edit and a registry
  cache expiry (5 min TTL, no restart — `modelRegistry.ts`).
- **Reuses everything.** `_resolve_reference_image_input_config`,
  `_resolve_reference_video_input_config`, `omit_aspect_ratio`, `omit_duration`,
  `_normalize_ref_urls_for_model` all keep working untouched.
- **Subsumes the old switch.** `kie_model_id_with_references` becomes the
  degenerate case `modes: [{ when: { minImages: 1 }, kie_model_id: "..." }]`. Keep
  the old key working; do not migrate existing rows.
- **Compatible with the Studio UI as-is.** `getModelReferenceInputSupport()`
  (`client/src/lib/mediaModelInputs.ts:413`) already lights up the image / video /
  audio attachment tabs from `configJson.inputFields` types. One row declaring all
  three field types gets all three affordances with no UI change.

## 3. Affected files

### Python — `python-backend/`

| File | Change |
|---|---|
| `app/llm_proxy/providers/kie_ai_provider.py` | **new** `_count_reference_inputs()`, `_match_mode()`, `resolve_mode_api_config()`, `resolve_video_api_model()`; call `resolve_mode_api_config()` at the top of `generate_video()`; add `reference_image_overflow_keys` to the `type == "url"` branch; add the `reference_audio_urls` block mirroring the video block; route `generate_image()` through the same resolver (old key kept as fallback) |
| `app/api/v1/media_generation.py` | **new** `_resolve_async_video_model()` mirroring `_resolve_async_image_model()`; use it in `generate_video_async()` so Media History records the variant that actually ran, not the catalog id |
| `app/llm_proxy/models.py` | add `reference_audio_urls: list[str] \| None` to `VideoGenerationRequest` |
| `app/llm_proxy/gateway_unified.py` | pass `reference_audio_urls` through (mirror of `reference_video_url` at line ~784) |
| `tests/unit/llm_proxy/test_kie_ai_mode_routing.py` | **new** |

### Node — `apps/web/`

| File | Change |
|---|---|
| `server/services/mediaGenerationService.ts` | forward `referenceAudioUrls → payload.reference_audio_urls` (mirror of the video block at ~2376); add pricing alias |
| `server/routers/media.ts` | add `referenceAudioUrls: z.array(referenceMediaUrlSchema).max(3).optional()` to the video-generation inputs (3 call sites: ~2398, ~3256, ~4292) and thread it through |
| `drizzle/XXXX_minimax_h3_mode_routing.sql` | **new** — single `INSERT … ON CONFLICT DO UPDATE` for the `minimax-h3` row + `drizzle/meta/_journal.json` entry |

**Do not re-run `seed-media-models-kie-ai.ts`** — a full seed replaces `configJson`
for every row and discards admin-maintained pricing
(`memory/project_kie_t2i_i2i_auto_switch.md`, `memory/project_model_pricing_never_syncs.md`).

### Catalog row

```
modelId:    minimax-h3
modelType:  video
provider:   kie.ai
aliases:    ["minimax-h3/text-to-video","minimax-h3/image-to-video","minimax-h3/reference-to-video","hailuo-3","hailuo 03"]
durations:  [4,5,6,7,8,9,10,11,12,13,14,15]
aspectRatios: ["21:9","16:9","4:3","1:1","3:4","9:16"]
configJson.inputFields:
  - reference images  image_urls  maxItems 9  syncWith reference_images
  - reference videos  video_urls  maxItems 3  syncWith reference_videos
  - reference audio   audio_urls  maxItems 3  syncWith none        (see note)
  - aspect_ratio      select      syncWith aspect_ratio
  - duration          select 4..15
configJson.supportsReferenceImages / …Videos / …Audio: true
configJson.maxReferenceImages: 9
```

> Note on the audio field: `mediaModelInputs.ts:123` infers `syncWith:
> "reference_images"` for `type: "audio_urls"` (a TTS-era default). An explicit
> `syncWith: "none"` is required or the audio field gets overwritten with the
> image URLs. Flagged separately — the inference itself is a latent bug for any
> model that takes both images and audio.

### Pricing

kie.ai bills MiniMax H3 per second: **$0.13/s @ 2K**. At the documented platform
rate of 1 credit = $0.001 (`creditService.ts` ~1146) that is **130 credits/s** —
6 s = 780, 15 s = 1950. Use `pricingFormula: "per_duration"`.

Known under-charge, accepted for v1 (same class as the per-image surcharge gap in
`memory/project_kie_t2i_i2i_auto_switch.md`): the provider **also** bills the
duration of each *reference video*, and bills input images from #6 onward.
`pricingFormula` has no way to express either. A heavy r2v run with 3×15 s
reference clips is materially under-billed.

## 4. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Mode routing changes behaviour of an existing row | HIGH | No `modes` key ⇒ resolver returns `api_config` unchanged. Test asserts byte-identical payload for a row without `modes`. |
| i2v silently ignores the user's aspect-ratio pick | MEDIUM | `omit_aspect_ratio` in the mode + surface the active mode in the UI (§5) so the user sees *why*. |
| Media History shows catalog id, not the variant that ran | MEDIUM | `_resolve_async_video_model()` — mirrors the image path, which already does this. |
| r2v reference-video limits (2–15 s each, ≤15 s total) unvalidated | LOW | Not checkable without probing the file. Provider rejects with a clear message; the dispatch auto-refunds. Documented, not fixed. |
| TS-side mode badge drifts from the Python decision | MEDIUM | Badge reads the *same* `configJson.apiConfig.modes` data. Python stays authoritative; badge is advisory. Shared unit fixture for both. |

## 5. Optional (recommended) — mode badge in MediaStudio

A small evaluator in `client/src/lib/mediaModelInputs.ts` reading
`configJson.apiConfig.modes` against the current attachment counts, rendering a
live chip: `Text → Video` / `Image → Video (first + last frame)` /
`Reference → Video`. Makes the auto-switch legible instead of magic, and warns
when a mode drops a control the user just set (aspect ratio on i2v).

Cost: ~80 lines + tests. Recommend shipping it in the same change — the whole
value of one unified row is that the user does not have to know which endpoint
they hit, and the badge is what makes that trustworthy rather than surprising.

## 6. Verification results (2026-08-03)

| Check | Result |
|---|---|
| `pytest tests/unit/llm_proxy/test_kie_ai_mode_routing.py` | **24 passed** (new) |
| `pytest tests/unit/llm_proxy/` fail-set | **27 failed / 280 passed** — identical set with and without the new file; all cross-test pollution (each passes in isolation), pre-existing |
| `vitest client/src/lib/mediaModelInputs.test.ts` | **37 passed** (was 25) |
| `vitest server/services/mediaGenerationService.test.ts` | 3 failed / 43 passed — **same 3 failures at HEAD**, +1 new passing test |
| post-audit structured-config regression | **2 passed** (`apiConfig.modes` propagation and reference audio/video forwarding) |
| `vitest server/routers/__tests__/media.db-first.contract.test.ts` | 20 failed / 23 passed — **byte-identical fail set at HEAD** (verified by diffing the failing-test-name lists) |
| `tsc --noEmit` | zero errors in `mediaModelInputs.ts`, `MediaStudio.tsx`, `routers/media.ts`; the one hit in `mediaGenerationService.ts:2553` (`defaultInputParams` destructure) exists identically at HEAD |
| `ruff` | `kie_ai_provider.py` clean before and after; `media_generation.py` unchanged count; `models.py` +3 (my `Optional[List[str]]` annotations, matching the file's existing style) |
| Migration | backup `.db-backups/media_models_20260803_114631.sql` (410 KB); 237 rows → **238**; hash seeded into `drizzle.__drizzle_migrations` |
| Deploy | `npm run build:deploy` (atomic), `smartspec-{backend,web}` restarted, `smartspec-celery-{media,video}` containers restarted (bind-mounted source), all healthy, `https://smartaihub.app` 200 |

**Not verified:** no live generation was run — that spends credits and needs a
user session. The three modes are proven at the payload level (the tests assert
the exact `create_task` model id and body per attachment shape), not against the
live kie.ai endpoint.

## 6b. Original verification steps

1. `cd python-backend && pytest tests/unit/llm_proxy/test_kie_ai_mode_routing.py -v`
   — no-modes passthrough, each of the 3 shapes, overflow key mapping, audio block.
2. `cd python-backend && pytest tests/unit/llm_proxy/ -q` — no regression on the
   existing kie provider suites.
3. `cd apps/web && pnpm vitest run server/services/mediaGenerationService.test.ts client/src/lib/mediaModelInputs.test.ts`
4. `cd apps/web && pnpm check` — compare the error count against the pre-change
   baseline (the tree carries a large pre-existing red count; use fail-set
   identity, not absolute count — `memory/project_vd_video_prompt_suites_red_baseline.md`).
5. Backup `media_models` before the migration, apply, verify row count unchanged +1.
6. Live smoke on <https://smartaihub.app> MediaStudio, one run per mode; check
   `logs/audit/audit-$(date +%F).jsonl` `media_request` for the *effective* kie
   model id and the exact payload keys per mode.

## 7. Implementation order

1. Python mode resolver + unit tests (pure functions, no wiring) — TDD.
2. Wire into `generate_video`; regression-test the existing suites.
3. `reference_image_overflow_keys` + audio block + tests.
4. `_resolve_async_video_model`.
5. Node audio plumbing (`models.py` → gateway → mediaGenerationService → media.ts).
6. Migration for the `minimax-h3` row.
7. UI mode badge (optional).
8. Full verification (§6), then report.
