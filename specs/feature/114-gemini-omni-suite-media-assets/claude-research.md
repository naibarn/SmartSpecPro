# Research Notes - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21
Mode: self_review
Source: `spec.md`, SocratiCode search, targeted file reads.

## Codebase Findings

### Media Studio reference state

`apps/web/client/src/pages/MediaStudio.tsx` already owns three relevant state groups:

- standard reference images through `referenceImages`
- standard reference videos through `referenceVideos`
- model-specific dynamic values through `modelInputValues`

The current dynamic model input bridge syncs fields with `syncWith: "reference_images"` and `syncWith: "reference_videos"` into `modelInputValues`, then renders those synced fields as locked read-only summaries. This explains the current UX problem: Gemini Omni `image_urls` and `video_list` are technically populated from runtime state, but the visible dynamic panel makes them look disabled and uneditable.

The generation payload builder already sends synced reference fields into `extraParams`, and then sends standard `referenceImageUrls` / `referenceVideoUrls` to the backend. The future Gemini Omni implementation should keep the standard reference pickers as the source of truth and add a suite-specific panel for provider assets rather than asking users to edit raw arrays.

### Dynamic input metadata

`apps/web/client/src/lib/mediaModelInputs.ts` supports field types:

- `select`
- `text`
- `number`
- `boolean`
- `image_urls`
- `video_urls`
- `audio_urls`
- `library_file`
- `array`

It currently infers several synced fields by type/key, and supports explicit `syncWith`. It does not yet support asset picker fields, hidden fields, advanced-only fields, weighted reference units, or provider asset constraints. Gemini Omni needs additive metadata rather than overloading `array` fields for `audio_ids` and future `character_ids`.

### Pricing

`apps/web/shared/mediaModelPricing.ts` and `apps/web/server/services/pricingCalculator.ts` already support:

- `flat`
- `per_duration`
- `matrix`
- `per_unit`
- presence labels for matrix keys through `pricingPresenceLabels`

The static Gemini Omni registry already contains a near-correct matrix shape with keys like `1080p-10s-with-video`, and the current `video_list` field has aliases for reference video presence. The implementation should harden this with client/server tests and ensure the runtime selections used for credit reservation include source-video presence before charging.

### Existing Gemini Omni registry

`apps/web/server/services/modelRegistry.ts` and `apps/web/scripts/seed-media-models-kie-ai.ts` already define `gemini-omni-video` as a `kie.ai` video model with:

- endpoint `/api/v1/jobs/createTask`
- query endpoint `/api/v1/jobs/recordInfo`
- `apiPayloadFormat: "market"`
- `kieModelId: "gemini-omni-video"`
- `generateType: "multimodal-video"`
- `maxReferenceImages: 7`
- `maxReferenceVideos: 1`
- `maxReferenceAudios: 1`
- duration and resolution options
- pricing tiers

The current fields include `audio_ids` as raw `array` and do not include `character_ids`. That is not sufficient for user-facing UX or the updated provider suite.

### Python Kie provider

`python-backend/app/llm_proxy/providers/kie_ai_provider.py` maps Gemini Omni aliases to `gemini-omni-video`.

Existing tests in `python-backend/tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py` confirm that Gemini Omni video can build:

- `image_urls`
- `video_list: [{ url }]`
- `audio_ids`
- `duration`
- `aspect_ratio`

There are no equivalent asset-creation tests for Gemini Omni Character or Gemini Omni Audio. The provider path must distinguish async video task creation from direct asset creation endpoints.

### Kie.ai documentation spot check

Checked the current Kie.ai Gemini Omni docs on 2026-05-21:

- Video uses `POST /api/v1/jobs/createTask`, model `gemini-omni-video`, and returns `data.taskId`.
- Video upload quota remains 7 units:
  - `image_urls` = 1 unit each
  - `video_list` = 2 units each
  - `character_ids` = 1 unit each
  - maximum 1 video per request
  - maximum 3 character IDs per request
- Video request examples show `video_list` entries using `{ url, start, ends }`. The implementation must preserve the provider's `ends` spelling even if internal UI labels say end time.
- Audio uses `POST /api/v1/omni/audio/create` and returns `data.kieAudioId`.
- Character uses `POST /api/v1/omni/character/create`, accepts exactly one `image_urls` entry up to 20 MB, requires `audio_ids` to come from Gemini Omni Audio when present, and returns `data.characterId`, `data.characterName`, and `data.imageUrl`.

