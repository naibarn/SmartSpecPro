-- Migration: Update media models with complete Kie.ai models and correct credit pricing
-- Credit calculation: SmartSpec 1000 credits = $1 USD → 1 credit = $0.001 USD
-- Kie.ai pricing converted to SmartSpec credits with 15% margin (rounded up)
-- Formula: creditCost = CEIL(kie_ai_usd / 0.001 * 1.15)

-- Clear existing models and re-insert with correct pricing
DELETE FROM media_models;

-- Reset sequence
ALTER SEQUENCE media_models_id_seq RESTART WITH 1;

-- ============================================
-- IMAGE MODELS
-- ============================================

-- GPT-4o Image (ChatGPT 4o) - $0.03 per image = 30 + 15% = 35 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder", "configJson")
VALUES (
  'gpt-4o-image',
  'GPT-4o Image',
  'OpenAI ChatGPT 4o image generation - understands text and visual context',
  'image',
  'kie.ai',
  '["chatgpt 4o image", "4o image", "gpt-4o", "chatgpt image", "openai image"]',
  35,
  '["1:1", "16:9", "9:16", "4:3", "3:4"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  1, 1,
  '{"max_images": 4, "supports_inpainting": true}'
);

-- Flux Kontext Pro - ~$0.04 = 46 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder", "configJson")
VALUES (
  'flux-kontext-pro',
  'Flux Kontext Pro',
  'Black Forest Labs - vivid, coherent scenes with strong subject consistency',
  'image',
  'kie.ai',
  '["flux kontext", "flux kontext pro", "kontext pro", "flux pro"]',
  46,
  '["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  2, 2,
  '{"supports_editing": true, "supports_inpainting": true}'
);

-- Flux Kontext Max - ~$0.06 = 69 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder", "configJson")
VALUES (
  'flux-kontext-max',
  'Flux Kontext Max',
  'Black Forest Labs premium - highest quality image generation',
  'image',
  'kie.ai',
  '["flux kontext max", "kontext max", "flux max"]',
  69,
  '["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]',
  '["1024x1024", "1792x1024", "1024x1792", "2048x2048"]',
  3, 3,
  '{"supports_editing": true, "supports_inpainting": true, "high_quality": true}'
);

-- Midjourney - ~$0.10 per image = 115 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder", "configJson")
VALUES (
  'midjourney',
  'Midjourney',
  'Midjourney AI - artistic and creative image generation',
  'image',
  'kie.ai',
  '["midjourney", "mj", "mid journey"]',
  115,
  '["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  4, 4,
  '{"supports_variations": true, "supports_upscale": true}'
);

-- Google Nano Banana Pro (Gemini 3) - ~$0.05 = 58 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder")
VALUES (
  'google-nano-banana-pro',
  'Google Nano Banana Pro',
  'Google Gemini 3 image generation - high-quality and fast',
  'image',
  'kie.ai',
  '["nano banana pro", "gemini 3", "google banana", "nanobananapro"]',
  58,
  '["1:1", "16:9", "9:16", "4:3", "3:4"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  5, 5
);

-- Flux 2.0 - ~$0.04 = 46 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder")
VALUES (
  'flux-2.0',
  'Flux 2.0',
  'Fast and creative image generation with Flux 2.0',
  'image',
  'kie.ai',
  '["flux 2.0", "flux 2", "flux2", "flux"]',
  46,
  '["1:1", "16:9", "9:16"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  6, 6
);

-- Grok Imagine - ~$0.08 = 92 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder")
VALUES (
  'grok-imagine',
  'Grok Imagine',
  'xAI Grok image generation model',
  'image',
  'kie.ai',
  '["grok imagine", "grok image", "xai image", "grok"]',
  92,
  '["1:1", "16:9", "9:16"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  7, 7
);

-- Ideogram 2 - ~$0.05 = 58 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder")
VALUES (
  'ideogram-2',
  'Ideogram 2',
  'Ideogram AI - excellent text rendering in images',
  'image',
  'kie.ai',
  '["ideogram 2", "ideogram", "ideogram ai"]',
  58,
  '["1:1", "16:9", "9:16", "4:3", "3:4"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  8, 8
);

