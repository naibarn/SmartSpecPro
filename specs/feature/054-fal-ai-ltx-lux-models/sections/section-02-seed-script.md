# Section 02: Seed Script -- `seed-media-models-fal-ai.ts`

## Overview

Create `apps/web/scripts/seed-media-models-fal-ai.ts` to seed 12 fal.ai model definitions into the `media_models` table. This follows the exact pattern established by the BytePlus seed script (`apps/web/scripts/seed-media-models-byteplus.ts`).

**Depends on:** section-01-provider-template (provider template entries must exist for the admin UI to associate models with the fal_ai provider).

## File to Create

- `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-media-models-fal-ai.ts`

## TDD Expectations

No separate unit test files. Verification by running the seed script and confirming database state:

```bash
# Run the seed script
cd /home/dev/projects/SmartSpecPro/apps/web && npx tsx scripts/seed-media-models-fal-ai.ts

# Verify 12 rows created
psql "$DATABASE_URL" -c "SELECT count(*) FROM media_models WHERE provider = 'fal_ai';"
# Expected: 12

# Verify model types breakdown
psql "$DATABASE_URL" -c "
  SELECT \"modelType\", count(*)
  FROM media_models
  WHERE provider = 'fal_ai'
  GROUP BY \"modelType\"
  ORDER BY \"modelType\";
"
# Expected: audio=1, image=4, video=7

# Verify idempotency: re-running produces same 12 rows (DELETE + INSERT)
```

## Implementation Pattern

Follow `seed-media-models-byteplus.ts` exactly:
1. Import `postgres` from the `postgres` npm package
2. Define interfaces: `InputField`, `ModelDefinition`, model entry types
3. Define model arrays: `VIDEO_MODELS`, `IMAGE_MODELS`, `AUDIO_MODELS`
4. Seed function: DELETE existing `fal_ai` models, INSERT fresh, print summary
5. All JSON columns passed through `JSON.stringify()`

## Model Definitions (12 Total)

### Video Models (7) -- LTX-2.3 Family

All video models share: `modelType: "video"`, `provider: "fal_ai"`, `configJson.apiPayloadFormat: "custom"`

#### 1. LTX-2.3 Text to Video (Standard)
- **modelId**: `"fal-ai/ltx-2.3/text-to-video"`, **creditCost**: `360`, **priority/sortOrder**: `60`
- **durations**: `[6, 8, 10]`, **pricingFormula**: `"matrix"`
- **inputFields**: `resolution` (select, affectsPricing), `duration` (select, affectsPricing), `seed` (number)
- **pricingTiers**: `"1080p-6s": 360, "1080p-8s": 480, "1080p-10s": 600, "1440p-6s": 720, "1440p-8s": 960, "1440p-10s": 1200, "2160p-6s": 1440, "2160p-8s": 1920, "2160p-10s": 2400, "default": 360`

#### 2. LTX-2.3 Text to Video (Fast)
- **modelId**: `"fal-ai/ltx-2.3/text-to-video/fast"`, **creditCost**: `240`, **priority/sortOrder**: `61`
- **durations**: `[6, 8, 10, 12, 14, 16, 18, 20]`, extended range
- **pricingTiers**: Same structure with 2/3 ratio: `"1080p-6s": 240, "1080p-8s": 320, ... "2160p-20s": 3200, "default": 240`

#### 3. LTX-2.3 Image to Video (Standard)
- **modelId**: `"fal-ai/ltx-2.3/image-to-video"`, **creditCost**: `360`, **priority/sortOrder**: `62`
- **inputFields**: `image_url` (image_urls, required), `resolution`, `duration`, `seed`
- **pricingTiers**: Same as T2V Standard

#### 4. LTX-2.3 Image to Video (Fast)
- **modelId**: `"fal-ai/ltx-2.3/image-to-video/fast"`, **creditCost**: `240`, **priority/sortOrder**: `63`
- Extended durations, same pricing as T2V Fast

#### 5. LTX-2.3 Audio to Video
- **modelId**: `"fal-ai/ltx-2.3/audio-to-video"`, **creditCost**: `600`, **priority/sortOrder**: `64`
- **inputFields**: `audio_url` (audio_urls, required), `duration` (affectsPricing), `seed`
- **pricingTiers** (flat 100 credits/sec): `"5s": 500, "6s": 600, "8s": 800, ... "20s": 2000, "default": 600`

#### 6. LTX-2.3 Extend Video
- **modelId**: `"fal-ai/ltx-2.3/extend-video"`, **creditCost**: `500`, **priority/sortOrder**: `65`
- **inputFields**: `video_url` (video_urls, required), `duration` (affectsPricing), `seed`
- **pricingTiers**: Same as A2V (100 credits/sec)

#### 7. LTX-2.3 Retake Video
- **modelId**: `"fal-ai/ltx-2.3/retake-video"`, **creditCost**: `500`, **priority/sortOrder**: `66`
- **inputFields**: `video_url` (video_urls, required), `duration` (affectsPricing), `seed`
- **pricingTiers**: Same as A2V (100 credits/sec)

### Audio Model (1) -- Lux TTS
- **modelId**: `"fal-ai/lux-tts"`, **creditCost**: `2`, **priority/sortOrder**: `67`
- **pricingFormula**: `"per_unit"`, **pricingUnitMetric**: `"characters"`, **pricingUnitField**: `"prompt"`, **pricingUnitSize**: `1000`, **pricingUnitRounding**: `"ceil"`, **pricingMinUnits**: `1`
- **inputFields**: `audio_url` (audio_urls, optional reference voice)
- **pricingTiers**: `{ "default": 1.4 }`

### Image Models (4) -- Flux Family
All flat pricing, `pricingFormula: "flat"`, `generateType: "text-to-image"`:
- `"fal-ai/flux/schnell"`: creditCost `10`, priority `68`
- `"fal-ai/flux/dev"`: creditCost `20`, priority `69`
- `"fal-ai/flux-pro"`: creditCost `30`, priority `70`
- `"fal-ai/stable-diffusion-v3-medium"`: creditCost `15`, priority `71`

## Run Command

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && npx tsx scripts/seed-media-models-fal-ai.ts
```