Implementation should keep a small provider-contract fixture set copied from sanitized docs examples so future Kie changes are caught by tests before runtime.

### Library and provider asset storage

`apps/web/drizzle/schema.ts` has `library_items` for media files and rich library metadata. It is URL/file centered and not ideal as the only source of truth for provider-owned IDs such as `characterId` and `kieAudioId`.

A new `media_provider_assets` table is warranted. It should link optionally to `library_items` for thumbnails/source media, while storing the provider asset ID, asset type, owner, tenant, provider metadata, status, and soft-delete state independently.

### Skills and learning

Existing skill packages under `apps/web/skills` commonly include:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- references
- scripts such as `scripts/verify.sh`

`apps/web/server/services/__tests__/skillUpgradeApplier.test.ts` shows an existing `media-studio-auto-learning` recommendation path. It can auto-apply instruction-only recommendations in safe cases, but the Gemini Omni suite should initially produce pending review recommendations by default and only auto-apply after explicit enablement.

### Testing context

Relevant verification commands:

- TypeScript/Vitest: `npm --prefix apps/web test`
- Focused web tests can use `npm --prefix apps/web test -- --run <path>`
- Type checking: `npm --prefix apps/web run check`
- Python tests: `cd python-backend && DEBUG=false PYTEST_ADDOPTS=--no-cov uv run pytest <path>`

## Gaps Found During Plan Review

- Asset creation pricing is not yet specified. Character/Audio may consume provider credits, so implementation must either configure explicit asset creation credit costs or keep public asset creation disabled until pricing is confirmed.
- The provider asset table needs unique/idempotency constraints, not only columns.
- Upload validation must cover file type, size, public URL/re-hosting, and tenant ownership before provider calls.
- Storyboard multi-video mode needs partial failure and resume semantics.
- Credit reservation must define rollback/refund behavior when provider validation passes but upstream creation/submission fails.
- Skill packages also need registration/seed/sync coverage, not only files on disk.
- Admin config migration/backfill needs a managed-field strategy so existing DB rows with raw Gemini Omni fields do not keep confusing users.
- QA/learning records need privacy boundaries for voice, likeness, media URLs, and provider IDs.

## Gaps Found During Second Plan Review

- Gemini Omni Video docs recommend `callBackUrl`, but existing SmartSpecPro behavior also has polling/recovery patterns. The plan must support both callback and polling/recovery, and must not require callbacks to be present for local/dev operation.
- Kie response examples are inconsistent: Video/Character examples return `code: 200`, while Audio returns `code: 0`. Provider response normalization must treat both as success when paired with expected `data`.
- Provider-hosted result URLs should not become final user-visible assets without re-hosting through the platform storage pipeline where existing media behavior expects durable platform URLs.
- Reference media URLs must be public and safe for provider fetches. Validation must reject private, loopback, link-local, metadata-service, local/internal, and unsafe redirect targets according to existing media URL safety patterns.
- Provider capacity/rate-limit behavior should integrate with existing deferred retry patterns where possible, not immediately fail expensive user requests.
- Public callback endpoints, if added or reused, require signature/timestamp/replay protection and request size limits.
- Observability/audit requirements need to be explicit: asset create, provider submit, callback/poll terminal handling, credit settlement, QA decision, learning recommendation creation, and rollback should be logged with sanitized metadata.
- Skill packages need versioning and contract snapshot checks so future auto-learning changes cannot silently break Media Studio's structured handoff.

## Design Implications

- Do not expose `audio_ids`, `character_ids`, or `video_list` as raw text/array UI to normal users.
- Keep reference image/video selection in the existing Media Studio picker layer, but render Gemini Omni-specific constraints and validation next to it.
- Introduce provider asset APIs and storage before wiring character/audio into Video.
- Treat Character and Audio as reusable asset builders, not as ordinary generated media results.
- Add Gemini Omni-specific skill packages instead of stretching the generic video prompt skill.
- Use the current learning recommendation pipeline, but add Gemini Omni issue taxonomy and review gates.