-- Recraft V3 - ~$0.04 = 46 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder")
VALUES (
  'recraft-v3',
  'Recraft V3',
  'Recraft AI - design-focused image generation',
  'image',
  'kie.ai',
  '["recraft v3", "recraft", "recraft ai"]',
  46,
  '["1:1", "16:9", "9:16", "4:3", "3:4"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  9, 9
);

-- Ghibli AI (Style) - ~$0.06 = 69 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, priority, "sortOrder", "configJson")
VALUES (
  'ghibli-ai',
  'Ghibli AI',
  'Studio Ghibli style transformation',
  'image',
  'kie.ai',
  '["ghibli", "ghibli style", "ghibli ai", "studio ghibli"]',
  69,
  '["1:1", "16:9", "9:16"]',
  '["1024x1024", "1792x1024", "1024x1792"]',
  10, 10,
  '{"style": "ghibli", "requires_input_image": false}'
);

-- ============================================
-- VIDEO MODELS
-- ============================================

-- Veo 3.1 Fast - $0.40 = 460 credits (with 15% margin)
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'veo-3.1-fast',
  'Veo 3.1 Fast',
  'Google Veo 3.1 Fast - quick video generation with audio (8 seconds)',
  'video',
  'kie.ai',
  '["veo 3.1 fast", "veo fast", "google veo fast", "veo3 fast"]',
  460,
  '["16:9", "9:16", "1:1"]',
  '[8]',
  1, 11,
  '{"has_audio": true, "max_duration": 8, "quality": "fast"}'
);

-- Veo 3.1 Quality - $2.00 = 2300 credits (with 15% margin)
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'veo-3.1-quality',
  'Veo 3.1 Quality',
  'Google Veo 3.1 Quality - high-quality video with synchronized audio (8 seconds)',
  'video',
  'kie.ai',
  '["veo 3.1 quality", "veo quality", "google veo quality", "veo3 quality", "veo 3.1", "veo3"]',
  2300,
  '["16:9", "9:16", "1:1"]',
  '[8]',
  2, 12,
  '{"has_audio": true, "max_duration": 8, "quality": "quality"}'
);

-- Runway Aleph - ~$1.50 = 1725 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'runway-aleph',
  'Runway Aleph',
  'Runway Gen-3 Alpha (Aleph) - high-quality cinematic video',
  'video',
  'kie.ai',
  '["runway aleph", "runway", "gen-3 alpha", "runway gen3"]',
  1725,
  '["16:9", "9:16", "1:1"]',
  '[5, 10]',
  3, 13,
  '{"max_duration": 10, "supports_image_to_video": true}'
);

-- Sora 2 - ~$3.00 = 3450 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'sora-2',
  'Sora 2',
  'OpenAI Sora 2 - advanced video generation model',
  'video',
  'kie.ai',
  '["sora 2", "sora2", "openai sora", "sora"]',
  3450,
  '["16:9", "9:16", "1:1"]',
  '[5, 10, 15, 20]',
  4, 14,
  '{"max_duration": 20, "supports_image_to_video": true}'
);

-- Kling 2.6 - ~$1.00 = 1150 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'kling-2.6',
  'Kling 2.6',
  'Kling AI 2.6 - video generation with good motion quality',
  'video',
  'kie.ai',
  '["kling 2.6", "kling 2", "kling", "kuaishou kling"]',
  1150,
  '["16:9", "9:16", "1:1"]',
  '[5, 10]',
  5, 15,
  '{"max_duration": 10, "supports_image_to_video": true}'
);

-- Wan 2.6 - ~$0.80 = 920 credits (multi-shot video)
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", durations, priority, "sortOrder", "configJson")
VALUES (
  'wan-2.6',
  'Wan 2.6',
  'Wan AI 2.6 - multi-shot HD video stories with native audio',
  'video',
  'kie.ai',
  '["wan 2.6", "wan ai", "wan", "alibaba wan"]',
  920,
  '["16:9", "9:16", "1:1"]',
  '[5, 10, 15]',
  6, 16,
  '{"has_audio": true, "max_duration": 15, "multi_shot": true}'
);

-- ============================================
-- AUDIO/MUSIC MODELS
-- ============================================

-- Suno V4.5 Plus - ~$0.10 per generation = 115 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", durations, voices, priority, "sortOrder", "configJson")
VALUES (
  'suno-v4.5-plus',
  'Suno V4.5 Plus',
  'Suno AI V4.5 Plus - premium music generation up to 8 minutes',
  'audio',
  'kie.ai',
  '["suno v4.5 plus", "suno plus", "suno premium", "suno 4.5"]',
  115,
  '[60, 120, 180, 240, 480]',
  NULL,
  1, 17,
  '{"type": "music", "max_duration": 480, "supports_lyrics": true, "supports_instrumental": true}'
);

-- Suno V4.5 - ~$0.06 per generation = 69 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", durations, voices, priority, "sortOrder", "configJson")
VALUES (
  'suno-v4.5',
  'Suno V4.5',
  'Suno AI V4.5 - music generation with enhanced vocals and rich sound',
  'audio',
  'kie.ai',
  '["suno v4.5", "suno 4.5", "suno"]',
  69,
  '[60, 120, 180, 240]',
  NULL,
  2, 18,
  '{"type": "music", "max_duration": 240, "supports_lyrics": true, "supports_instrumental": true}'
);

-- Suno V4 - ~$0.05 = 58 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", durations, priority, "sortOrder", "configJson")
VALUES (
  'suno-v4',
  'Suno V4',
  'Suno AI V4 - music generation with good quality',
  'audio',
  'kie.ai',
  '["suno v4", "suno 4"]',
  58,
  '[60, 120, 180]',
  3, 19,
  '{"type": "music", "max_duration": 180, "supports_lyrics": true}'
);

-- ElevenLabs TTS - ~$0.02 per 1000 chars = 23 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", voices, priority, "sortOrder", "configJson")
VALUES (
  'elevenlabs-tts',
  'ElevenLabs Text-to-Speech',
  'High-quality text-to-speech with multiple voices',
  'audio',
  'kie.ai',
  '["elevenlabs tts", "elevenlabs", "eleven labs", "11labs", "text to speech", "tts"]',
  23,
  '["alloy", "echo", "fable", "onyx", "nova", "shimmer", "rachel", "adam", "domi", "bella"]',
  4, 20,
  '{"type": "tts", "max_chars": 5000, "supports_voice_cloning": true}'
);

-- ElevenLabs Sound Effects - ~$0.02 = 23 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", priority, "sortOrder", "configJson")
VALUES (
  'elevenlabs-sfx',
  'ElevenLabs Sound Effects',
  'AI-generated sound effects from text description',
  'audio',
  'kie.ai',
  '["elevenlabs sfx", "sound effects", "sfx", "sound fx"]',
  23,
  5, 21,
  '{"type": "sfx", "max_duration": 22}'
);

-- Vocal Removal - ~$0.03 = 35 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", priority, "sortOrder", "configJson")
VALUES (
  'vocal-removal',
  'Vocal Removal',
  'Remove vocals from audio tracks',
  'audio',
  'kie.ai',
  '["vocal removal", "remove vocals", "instrumental", "karaoke"]',
  35,
  6, 22,
  '{"type": "separation", "output": "instrumental"}'
);

-- Stem Split - ~$0.05 = 58 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", priority, "sortOrder", "configJson")
VALUES (
  'stem-split',
  'Stem Split',
  'Split audio into separate stems (vocals, drums, bass, other)',
  'audio',
  'kie.ai',
  '["stem split", "stem separation", "audio split", "demucs"]',
  58,
  7, 23,
  '{"type": "separation", "stems": ["vocals", "drums", "bass", "other"]}'
);

-- Music Cover - ~$0.15 = 173 credits
INSERT INTO media_models ("modelId", name, description, "modelType", provider, aliases, "creditCost", priority, "sortOrder", "configJson")
VALUES (
  'music-cover',
  'Music Cover',
  'Generate AI cover versions of songs with different voices',
  'audio',
  'kie.ai',
  '["music cover", "ai cover", "voice cover", "song cover"]',
  173,
  8, 24,
  '{"type": "cover", "requires_source_audio": true}'
);

-- Add indexes for new columns if not exist
CREATE INDEX IF NOT EXISTS idx_media_models_credit_cost ON media_models("creditCost");

-- Add comment
COMMENT ON TABLE media_models IS 'Kie.ai media models with SmartSpec credit pricing (1000 SmartSpec credits = $1 USD, with 15% margin)';
