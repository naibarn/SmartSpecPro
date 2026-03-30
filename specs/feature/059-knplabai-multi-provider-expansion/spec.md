# 059 — KNPLabs AI Multi-Provider Expansion (LLM + Media + Embeddings + TTS)

Version: 2.0
Date: 2026-03-24
Status: Proposed (Revised after 4-domain review)
Depends-on: 054 (fal.ai provider pattern), 050 (pgvector)
Reference: [KNPLabs API Docs](https://api.knplabai.com/)

---

## 1. Executive Summary

เพิ่ม **KNPLabs AI** เป็น provider ใหม่ทั้งฝั่ง LLM และ Media ครอบคลุม 4 ประเภทบริการ:

1. **LLM Chat Completions** — Claude, GPT, Gemini, Grok, DeepSeek, Minimax, Qwen, Kimi, MiMo (OpenAI-compatible endpoint)
2. **Image Generation** — GPT Image 1/1.5, Sora Image, Gemini Nano Banana, Grok Image (2 endpoint formats: OpenAI-compatible + Gemini native)
3. **Video Generation** — VEO 3.1 (text-to-video + image-to-video), Grok Video (async polling)
4. **Text-to-Speech** — GPT-4o-mini-TTS, TTS-1, TTS-1-HD (OpenAI-compatible)
5. **Embeddings** — text-embedding-3-large/small, ada-002, gemini-embedding (OpenAI-compatible)

### ทำไมต้อง KNPLabs?

- **Unified Gateway** — API เดียวเข้าถึง 30+ models จาก 10+ ผู้ให้บริการ ลดการ integrate ทีละเจ้า
- **Credit-based pricing** — 1 Credit = 2.5 บาท, fixed rate ไม่ผันผวนตาม USD
- **VEO 3.1 ไม่มีลายน้ำ** — ข้อได้เปรียบสำคัญเหนือ Kie.ai
- **Grok Image/Video** — model ใหม่จาก xAI ที่ยังไม่มีใน provider เดิม
- **ราคาถูก** — DeepSeek V3.2: 2.4/3.6 credits per 1M tokens, Qwen 3.5: 2.4/14.4 credits

### Scope

- เพิ่ม KNPLabs เป็น provider ใหม่ในทั้ง Node.js (LLM routing) และ Python (media gateway)
- Register models ทั้งหมดลง `modelProviderMap` (LLM) และ `mediaModels` (media)
- รองรับ async polling สำหรับ Video generation
- รองรับ Gemini-native API format สำหรับ Nano Banana image generation
- เพิ่ม TTS endpoint ใหม่ (ยังไม่มีในระบบ — ต้องสร้าง pipeline ใหม่)
- เพิ่ม Embeddings routing ผ่าน KNPLabs (เสริม pgvector จาก spec 050)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SmartSpecPro                          │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ LLM Router   │    │ Media Router │                   │
│  │ (Node.js)    │    │ (Python)     │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                           │
│  ┌──────┴───────────────────┴───────┐                   │
│  │         Provider Registry         │                  │
│  │  ┌────────┐ ┌────────┐ ┌───────┐ │                  │
│  │  │ Kie.ai │ │ fal.ai │ │KNPLab │ │ ← NEW           │
│  │  └────────┘ └────────┘ └───┬───┘ │                  │
│  └────────────────────────────┼─────┘                   │
└───────────────────────────────┼─────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  api.knplabai.com/ai  │
                    │                       │
                    │  /v1/chat/completions  │  ← LLM (OpenAI-compat)
                    │  /v1/images/generations│  ← Image (GPT/Grok/Sora)
                    │  /v1beta/models/:id    │  ← Image (Gemini native)
                    │  /v1/videos            │  ← Video (VEO text2video)
                    │  /v1/video/create      │  ← Video (VEO i2v / Grok)
                    │  /v1/video/query       │  ← Video poll (Grok only)
                    │  /v1/audio/speech      │  ← TTS
                    │  /v1/embeddings        │  ← Embeddings
                    └───────────────────────┘
```

### Endpoint Matrix

| Capability | Endpoint | Format | Auth | Response |
|---|---|---|---|---|
| LLM Chat | `/v1/chat/completions` | OpenAI-compat JSON | Bearer token | JSON (stream optional) |
| Image (GPT/Grok/Sora) | `/v1/images/generations` | OpenAI-compat JSON | Bearer token | URL |
| Image (Gemini) | `/v1beta/models/{model}:generateContent` | Gemini-native JSON | Bearer + ?key= | Base64 inline |
| Video (VEO text) | `/v1/videos` | multipart/form-data | Bearer token | Async → poll `/v1/videos/{id}` |
| Video (VEO i2v / Grok) | `/v1/video/create` | JSON | Bearer token | Async → poll |
| Video poll (VEO) | `/v1/videos/{id}` | GET | Bearer token | Status + video_url |
| Video poll (Grok) | `/v1/video/query?id=` | GET | Bearer token | Status + video_url |
| TTS | `/v1/audio/speech` | OpenAI-compat JSON | Bearer token | Binary audio stream |
| Embeddings | `/v1/embeddings` | OpenAI-compat JSON | Bearer token | JSON vector array |

---

## 3. LLM Model Catalog (Complete — from KNPLabs price sheet 2026-03-24)

**Credit → USD conversion**: 1 KNP Credit = 2.5 THB ≈ 0.069 USD (at 36 THB/USD)
**Pricing mapping**: `pricingInput` = KNP credits × 0.069 (USD per 1M tokens)

### 3.1 GPT Models (OpenAI)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `gpt-5-nano` | GPT-5 Nano | 0.06 | 0.48 | 0.004 | 0.033 | budget |
| `gpt-4.1-nano` | GPT-4.1 Nano | 0.12 | 0.48 | 0.008 | 0.033 | budget |
| `gpt-4o-mini` | GPT-4o Mini | 0.18 | 0.72 | 0.012 | 0.050 | budget |
| `gpt-5-mini` | GPT-5 Mini | 0.30 | 2.40 | 0.021 | 0.166 | budget |
| `gpt-oss-20b` | GPT-OSS 20B | 0.40 | 1.60 | 0.028 | 0.110 | budget |
| `gpt-4.1-mini` | GPT-4.1 Mini | 0.48 | 1.92 | 0.033 | 0.132 | budget |
| `gpt-5` | GPT-5 | 1.50 | 12.00 | 0.104 | 0.828 | standard |
| `gpt-5-codex` | GPT-5 Codex | 1.50 | 12.00 | 0.104 | 0.828 | standard |
| `gpt-5.1` | GPT-5.1 | 1.50 | 12.00 | 0.104 | 0.828 | standard |
| `gpt-5.2` | GPT-5.2 | 2.10 | 16.80 | 0.145 | 1.159 | standard |
| `gpt-5.2-codex` | GPT-5.2 Codex | 2.10 | 16.80 | 0.145 | 1.159 | standard |
| `gpt-5.3-chat-latest` | GPT-5.3 | 2.10 | 16.80 | 0.145 | 1.159 | standard |
| `gpt-oss-120b` | GPT-OSS 120B | 2.20 | 8.80 | 0.152 | 0.607 | standard |
| `gpt-4.1` | GPT-4.1 | 2.40 | 9.60 | 0.166 | 0.662 | standard |
| `gpt-5.4-nano-2026-03-17` | GPT-5.4 Nano | 2.40 | 14.40 | 0.166 | 0.994 | standard |
| `gpt-5.3-codex` | GPT-5.3 Codex | 2.80 | 22.40 | 0.193 | 1.546 | premium |
| `gpt-4o` | GPT-4o | 3.00 | 12.00 | 0.207 | 0.828 | premium |
| `gpt-5.4-mini` | GPT-5.4 Mini | 3.20 | 8.40 | 0.221 | 0.580 | premium |
| `gpt-5.4` | GPT-5.4 | 5.50 | 33.00 | 0.380 | 2.277 | premium |
| `gpt-5.4-pro` | GPT-5.4 Pro | 120.00 | 1240.00 | 8.280 | 85.560 | ultra |

### 3.2 Claude Models (Anthropic)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `claude-3-haiku-20240307` | Claude 3 Haiku | 0.50 | 2.50 | 0.035 | 0.173 | budget |
| `claude-3-5-haiku-20241022` | Claude 3.5 Haiku | 3.84 | 19.20 | 0.265 | 1.325 | budget |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | 4.80 | 24.00 | 0.331 | 1.656 | standard |
| `claude-haiku-4-5-20251001-thinking` | Claude Haiku 4.5 Thinking | 4.80 | 24.00 | 0.331 | 1.656 | standard |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet | 6.00 | 30.00 | 0.414 | 2.070 | standard |
| `claude-3-7-sonnet-20250219` | Claude 3.7 Sonnet | 6.00 | 30.00 | 0.414 | 2.070 | standard |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | 14.40 | 72.00 | 0.994 | 4.968 | premium |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 | 14.40 | 72.00 | 0.994 | 4.968 | premium |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | 14.40 | 72.00 | 0.994 | 4.968 | premium |
| `claude-opus-4-6` | Claude Opus 4.6 | 24.00 | 120.00 | 1.656 | 8.280 | premium |
| `claude-opus-4-6-thinking` | Claude Opus 4.6 Thinking | 24.00 | 120.00 | 1.656 | 8.280 | premium |
| `claude-opus-4-5-20251101` | Claude Opus 4.5 | 24.00 | 120.00 | 1.656 | 8.280 | premium |
| `claude-opus-4-1-20250805` | Claude Opus 4.1 | 72.00 | 360.00 | 4.968 | 24.840 | ultra |
| `claude-opus-4-20250514` | Claude Opus 4 | 72.00 | 360.00 | 4.968 | 24.840 | ultra |

### 3.3 Gemini Models (Google)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `gemini-2.0-flash` | Gemini 2.0 Flash | 0.16 | 0.64 | 0.011 | 0.044 | budget |
| `gemini-2.5-flash` | Gemini 2.5 Flash | 0.48 | 4.00 | 0.033 | 0.276 | budget |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | 0.60 | 2.40 | 0.041 | 0.166 | budget |
| `gemini-3-flash-preview` | Gemini 3 Flash | 0.80 | 4.80 | 0.055 | 0.331 | standard |
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite | 1.50 | 9.00 | 0.104 | 0.621 | standard |
| `gemini-2.5-pro` | Gemini 2.5 Pro | 2.00 | 16.00 | 0.138 | 1.104 | standard |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro | 3.20 | 19.20 | 0.221 | 1.325 | premium |
| `gemini-3-pro-preview` | Gemini 3 Pro | 3.20 | 19.20 | 0.221 | 1.325 | premium |
| `gemini-2.5-pro-thinking` | Gemini 2.5 Pro Thinking | 7.50 | 60.00 | 0.518 | 4.140 | premium |

### 3.4 Grok Models (xAI)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `grok-4-1-fast-reasoning` | Grok 4.1 Fast Reasoning | 0.24 | 0.60 | 0.017 | 0.041 | budget |
| `grok-4-fast` | Grok 4 Fast | 0.40 | 1.00 | 0.028 | 0.069 | budget |
| `grok-3-mini` | Grok 3 Mini | 0.36 | 0.60 | 0.025 | 0.041 | budget |
| `grok-4.1-fast` | Grok 4.1 Fast | 0.80 | 6.00 | 0.055 | 0.414 | standard |
| `grok-3` | Grok 3 | 3.60 | 18.00 | 0.248 | 1.242 | premium |
| `grok-4` | Grok 4 | 3.60 | 18.00 | 0.248 | 1.242 | premium |
| `grok-4.1` | Grok 4.1 | 4.00 | 20.00 | 0.276 | 1.380 | premium |
| `grok-3-deepsearch` | Grok 3 Deep Search | 4.00 | 20.00 | 0.276 | 1.380 | premium |
| `grok-4.2` | Grok 4.2 | 6.00 | 30.00 | 0.414 | 2.070 | premium |

### 3.5 GLM Models (Zhipu)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `glm-4.5-flash` | GLM-4.5 Flash | 0.04 | 0.16 | 0.003 | 0.011 | budget |
| `glm-4` | GLM-4 | 0.36 | 1.44 | 0.025 | 0.099 | budget |
| `glm-4.5-air` | GLM-4.5 Air | 1.20 | 4.80 | 0.083 | 0.331 | standard |
| `glm-4.5` | GLM-4.5 | 1.92 | 7.68 | 0.132 | 0.530 | standard |
| `glm-4.6` | GLM-4.6 | 2.40 | 9.60 | 0.166 | 0.662 | standard |
| `glm-4.6-thinking` | GLM-4.6 Thinking | 2.40 | 9.60 | 0.166 | 0.662 | standard |
| `glm-4.5-x` | GLM-4.5 X | 3.20 | 12.80 | 0.221 | 0.883 | premium |
| `glm-4.7` | GLM-4.7 | 4.00 | 16.00 | 0.276 | 1.104 | premium |
| `glm-4.7-thinking` | GLM-4.7 Thinking | 4.00 | 16.00 | 0.276 | 1.104 | premium |
| `glm-5` | GLM-5 | 8.00 | 36.00 | 0.552 | 2.484 | premium |

### 3.6 DeepSeek Models

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M | Tier |
|---|---|---|---|---|---|---|
| `deepseek-v3.2` | DeepSeek V3.2 | 2.40 | 3.60 | 0.166 | 0.249 | standard |
| `deepseek-v3.2-exp` | DeepSeek V3.2 Exp | 2.40 | 3.60 | 0.166 | 0.249 | standard |
| `deepseek-v3.2-thinking` | DeepSeek V3.2 Thinking | 4.00 | 6.00 | 0.276 | 0.414 | standard |
| `deepseek-v3.1` | DeepSeek V3.1 | 4.80 | 14.40 | 0.331 | 0.994 | standard |
| `deepseek-r1` | DeepSeek R1 | 4.80 | 19.20 | 0.331 | 1.325 | premium |
| `deepseek-v3-search` | DeepSeek V3 Search | 6.00 | 24.00 | 0.414 | 1.656 | premium |
| `deepseek-ocr` | DeepSeek OCR | 0.50 | 0.50 | 0.035 | 0.035 | budget |

### 3.7 Other Providers

#### Qwen (Alibaba)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M |
|---|---|---|---|---|---|
| `qwen3-coder-480b-a35b-instruct` | Qwen 3 Coder 480B | 0.06 | 0.30 | 0.004 | 0.021 |
| `qwen3-vl-30b-a3b-instruct` | Qwen 3 VL | 1.50 | 6.00 | 0.104 | 0.414 |
| `qwen3-coder-flash` | Qwen 3 Coder Flash | 2.00 | 8.00 | 0.138 | 0.552 |
| `qwen3.5-397b-a17b` | Qwen 3.5 397B | 2.40 | 14.40 | 0.166 | 0.994 |
| `qwen3.5-plus` | Qwen 3.5 Plus | 3.60 | 9.60 | 0.248 | 0.662 |
| `qwen3-max` | Qwen 3 Max | 6.00 | 22.00 | 0.414 | 1.518 |
| `qwen3-coder` | Qwen 3 Coder | 12.00 | 48.00 | 0.828 | 3.312 |

#### MiniMax

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M |
|---|---|---|---|---|---|
| `MiniMax-M2` | MiniMax M2 | 4.20 | 16.80 | 0.290 | 1.159 |
| `MiniMax-M2.5` | MiniMax M2.5 | 4.20 | 16.80 | 0.290 | 1.159 |
| `MiniMax-M2.7` | MiniMax M2.7 | 12.60 | 50.40 | 0.869 | 3.478 |

#### KIMI (Moonshot)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M |
|---|---|---|---|---|---|
| `kimi-k2.5` | KIMI K2.5 | 8.00 | 42.00 | 0.552 | 2.898 |
| `kimi-k2` | KIMI K2 | 8.00 | 32.00 | 0.552 | 2.208 |

#### Bytedance (Doubao Seed)

| Model ID | Display Name | Input cr/1M | Output cr/1M | USD In/1M | USD Out/1M |
|---|---|---|---|---|---|
| `doubao-seed-1-6-flash-250828` | Doubao Seed 1.6 Flash | 0.90 | 9.00 | 0.062 | 0.621 |
| `doubao-seed-1-6-250615` | Doubao Seed 1.6 | 2.40 | 24.00 | 0.166 | 1.656 |
| `doubao-seed-1-6-thinking-250615` | Doubao Seed 1.6 Thinking | 2.40 | 24.00 | 0.166 | 1.656 |
| `doubao-seed-1-6-vision-250815` | Doubao Seed 1.6 Vision | 4.80 | 38.40 | 0.331 | 2.650 |

### 3.8 Priority & Fallback Strategy

KNPLabs models จะถูก register เป็น **secondary/fallback** สำหรับ models ที่มี direct provider อยู่แล้ว และเป็น **primary** สำหรับ models ใหม่:

| Category | Existing Provider | KNPLabs Role | Priority | Models |
|---|---|---|---|---|
| Claude | Anthropic (direct) | fallback | 30 | claude-* (14 models) |
| GPT | OpenAI/OpenRouter | fallback | 30 | gpt-* (20 models) |
| Gemini | Google (direct) | fallback | 30 | gemini-* (15 models) |
| DeepSeek | — | **primary** | 10 | deepseek-* (7 models) |
| Qwen | — | **primary** | 10 | qwen3* (7 models) |
| GLM | — | **primary** | 10 | glm-* (10 models) |
| Grok | — | **primary** | 10 | grok-* (9 models) |
| MiniMax | — | **primary** | 10 | MiniMax-* (3 models) |
| KIMI | — | **primary** | 10 | kimi-* (2 models) |
| Doubao | — | **primary** | 10 | doubao-* (4 models) |

**Total: ~91 LLM models** (49 fallback + 42 primary-only)

**Recommended Phase 1 models** (seed these first — high value, unique to KNPLabs):

| Model | Why |
|---|---|
| `deepseek-v3.2` | Cheapest capable model (2.4/3.6 cr) |
| `qwen3.5-397b-a17b` | Best value large model (2.4/14.4 cr) |
| `grok-4.1-fast` | Fast + cheap (0.8/6.0 cr) |
| `glm-4.5-flash` | Ultra-cheap (0.04/0.16 cr) |
| `doubao-seed-1-6-flash-250828` | Budget vision (0.9/9.0 cr) |
| `gpt-5-nano` | Cheapest GPT (0.06/0.48 cr) |
| `gpt-5.4` | Flagship reasoning (5.5/33.0 cr) |
| `claude-sonnet-4-6` | Fallback for primary Anthropic |

---

## 4. Media Model Catalog (Complete — from KNPLabs price sheet 2026-03-24)

### 4.1 Image Generation

| Model ID | Display Name | Endpoint | KNP cr/req | SSP Credits | Sizes |
|---|---|---|---|---|---|
| `gpt-image-1.5-all` | GPT Image 1.5 | OpenAI-compat | 0.156 | 11 | 1024x1024, 1536x1024, 1024x1536 |
| `gpt-image-1-all` | GPT Image 1 | OpenAI-compat | 0.160 | 12 | 1024x1024, 1536x1024, 1024x1536 |
| `sora_image` | Sora Image | OpenAI-compat | **0.090** | 7 | 1024x1024, 1536x1024, 1024x1536 |
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | Gemini-native | 0.198 | 14 | Aspect ratios: 1:1, 9:16, 16:9, etc. |
| `gemini-3-pro-image-preview` | Nano Banana Pro | Gemini-native | **1.150** | **80** | Same aspect ratios |
| `gemini-2.5-flash-image` | Nano Banana | Gemini-native | 0.300 | 21 | Same aspect ratios |
| `grok-3-image` | Grok 3 Image | OpenAI-compat | 0.100 | 7 | 960x960, 960x1440, 1440x960 |
| `grok-4-image` | Grok 4 Image | OpenAI-compat | 0.160 | 12 | 960x960, 960x1440, 1440x960 |
| `grok-4.1-image` | Grok 4.1 Image | OpenAI-compat | 0.200 | 14 | 960x960, 960x1440, 1440x960 |

**Price corrections from v2.0**: Sora Image 0.060→0.090, Nano Banana Pro 0.660→1.150

### 4.2 Video Generation (ALL PRICES NOW CONFIRMED)

| Model ID | Display Name | Endpoint | KNP cr/req | SSP Credits | Sizes | Duration |
|---|---|---|---|---|---|---|
| `veo_3_1-fast` | VEO 3.1 Fast | `/v1/videos` (form-data) | 0.860 | 60 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `veo_3_1-fast-4K` | VEO 3.1 Fast 4K | `/v1/videos` | 0.860 | 60 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `veo_3_1-components` | VEO 3.1 Components | `/v1/videos` | 1.460 | 101 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `veo_3_1-4K` | VEO 3.1 4K | `/v1/videos` | 1.700 | 118 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `veo_3_1-components-4K` | VEO 3.1 Components 4K | `/v1/videos` | 1.700 | 118 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `veo_3_1-fast-components-4K` | VEO 3.1 Fast Comp 4K | `/v1/videos` | 1.700 | 118 | 16x9, 9x16, 1x1 | 5s, 8s, 10s |
| `grok-video-3` | Grok Video 3 | `/v1/video/create` (JSON) | **0.800** | **56** | 720P, 1080P | ~5s |
| `grok-video-3-10s` | Grok Video 3 (10s) | `/v1/video/create` (JSON) | **0.850** | **59** | 720P, 1080P | 10s |
| `grok-video-3-15s` | Grok Video 3 (15s) | `/v1/video/create` (JSON) | **1.000** | **69** | 720P, 1080P | 15s |

**Blocker B2 RESOLVED**: All video models now have confirmed pricing. No more TBD models for video.

**Note**: `veo_3_1` (base non-4K) ไม่ปรากฏในราคาล่าสุด — อาจถูกแทนที่ด้วย `veo_3_1-fast` เป็น default

### 4.3 TTS (Text-to-Speech) — STILL TBD

| Model ID | Display Name | Credit Cost | Voices | Formats |
|---|---|---|---|---|
| `gpt-4o-mini-tts` | GPT-4o Mini TTS | ⚠️ TBD | alloy, echo, fable, onyx, nova, shimmer | mp3, opus, aac, flac, wav, pcm |
| `tts-1` | TTS-1 Standard | ⚠️ TBD | alloy, echo, fable, onyx, nova, shimmer | mp3, opus, aac, flac, wav, pcm |
| `tts-1-hd` | TTS-1 HD | ⚠️ TBD | alloy, echo, fable, onyx, nova, shimmer | mp3, opus, aac, flac, wav, pcm |

**⚠️ TTS models remain disabled (`isEnabled = false`) until pricing is confirmed from KNPLabs**

### 4.4 Embeddings (PRICES NOW CONFIRMED)

| Model ID | Display Name | Dimensions | Input cr/1M | Output cr/1M | USD In/1M |
|---|---|---|---|---|---|
| `text-embedding-3-small` | Text Embedding 3 Small | 1,536 | 0.06 | 0.06 | 0.004 |
| `text-embedding-ada-002` | Text Embedding Ada 002 | 1,536 | 0.30 | 0.30 | 0.021 |
| `text-embedding-3-large` | Text Embedding 3 Large | 3,072 | 0.39 | 0.39 | 0.027 |
| `gemini-embedding-001` | Gemini Embedding 001 | TBD | 1.00 | 3.60 | 0.069 |
| `gemini-embedding-2-preview` | Gemini Embedding 2 | TBD | 1.20 | 4.80 | 0.083 |
| `knp-text-embedding-ada-002` | Text Embedding Ada 002 | 1,536 | per-token |
| `knp-gemini-embedding-exp` | Gemini Embedding Exp | configurable | per-token |

---

## 5. Feature Catalog

### Level 1 — Core Provider Integration (Week 1-2)

#### F1.1: KNPLabs Provider Registration (Node.js)

**เป้าหมาย**: Register KNPLabs เป็น LLM provider ใหม่ใน `llmProviders` table

**Changes**:
- `apps/web/drizzle/schema.ts` — ไม่ต้อง alter schema (ใช้ structure เดิม)
- Seed script — Insert provider record + model mappings (UPSERT for idempotency)
- ⚠️ `llmRouter.ts` ไม่ต้องแก้ code — router ใช้ `{baseUrl}/v1/chat/completions` อัตโนมัติ; apiStyle default = "chat-completions" ถูกต้องแล้ว

**IMPORTANT — Routing Rule Requirement**:
- ต้องมี routing rule ด้วย `maxFallbacks ≥ 1` สำหรับ shared models (Claude, GPT, Gemini) มิฉะนั้น fallback ไปหา KNPLabs จะไม่ trigger
- ตรวจสอบว่า wildcard rule `"*"` มี `maxFallbacks ≥ 1` หรือไม่ ถ้าไม่มีต้อง insert

**IMPORTANT — modelId Must Match Existing Rows**:
- สำหรับ fallback models (Claude, GPT, Gemini) `modelId` ใน `model_provider_map` ต้องเป็นค่าเดียวกับ row ของ primary provider เดิม
- ตรวจสอบ: `SELECT DISTINCT "modelId" FROM model_provider_map WHERE "providerModelId" LIKE 'claude%'`
- ใช้ canonical modelId จาก row เดิม ไม่ใช่ KNPLabs providerModelId

**IMPORTANT — llmModels Table Prerequisite**:
- ตรวจสอบว่า `modelProviderMap.modelId` มี FK ไปหา `llm_models` หรือไม่
- ถ้ามี FK: ต้อง seed `llm_models` rows ก่อนสำหรับ new models (DeepSeek, Qwen, GLM, MiniMax, KIMI)
- ถ้าไม่มี FK: seed เฉพาะ `model_provider_map` พอ

**Database Records** (complete with all required columns):
```sql
-- Provider
INSERT INTO llm_providers (name, slug, "apiKeyEncrypted", "baseUrl", "apiStyle", enabled, "sortOrder", "providerType")
VALUES ('KNPLabs AI', 'knplabai', encrypt('sk-xxx'), 'https://api.knplabai.com/ai/v1', 'chat-completions', true, 30, 'secondary')
ON CONFLICT (slug) DO UPDATE SET "baseUrl" = EXCLUDED."baseUrl", enabled = EXCLUDED.enabled;

-- Model mappings — MUST include modelName, apiStyle, and ALL 9 capability flags
INSERT INTO model_provider_map (
  "modelId", "providerId", "providerModelId", "modelName", "apiStyle",
  "pricingInput", "pricingOutput", priority, "isEnabled",
  "supportsVision", "supportsThinking", "supportsFunctionTools", "supportsWebSearch",
  "supportsCodeExecution", "supportsComputerUse", "supportsBackground",
  "supportsResponsesApi", "supportsStructuredOutput", "contextLength"
) VALUES
  -- ALL models isEnabled = false — admin จะ enable เฉพาะที่ต้องการใช้
  -- NEW primary models (no existing provider)
  ('deepseek-v3.2', {knplab_id}, 'deepseek-v3.2', 'DeepSeek V3.2', 'chat-completions',
   0.166, 0.249, 10, false,
   false, false, true, false, true, false, false, false, false, 128000),
  ('qwen3.5-397b-a17b', {knplab_id}, 'qwen3.5-397b-a17b', 'Qwen 3.5 397B', 'chat-completions',
   0.166, 0.994, 10, false,
   true, false, true, false, false, false, false, false, false, 128000),
  ('glm-5', {knplab_id}, 'glm-5', 'GLM-5', 'chat-completions',
   0.552, 2.484, 10, false,
   true, false, true, false, false, false, false, false, false, 128000),
  ('MiniMax-M2.5', {knplab_id}, 'MiniMax-M2.5', 'MiniMax M2.5', 'chat-completions',
   0.290, 1.159, 10, false,
   false, false, true, false, false, false, false, false, false, 128000),
  ('kimi-k2.5', {knplab_id}, 'kimi-k2.5', 'KIMI K2.5', 'chat-completions',
   0.552, 2.898, 10, false,
   false, false, true, false, false, false, false, false, false, 256000),
  ('grok-4.1-fast', {knplab_id}, 'grok-4.1-fast', 'Grok 4.1 Fast', 'chat-completions',
   0.055, 0.414, 10, false,
   false, false, true, false, false, false, false, false, false, 131072),
  ('glm-4.5-flash', {knplab_id}, 'glm-4.5-flash', 'GLM-4.5 Flash', 'chat-completions',
   0.003, 0.011, 10, false,
   false, false, true, false, false, false, false, false, false, 128000),
  ('doubao-seed-1-6-flash-250828', {knplab_id}, 'doubao-seed-1-6-flash-250828', 'Doubao Seed 1.6 Flash', 'chat-completions',
   0.062, 0.621, 10, false,
   false, false, true, false, false, false, false, false, false, 128000),
  ('gpt-5-nano', {knplab_id}, 'gpt-5-nano', 'GPT-5 Nano', 'chat-completions',
   0.004, 0.033, 10, false,
   false, false, true, false, false, false, false, false, false, 128000),
  ('gpt-5.4', {knplab_id}, 'gpt-5.4', 'GPT-5.4', 'chat-completions',
   0.380, 2.277, 10, false,
   true, true, true, true, true, false, false, false, true, 128000),
  -- FALLBACK models (modelId must match existing primary provider rows)
  -- Use: SELECT "modelId" FROM model_provider_map WHERE "providerModelId" LIKE 'claude%' LIMIT 1
  ('{existing_claude_sonnet_modelId}', {knplab_id}, 'claude-sonnet-4-6', 'Claude Sonnet 4.6 (KNP)', 'chat-completions',
   0.994, 4.968, 30, false,
   true, true, true, false, false, false, false, false, true, 200000),
  -- ... etc for all 91 models (see Section 3.1-3.7 for complete list)
ON CONFLICT ("modelId", "providerId") DO UPDATE SET
  "pricingInput" = EXCLUDED."pricingInput",
  "pricingOutput" = EXCLUDED."pricingOutput";
```

**Complete USD Pricing**: ดูตาราง full pricing ใน Section 3.1-3.7 (91 models ทั้งหมด)

**Phase 1 Seed — USD pricing for recommended first-wave models**:

| Model | KNP Input | KNP Output | USD Input/1M | USD Output/1M |
|---|---|---|---|---|
| deepseek-v3.2 | 2.40 | 3.60 | 0.166 | 0.249 |
| qwen3.5-397b-a17b | 2.40 | 14.40 | 0.166 | 0.994 |
| grok-4.1-fast | 0.80 | 6.00 | 0.055 | 0.414 |
| glm-4.5-flash | 0.04 | 0.16 | 0.003 | 0.011 |
| doubao-seed-1-6-flash-250828 | 0.90 | 9.00 | 0.062 | 0.621 |
| gpt-5-nano | 0.06 | 0.48 | 0.004 | 0.033 |
| gpt-5.4 | 5.50 | 33.00 | 0.380 | 2.277 |
| claude-sonnet-4-6 (fallback) | 14.40 | 72.00 | 0.994 | 4.968 |

**Note — KNPLabs response cost field**: ต้องตรวจสอบว่า KNPLabs response มี `usage.cost` หรือไม่ ถ้าไม่มี cost calculation จะ fallback ใช้ `pricingInput/pricingOutput` จาก `model_provider_map` (Priority 2 ใน `calculateCost`)

**Note — Streaming**: KNPLabs ใช้ OpenAI SSE format มาตรฐาน — streaming ทำงานได้ทันทีผ่าน `llmRoutes.ts` ที่มีอยู่แล้ว ไม่ต้องแก้ code

**Risk**: Low — ใช้ pattern เดิมทั้งหมด, OpenAI-compatible API

#### F1.2: KNPLabs Python Provider (Media Gateway)

**เป้าหมาย**: สร้าง Python provider class สำหรับ image + video generation

**New Files**:
- `python-backend/app/llm_proxy/providers/knplabai_provider.py` — Media provider (image/video/TTS/embeddings)
- `python-backend/app/core/config.py` — เพิ่ม `KNPLABAI_API_KEY: str = ""` and `KNPLABAI_BASE_URL: str = "https://api.knplabai.com/ai"`

**⚠️ Architecture Decision — Provider Layer Separation**:
- **KNPLabAIProvider เป็น MEDIA provider** — standalone class (ไม่ inherit BaseLLMProvider)
- **LLM chat completions** ถูก handle โดย Node.js llmRouter ผ่าน `llmProviders` table เท่านั้น — ไม่ต้องมี Python LLM provider
- Pattern เดียวกับ `FalAIProvider` (standalone class, ไม่ inherit base)

**⚠️ Storage Upload Decision**:
- `_upload_and_return_url()` **ไม่มีอยู่ใน codebase** — S3/R2 upload ทำที่ Celery task layer ผ่าน `media_pipeline.py` → `upload_to_r2()`
- Provider methods จะ **return raw bytes** (image bytes, audio bytes) — Celery task จะ handle upload
- Pattern เดียวกับ fal.ai: provider return data → task upload to storage

**Key Design**:
```python
import re
import httpx
import structlog
from app.core.media_job_validators import validate_uri_strict

logger = structlog.get_logger()

_KNPLAB_TASK_ID_RE = re.compile(r"^[a-zA-Z0-9_\-:.]{4,256}$")
_MAX_RESPONSE_BYTES = 20 * 1024 * 1024  # 20 MB
_MAX_TTS_INPUT_LENGTH = 4096
_ALLOWED_TTS_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})
_ALLOWED_TTS_FORMATS = frozenset({"mp3", "opus", "aac", "flac", "wav", "pcm"})

# Model allowlists (prevent path/query injection)
_IMAGE_OPENAI_MODELS = frozenset({
    "gpt-image-1.5-all", "gpt-image-1-all", "sora_image",
    "grok-3-image", "grok-4-image", "grok-4.1-image",
})
_IMAGE_GEMINI_MODELS = frozenset({
    "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-2.5-flash-image",
})
_VIDEO_FORM_MODELS = frozenset({
    "veo_3_1", "veo_3_1-4K", "veo_3_1-fast", "veo_3_1-fast-4K",
    "veo_3_1-components", "veo_3_1-components-4K", "veo_3_1-fast-components-4K",
})
_VIDEO_JSON_MODELS = frozenset({
    "veo3-fast-frames", "veo3.1-components",
    "grok-video-3", "grok-video-3-10s", "grok-video-3-15s",
})

class KNPLabAIProvider:
    """
    KNPLabs AI MEDIA provider (standalone — not BaseLLMProvider).
    LLM chat is handled by Node.js llmRouter via llmProviders table.
    """

    def __init__(self, api_key: str, base_url: str = "https://api.knplabai.com/ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        # SECURITY: _headers contains the API key — never log this dict
        self._headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(
            follow_redirects=False,  # SSRF: prevent redirect-based attacks
            timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=5.0),
        )

    async def aclose(self):
        await self.client.aclose()

    async def __aenter__(self): return self
    async def __aexit__(self, *args): await self.aclose()

    # --- Validation helpers ---
    @staticmethod
    def _validate_task_id(task_id: str) -> None:
        """Prevent URL/path injection in polling requests."""
        if not isinstance(task_id, str) or not _KNPLAB_TASK_ID_RE.match(task_id):
            raise ValueError(f"Invalid KNPLabs task_id: {str(task_id)[:50]!r}")

    @staticmethod
    def _validate_model_id(model: str, allowlist: frozenset) -> None:
        if model not in allowlist:
            raise ValueError(f"Unknown KNPLabs model: {model!r}")

    def _sanitize_prompt(self, prompt: str) -> str:
        """Strip control chars, cap length."""
        if not isinstance(prompt, str):
            raise ValueError("Prompt must be a string")
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", prompt)
        return cleaned[:100_000]  # 100K char limit (match fal.ai)

    def _safe_parse_response(self, resp: httpx.Response) -> dict:
        """Size-capped JSON parse."""
        if len(resp.content) > _MAX_RESPONSE_BYTES:
            raise ValueError(f"Response exceeds {_MAX_RESPONSE_BYTES // (1024*1024)}MB limit")
        return resp.json()

    # --- Image generation ---
    async def generate_image_openai(self, model, prompt, size, n=1) -> dict:
        """GPT Image, Grok Image, Sora — returns {"url": "https://..."}"""
        self._validate_model_id(model, _IMAGE_OPENAI_MODELS)
        sanitized = self._sanitize_prompt(prompt)
        resp = await self.client.post(
            f"{self.base_url}/v1/images/generations",
            json={"model": model, "prompt": sanitized, "n": n, "size": size},
            headers=self._headers,
        )
        return self._safe_parse_response(resp)

    async def generate_image_gemini(self, model, prompt, aspect_ratio="1:1") -> bytes:
        """Nano Banana — returns raw image bytes (caller uploads to S3/R2)."""
        self._validate_model_id(model, _IMAGE_GEMINI_MODELS)
        sanitized = self._sanitize_prompt(prompt)
        # SECURITY: API key ONLY in Bearer header — NOT in URL query param
        # If KNPLabs strictly requires ?key=, use env var + redact from all logs
        url = f"{self.base_url}/v1beta/models/{model}:generateContent"
        resp = await self.client.post(url, json={
            "contents": [{"role": "user", "parts": [{"text": sanitized}]}],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {"aspectRatio": aspect_ratio}
            }
        }, headers=self._headers)
        data = self._safe_parse_response(resp)
        # Extract base64 with size check before decode
        for part in data["candidates"][0]["content"]["parts"]:
            if "inlineData" in part:
                raw_b64 = part["inlineData"]["data"]
                if len(raw_b64) > (_MAX_RESPONSE_BYTES * 4 // 3) + 64:
                    raise ValueError("Inline image exceeds 20MB")
                return base64.b64decode(raw_b64)  # → raw bytes, task uploads
        raise ValueError("No image in Gemini response")

    # --- Video generation ---
    async def create_video_veo(self, model, prompt, size, seconds) -> str:
        """VEO text-to-video (form-data). Returns task_id."""
        self._validate_model_id(model, _VIDEO_FORM_MODELS)
        sanitized = self._sanitize_prompt(prompt)
        resp = await self.client.post(
            f"{self.base_url}/v1/videos",
            data={"model": model, "prompt": sanitized, "size": size,
                  "seconds": str(seconds), "watermark": "false"},
            headers={"Authorization": f"Bearer {self.api_key}"},  # no Content-Type for form-data
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0),
        )
        data = self._safe_parse_response(resp)
        task_id = data["id"]
        self._validate_task_id(task_id)
        return task_id

    async def create_video_json(self, model, prompt, images=None, aspect_ratio="16:9") -> str:
        """VEO i2v + Grok Video (JSON body). Returns task_id."""
        self._validate_model_id(model, _VIDEO_JSON_MODELS)
        sanitized = self._sanitize_prompt(prompt)
        if images:
            for url in images:
                validate_uri_strict(url)  # SSRF: DNS-resolving, IPv6-aware
        body = {"model": model, "prompt": sanitized, "aspect_ratio": aspect_ratio}
        if images:
            body["images"] = images
        resp = await self.client.post(
            f"{self.base_url}/v1/video/create",
            json=body, headers=self._headers,
        )
        data = self._safe_parse_response(resp)
        task_id = data["id"]
        self._validate_task_id(task_id)
        return task_id

    async def poll_video_status(self, task_id, model) -> dict:
        """Poll with per-request timeout. Route to correct endpoint."""
        self._validate_task_id(task_id)
        poll_timeout = httpx.Timeout(connect=10.0, read=30.0, write=5.0, pool=5.0)
        if model in ("grok-video-3", "grok-video-3-10s", "grok-video-3-15s"):
            resp = await self.client.get(
                f"{self.base_url}/v1/video/query",
                params={"id": task_id},
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=poll_timeout,
            )
        else:
            resp = await self.client.get(
                f"{self.base_url}/v1/videos/{task_id}",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=poll_timeout,
            )
        return self._safe_parse_response(resp)

    # --- TTS ---
    async def generate_speech(self, model, input_text, voice="alloy", response_format="mp3") -> bytes:
        """TTS — returns raw audio bytes (caller uploads to S3/R2)."""
        if voice not in _ALLOWED_TTS_VOICES:
            raise ValueError(f"Invalid TTS voice: {voice!r}")
        if response_format not in _ALLOWED_TTS_FORMATS:
            raise ValueError(f"Invalid TTS format: {response_format!r}")
        sanitized = self._sanitize_prompt(input_text)
        if len(sanitized) > _MAX_TTS_INPUT_LENGTH:
            raise ValueError(f"TTS input exceeds {_MAX_TTS_INPUT_LENGTH} chars")
        resp = await self.client.post(
            f"{self.base_url}/v1/audio/speech",
            json={"model": model, "input": sanitized, "voice": voice,
                  "response_format": response_format},
            headers=self._headers,
        )
        content_type = resp.headers.get("Content-Type", "")
        if not content_type.startswith("audio/"):
            raise ValueError(f"Unexpected TTS Content-Type: {content_type[:80]!r}")
        if len(resp.content) > _MAX_RESPONSE_BYTES:
            raise ValueError("TTS audio exceeds 20MB")
        return resp.content  # → raw bytes, task uploads

    # --- Embeddings ---
    async def create_embedding(self, model, input_text, dimensions=None) -> list[float]:
        """Returns validated float vector."""
        sanitized = self._sanitize_prompt(input_text)
        body = {"model": model, "input": sanitized}
        if dimensions:
            body["dimensions"] = dimensions
        resp = await self.client.post(
            f"{self.base_url}/v1/embeddings",
            json=body, headers=self._headers,
            timeout=httpx.Timeout(connect=10.0, read=30.0),
        )
        data = self._safe_parse_response(resp)
        embedding = data["data"][0]["embedding"]
        # Validate before returning to pgvector
        if not isinstance(embedding, list) or not all(isinstance(v, (int, float)) for v in embedding):
            raise ValueError("Embedding contains non-numeric values")
        return [float(v) for v in embedding]
```

**Risk**: Medium — ต้องรองรับ 2 API formats สำหรับ image, 2 polling endpoints สำหรับ video

#### F1.3: Media Provider & Model Registration

**เป้าหมาย**: Register KNPLabs ใน `media_providers` + seed `media_models` ทั้งหมด

**Seed Script**: `apps/web/server/seeds/059-knplabai-media-models.ts` (TypeScript — same DB, consistent with Node.js seed convention)

**Complete SSP Credit Cost Table** (KNP credits × 69, rounded up):

| Model | KNP Credit | SSP Credits | Type |
|---|---|---|---|
| gpt-image-1.5-all | 0.156 | 11 | image |
| gpt-image-1-all | 0.160 | 12 | image |
| sora_image | 0.090 | 7 | image |
| gemini-3.1-flash-image-preview | 0.198 | 14 | image |
| gemini-3-pro-image-preview | 1.150 | 80 | image |
| gemini-2.5-flash-image | 0.300 | 21 | image |
| grok-3-image | 0.100 | 7 | image |
| grok-4-image | 0.160 | 12 | image |
| grok-4.1-image | 0.200 | 14 | image |
| veo_3_1-fast | 0.860 | 60 | video |
| veo_3_1-fast-4K | 0.860 | 60 | video |
| veo_3_1-components | 1.460 | 101 | video |
| veo_3_1-4K | 1.700 | 118 | video |
| veo_3_1-components-4K | 1.700 | 118 | video |
| veo_3_1-fast-components-4K | 1.700 | 118 | video |
| grok-video-3 | 0.800 | 56 | video |
| grok-video-3-10s | 0.850 | 59 | video |
| grok-video-3-15s | 1.000 | 69 | video |

**⚠️ ALL models seed with `isEnabled = false`** — จะ enable ทีหลังเฉพาะที่ใช้งานจริง

**⚠️ TTS models ยังไม่มีราคา** — seed ด้วย `creditCost = 0, isEnabled = false`:
- `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`

```sql
-- Media Provider
INSERT INTO media_providers (name, slug, "providerType", "baseUrl", enabled, config)
VALUES ('KNPLabs AI', 'knplabai', 'multimodal', 'https://api.knplabai.com/ai', true,
  '{"timeout": 300000, "maxRetries": 2, "pollIntervalMs": 10000}')
ON CONFLICT (slug) DO UPDATE SET config = EXCLUDED.config;

-- Image Models (use computed SSP credit costs from table above)
INSERT INTO media_models ("modelId", "providerId", "displayName", "mediaType", "creditCost", "isEnabled", ...)
VALUES
  ('knp-gpt-image-1.5', {id}, 'GPT Image 1.5', 'image', 11, true, ...),
  ('knp-nano-banana-2', {id}, 'Nano Banana 2', 'image', 14, true, ...),
  -- ALL models disabled by default — enable manually per model when ready
  ('grok-video-3', {id}, 'Grok Video 3', 'video', 56, false, ...),
  ('gpt-4o-mini-tts', {id}, 'GPT-4o Mini TTS', 'audio', 0, false, ...)
ON CONFLICT ("modelId") DO UPDATE SET "creditCost" = EXCLUDED."creditCost";
-- NOTE: ALL isEnabled = false — admin จะ enable เฉพาะ model ที่ต้องการใช้งานจริง
```

**⚠️ isEnabled Strategy**: ทุก model (ทั้ง LLM และ Media) seed ด้วย `isEnabled = false` — Admin จะ enable ทีหลังเฉพาะที่ใช้งานจริงผ่าน Admin Dashboard
```

#### F1.4: Media Dispatch Wiring (NEW — was missing)

**เป้าหมาย**: Wire KNPLabs provider into the media generation request path

**⚠️ ไม่ใช่ `factory.py`** — factory เป็น LLM provider factory สำหรับ `BaseLLMProvider` instances; KNPLabs media เป็น standalone class

**Files to modify**:
- `python-backend/app/services/media_generation.py` (or equivalent dispatch layer) — Add routing for `provider=knplabai`
- `python-backend/app/tasks/__init__.py` — Register `knplabai_video_task` in Celery autodiscovery
- `python-backend/app/llm_proxy/providers/__init__.py` — Export `KNPLabAIProvider`

**Dispatch Logic**:
```python
# In media generation dispatch
if provider_slug == "knplabai":
    from app.llm_proxy.providers.knplabai_provider import KNPLabAIProvider
    async with KNPLabAIProvider(api_key=get_media_provider_key("knplabai")) as provider:
        if media_type == "image":
            if model in provider._IMAGE_GEMINI_MODELS:
                img_bytes = await provider.generate_image_gemini(model, prompt, aspect_ratio)
                # Upload bytes via media_pipeline → return URL
            else:
                result = await provider.generate_image_openai(model, prompt, size)
                # Return URL from response
        elif media_type == "video":
            # Dispatch to Celery task for async polling
            knplabai_video_task.delay(media_task_id=task.id)
        elif media_type == "audio":
            audio_bytes = await provider.generate_speech(model, text, voice, format)
            # Upload bytes via media_pipeline → return URL
```

**Celery Task Registration** in `tasks/__init__.py`:
```python
from app.tasks.knplabai_video_task import poll_knplabai_video  # noqa: F401
```

**Note**: ต้องเพิ่ม KNPLabs model check ใน `recover_stuck_task` periodic task ด้วย:
```python
# In media_tasks.py recover_stuck_task
elif task.model in KNPLabAIProvider.VIDEO_MODELS:
    poll_knplabai_video.delay(media_task_id=task.id)
```

---

### Level 2 — Advanced Media Features (Week 2-3)

#### F2.1: Gemini-Native Image Endpoint Adapter

**เป้าหมาย**: Handle Nano Banana models ที่ใช้ Gemini API format แทน OpenAI-compat

**Key Challenges**:
- Request format ต่างกันสิ้นเชิง (contents[].parts[] vs prompt)
- Response เป็น base64 inline data แทน URL
- ⚠️ **SECURITY**: API key ต้องอยู่ใน Bearer header เท่านั้น — ห้ามใส่ใน URL `?key=` (จะ leak ไปใน logs, proxies, tracebacks)
- Provider return raw bytes → Celery task handle S3/R2 upload
- ต้อง size-check response ก่อน base64 decode (ป้องกัน OOM)

**⚠️ Gemini Auth Verification Required**:
- ต้องทดสอบว่า KNPLabs Gemini endpoint ยอมรับ Bearer-only auth หรือไม่
- ถ้า **ต้องการ `?key=` เท่านั้น**: ใช้ env var + implement log sanitizer ที่ redact `key=xxx` จากทุก log output
- ถ้า **ยอมรับ Bearer**: ใช้ Bearer เท่านั้น (preferred)

**Implementation**: ดู updated provider class ใน F1.2 (method `generate_image_gemini`)

**Aspect Ratio Mapping**:

| Ratio | Description |
|---|---|
| 1:1 | Square (Instagram) |
| 9:16 | Portrait (TikTok/Reels) |
| 16:9 | Landscape (YouTube) |
| 4:3, 3:4 | Standard |
| 3:2, 2:3 | Photo |
| 5:4, 4:5 | Near-square |
| 21:9 | Ultrawide |

#### F2.2: Video Generation — Async Polling Pipeline

**เป้าหมาย**: Handle async video creation with 2 different polling patterns

**VEO Flow** (text-to-video):
```
POST /v1/videos (form-data) → {"id": "video_xxx", "status": "pending"}
  ↓ poll every 10s
GET /v1/videos/{id} → {"status": "completed", "video_url": "https://..."}
  ↓ fallback if no URL
GET /v1/videos/{id}/content → {"video_url": "https://..."}
```

**VEO Image-to-Video + Grok Video Flow**:
```
POST /v1/video/create (JSON) → {"id": "xxx", "status": "pending"}
  ↓ poll every 10s
# VEO i2v: GET /v1/videos/{id}
# Grok:    GET /v1/video/query?id={id}
```

**Integration with Celery**:
- Video creation triggers a Celery task (`knplabai_video_task`)
- ⚠️ ต้องใช้ `_run_async()` helper จาก `media_tasks.py` (Celery prefork mode — ห้าม `asyncio.run()`)
- ⚠️ task ห้ามรับ API key เป็น argument — ต้อง lookup จาก DB via `get_media_provider_key("knplabai")`
- On completion: download video → upload via `media_pipeline.py` → update `mediaCallbackEvents`
- On failure: call `_mark_task_failed_async()` consistent with kie.ai pattern

**Polling Safety Requirements**:
```python
import random
_MAX_POLL_ATTEMPTS = 60          # Hard ceiling (10 min at 10s base)
_POLL_BASE_INTERVAL_S = 10.0
_POLL_JITTER_S = 2.0             # ±2s jitter prevents synchronized bursts
_POLL_REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=5.0, pool=5.0)

for attempt in range(_MAX_POLL_ATTEMPTS):
    interval = _POLL_BASE_INTERVAL_S + random.uniform(-_POLL_JITTER_S, _POLL_JITTER_S)
    await asyncio.sleep(interval)
    status = await provider.poll_video_status(task_id, model)
    if status.get("status") == "completed":
        video_url = status.get("video_url")
        if not video_url:
            # Fallback: GET /v1/videos/{id}/content
            content_resp = await provider.client.get(...)
            video_url = content_resp.json().get("video_url")
        break
    elif status.get("status") in ("failed", "error"):
        raise RuntimeError(f"Video generation failed: {status}")
else:
    raise TimeoutError(f"Video {task_id} did not complete after {_MAX_POLL_ATTEMPTS} polls")
```

**New Celery Task**: `python-backend/app/tasks/knplabai_video_task.py`

#### F2.3: Image-to-Video Support

**เป้าหมาย**: Support VEO image-to-video ที่รับ image URL เป็น input

**Key Differences from text-to-video**:
- ใช้ endpoint `/v1/video/create` (JSON body, ไม่ใช่ form-data)
- ต้องมี `images` array ของ URL ที่เข้าถึงได้จากอินเทอร์เน็ต
- Model `veo3-fast-frames` รับ 2 ภาพ, `veo3.1-components` รับ 3 ภาพ
- ต้อง validate ว่า image URL เป็น public (ไม่ใช่ localhost/internal)

**SSRF Protection** — ⚠️ ใช้ `validate_uri_strict` ที่มีอยู่แล้ว (ห้าม implement custom blocklist):
```python
from app.core.media_job_validators import validate_uri_strict

async def _validate_image_urls(self, images: list[str]) -> None:
    """SSRF: validate all image URLs using the shared strict validator.
    - DNS-resolving (prevents DNS rebinding)
    - IPv6-aware (blocks ::ffff:127.0.0.1, [fd00::1], etc.)
    - Blocks decimal/octal IPs (2130706433 → 127.0.0.1)
    - Shell metacharacter check
    """
    for url in images:
        if not isinstance(url, str):
            raise ValueError("image URL must be a string")
        validate_uri_strict(url)
```
**ห้ามใช้ custom string-prefix blocklist** — มีช่องโหว่ DNS rebinding, IPv6 bypass, decimal IP bypass

#### F2.4: TTS Pipeline (New Capability)

**เป้าหมาย**: เพิ่ม Text-to-Speech เป็น media type ใหม่ในระบบ

**Schema Change** (if not already supported):
- ตรวจสอบว่า `media_provider_type` enum มี `"audio"` แล้ว — ✅ มีอยู่แล้ว
- `mediaModels` table รองรับ `voices` column — ✅ มีอยู่แล้ว

**TTS Request Flow**:
```
User → tRPC/skill → Python TTS task → KNPLabs /v1/audio/speech → binary audio
  → upload to S3/R2 → return URL to user
```

**Implementation**: ดู updated provider class ใน F1.2 (method `generate_speech`)

**Security Requirements**:
- ✅ Voice allowlist: `{"alloy", "echo", "fable", "onyx", "nova", "shimmer"}`
- ✅ Format allowlist: `{"mp3", "opus", "aac", "flac", "wav", "pcm"}`
- ✅ Input length cap: 4,096 chars (match OpenAI TTS limit)
- ✅ Prompt sanitization (strip control characters)
- ✅ Response Content-Type validation (must be `audio/*`)
- ✅ Response size cap: 20MB
- ✅ Returns raw bytes → Celery task handles S3/R2 upload

---

### Level 3 — Embeddings & Intelligence (Week 3-4)

#### F3.1: Embeddings via KNPLabs

**เป้าหมาย**: เพิ่ม `create_embedding()` method บน KNPLabAIProvider สำหรับ explicit use

**⚠️ Scoping Decision — ไม่ทำ implicit fallback ใน embedding_service.py**:
- ระบบปัจจุบันใช้ `LocalMiniLMEmbedding` (384 dimensions, sync `embed_text()`)
- KNPLabs `text-embedding-3-large` return 3,072 dimensions
- **Dimension mismatch จะ corrupt pgvector search** — cosine similarity ระหว่าง 384-dim กับ 3072-dim จะ return ผลผิด
- `EmbeddingProvider.embed_text()` เป็น sync method — KNPLabs ต้อง async httpx call
- การทำ implicit fallback ต้อง migration + circuit breaker plumbing ที่ไม่มีใน embedding layer

**Scope สำหรับ spec 059**:
- ✅ เพิ่ม `create_embedding()` method บน `KNPLabAIProvider` (ดู F1.2)
- ✅ Method มี response validation (type check, dimension check)
- ❌ ไม่ wire เข้า `embedding_service.py` เป็น implicit fallback
- 📋 Implicit fallback เป็น future work ที่ต้อง: (a) migrate pgvector indexes ให้รองรับ dimension ใหม่ (b) สร้าง `AsyncEmbeddingProvider` base class

**Explicit Use Cases** (call `provider.create_embedding()` directly):
- Admin embedding test button
- Batch re-embedding with new model (migration tool)
- New features ที่ใช้ different embedding dimension ตั้งแต่แรก

**Dimension Safety**:
```python
_EXPECTED_DIMS = {
    "text-embedding-3-large": 3072,
    "text-embedding-3-small": 1536,
    "text-embedding-ada-002": 1536,
}

def _validate_embedding(self, embedding: list, model: str) -> list[float]:
    expected = _EXPECTED_DIMS.get(model)
    if expected and len(embedding) != expected:
        raise ValueError(f"Dimension mismatch: expected {expected}, got {len(embedding)}")
    return [float(v) for v in embedding]
```

#### F3.2: Cost Tracking & Credit Conversion

**เป้าหมาย**: Accurate cost tracking ที่แปลง KNPLabs credits → SmartSpecPro credits

**Conversion Formula**:
```
KNPLabs 1 credit = 2.5 THB = ~0.069 USD (at 36 THB/USD)
SmartSpecPro 1 credit = 0.001 USD

KNP credits → SSP credits = knp_credits × 0.069 / 0.001 = knp_credits × 69
```

**For LLM (per-token)**:
```
ssp_credits = ceil((input_tokens × knp_input_rate + output_tokens × knp_output_rate) × 69 / 1M)
```

**For Media (per-request fixed)**:
```python
from decimal import Decimal, ROUND_UP
ssp_credits = int((Decimal(str(knp_credit_cost)) * Decimal("69")).to_integral_value(rounding=ROUND_UP))
```
⚠️ ใช้ `Decimal` ไม่ใช่ float เพื่อป้องกัน IEEE 754 rounding errors

**Example**: GPT Image 1.5 at 0.156 KNP credits → Decimal("0.156") × 69 = 10.764 → ceil = 11 SSP credits

**Pre-flight Credit Check** (ต้อง implement ก่อนเรียก API):
```python
# In Celery task / media dispatch BEFORE calling KNPLabs API
credit_cost = get_model_credit_cost(model_id)  # from media_models.creditCost
if credit_cost is None or credit_cost <= 0:
    raise ValueError(f"Model {model_id} has no configured credit cost — blocked")
if user_credits < credit_cost:
    raise InsufficientCreditsError(f"Need {credit_cost} credits, have {user_credits}")
```

#### F3.3: Admin Dashboard — Provider Management

**เป้าหมาย**: แสดง KNPLabs ใน admin provider management page

**Changes**:
- Provider list page แสดง KNPLabs พร้อม health status
- Model list แสดง models ทั้งหมดพร้อม pricing
- Test connectivity button
- Usage analytics per model

---

## 6. Database Changes

### 6.1 No Schema Migration Required

ใช้ tables เดิมทั้งหมด:
- `llm_providers` — เพิ่ม record ใหม่
- `model_provider_map` — เพิ่ม model mappings
- `media_providers` — เพิ่ม record ใหม่
- `media_models` — เพิ่ม model records

### 6.2 Seed Data Script

สร้าง seed script ที่ idempotent (upsert):
- `apps/web/server/seeds/059-knplabai-provider.ts` — Node.js side (LLM)
- `python-backend/app/seeds/knplabai_media_models.py` — Python side (Media)

---

## 7. Security & Operations

### 7.1 API Key Management

- API key เก็บ encrypted ใน `llmProviders.apiKeyEncrypted` (AES-256-GCM)
- Python backend อ่านผ่าน `smartspecweb_crypto.py` (shared LLM_ENCRYPTION_KEY)
- **ห้าม** hardcode API key ใน code

### 7.2 SSRF Protection — MANDATORY

- ✅ ใช้ `validate_uri_strict()` จาก `app.core.media_job_validators` — ห้ามสร้าง custom blocklist
- ✅ `follow_redirects=False` บน **ทุก** httpx request (constructor level)
- ✅ Validate ทุก image URL ที่ส่งไป image-to-video (DNS-resolving, IPv6-aware)
- ✅ Task ID validation ด้วย regex `^[a-zA-Z0-9_\-:.]{4,256}$` ก่อนใส่ใน URL
- ✅ Model ID validation ด้วย frozenset allowlist ก่อนทุก request

### 7.3 Rate Limiting

- ใช้ BullMQ rate limiter เดิมที่มีอยู่
- **⚠️ ACTION REQUIRED**: ตรวจสอบ KNPLabs published rate limits (RPM/day) ก่อน deploy
- Per-tenant rate limiting ป้องกัน abuse
- **TBD-priced models ต้อง disabled (`isEnabled = false`)** จนกว่าจะยืนยัน credit cost

### 7.4 Timeout Configuration

| Operation | Connect | Read | Write | Pool | Total |
|---|---|---|---|---|---|
| LLM Chat (Node.js) | 10s | 120s | — | — | 120s |
| Image Generation | 10s | 300s | 10s | 5s | 300s |
| Video Submit | 10s | 30s | 10s | 5s | 30s |
| Video Poll (per-request) | 10s | **30s** | 5s | 5s | 30s |
| Video Poll (total loop) | — | — | — | — | 600s (60 attempts × 10s) |
| TTS | 10s | 60s | 10s | 5s | 60s |
| Embeddings | 10s | 30s | 10s | 5s | 30s |

### 7.5 Error Handling

- Circuit breaker: 5% degraded threshold, 20% down threshold (match existing; auto-initialized by `providerHealth.ts`)
- ⚠️ Node.js LLM router ทำ **immediate candidate rotation** ไม่ใช่ timed exponential backoff — retry ไปหา provider ถัดไปทันที
- Python Celery task ใช้ jitter-based polling (±2s) สำหรับ video
- Graceful fallback to other providers on failure

### 7.6 Input Validation Summary (NEW)

| Input | Validation | Max Size |
|---|---|---|
| Prompt (all endpoints) | Strip control chars `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]` | 100,000 chars |
| TTS input text | Same + length cap | 4,096 chars |
| TTS voice | Allowlist: alloy, echo, fable, onyx, nova, shimmer | — |
| TTS format | Allowlist: mp3, opus, aac, flac, wav, pcm | — |
| Image URL (i2v) | `validate_uri_strict()` DNS-resolving | — |
| Model ID | frozenset allowlist per endpoint | — |
| Task ID | Regex `^[a-zA-Z0-9_\-:.]{4,256}$` | 256 chars |
| API response body | Size cap before JSON parse | 20 MB |
| Base64 image data | Size cap before decode | 20 MB decoded |
| TTS audio response | Content-Type check + size cap | 20 MB |
| Embedding vector | Type check (all floats) + dimension check | model-specific |

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test File | Coverage |
|---|---|
| `python-backend/tests/unit/providers/test_knplabai_provider.py` | Provider class methods, API format handling |
| `python-backend/tests/unit/tasks/test_knplabai_video_task.py` | Polling logic, timeout, error handling |
| `apps/web/server/services/__tests__/knplabaiRouting.test.ts` | Model resolution, fallback chain |

### 8.2 Integration Tests

| Test | Description |
|---|---|
| LLM routing fallback | Primary provider down → routes to KNPLabs |
| Image generation (OpenAI-compat) | Generate image via GPT Image model |
| Image generation (Gemini-native) | Generate image via Nano Banana, verify base64 → URL |
| Video async flow | Submit → poll → complete → download URL |
| TTS generation | Submit text → receive audio binary → upload |
| Cost tracking | Verify credit deduction matches pricing table |

### 8.3 Manual Validation

- [ ] LLM chat ผ่าน KNPLabs models ทำงานได้
- [ ] Image generation ทั้ง 2 format (OpenAI + Gemini) ทำงานได้
- [ ] Video generation + polling ทำงานได้
- [ ] TTS ทำงานได้
- [ ] Credit deduction ถูกต้อง
- [ ] Admin dashboard แสดง provider + models
- [ ] Circuit breaker ทำงานเมื่อ KNPLabs down
- [ ] Fallback routing ทำงานสำหรับ shared models

---

## 9. Deployment Checklist

1. **Pre-deploy**:
   - [ ] Add `KNPLABAI_API_KEY` to `.env` (both apps/web and python-backend)
   - [ ] Run seed scripts for provider + model registration
   - [ ] Verify API key works via test endpoint

2. **Deploy**:
   - [ ] Deploy Python backend with new provider class
   - [ ] Deploy Node.js with updated model mappings
   - [ ] Restart Celery workers

3. **Post-deploy**:
   - [ ] Verify health check passes for KNPLabs provider
   - [ ] Test each model type via admin test button
   - [ ] Monitor audit logs for first 24 hours
   - [ ] Verify credit tracking accuracy

---

## 10. File Impact Summary

### New Files

| File | Description |
|---|---|
| `python-backend/app/llm_proxy/providers/knplabai_provider.py` | Main media provider class (standalone, not BaseLLMProvider) |
| `python-backend/app/tasks/knplabai_video_task.py` | Async video polling Celery task (uses `_run_async()` pattern) |
| `python-backend/tests/unit/providers/test_knplabai_provider.py` | Provider unit tests |
| `python-backend/tests/unit/tasks/test_knplabai_video_task.py` | Video task tests |
| `apps/web/server/seeds/059-knplabai-provider.ts` | LLM provider + model_provider_map seed |
| `apps/web/server/seeds/059-knplabai-media-models.ts` | Media provider + media_models seed |

### Modified Files

| File | Change |
|---|---|
| `python-backend/app/core/config.py` | Add `KNPLABAI_API_KEY`, `KNPLABAI_BASE_URL` to Settings |
| `python-backend/app/llm_proxy/providers/__init__.py` | Export `KNPLabAIProvider` |
| `python-backend/app/tasks/__init__.py` | Register `knplabai_video_task` in Celery autodiscovery |
| `python-backend/app/services/media_generation.py` | Add `provider=knplabai` dispatch routing |
| `python-backend/app/tasks/media_tasks.py` | Add KNPLabs branch in `recover_stuck_task` |
| `apps/web/server/services/modelRegistry.ts` | Add KNPLabs media models to static registry |
| `apps/web/server/routers/multiProvider.ts` | Support KNPLabs in admin model management |

### Files NOT Modified (clarification)

| File | Why Not |
|---|---|
| `python-backend/app/llm_proxy/providers/factory.py` | ❌ Factory is for LLM providers; KNPLabs media is standalone |
| `apps/web/server/services/llmRouter.ts` | ❌ No code change needed; routing works via DB seed data |
| `apps/web/drizzle/schema.ts` | ❌ No schema migration; existing tables sufficient |

### No Schema Migrations

ใช้ tables เดิมทั้งหมด — เพิ่มเฉพาะ data records

**Verified**: `api_style` enum มี `"chat-completions"` ✅ | `media_provider_type` enum มี `"multimodal"` ✅

---

## 11. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| KNPLabs API downtime | Medium | Circuit breaker + fallback to other providers |
| Gemini-native format breaks | Medium | Adapter pattern isolates format differences |
| Video polling infinite loop | High | Hard timeout 10 min + max poll count |
| Base64 image too large for memory | Medium | Stream decode + upload, limit to 20MB |
| Credit conversion rounding errors | Low | Use ceiling + audit log reconciliation |
| API key leaked in logs | High | Never log key, use encryption throughout |
| KNPLabs rate limits hit | Medium | BullMQ rate limiter + per-tenant limits |

---

## 12. Future Considerations

- **Batch embeddings** — Send multiple texts in one API call for efficiency
- **Model auto-discovery** — Periodically fetch available models from KNPLabs API
- **Regional routing** — KNPLabs servers may be in Asia, beneficial for Thai users latency
- **Nano Banana image editing** — Gemini models support multi-turn image editing (send image back with edit instructions)
- **Implicit embedding fallback** — ต้อง migrate pgvector indexes + สร้าง AsyncEmbeddingProvider base class ก่อนใช้ KNPLabs embeddings เป็น auto-fallback
- **Streaming** — ทำงานแล้วผ่าน `llmRoutes.ts` (OpenAI SSE format) ไม่ต้องทำเพิ่ม

---

## 13. Pre-Implementation Blockers

ต้อง resolve ก่อน implement:

| # | Blocker | Action Required | Owner | Status |
|---|---|---|---|---|
| B1 | Gemini endpoint auth mode | ทดสอบว่า KNPLabs Gemini endpoint ยอมรับ Bearer-only หรือต้อง `?key=` | DevOps | OPEN |
| B2 | ~~TBD credit costs~~ | ~~ขอราคาจริงจาก KNPLabs~~ | — | ✅ RESOLVED (video prices confirmed; TTS still TBD but disabled) |
| B3 | KNPLabs rate limits | ขอ published RPM/daily limits จาก KNPLabs | DevOps | OPEN |
| B4 | modelId canonical values | Query existing `model_provider_map` เพื่อหา canonical modelId สำหรับ Claude/GPT/Gemini fallback rows | Dev | OPEN |
| B5 | llmModels FK check | ตรวจสอบว่า `model_provider_map.modelId` มี FK constraint ไป `llm_models` หรือไม่ | Dev | OPEN |

---

## Appendix A: Review Findings Log

**Reviewed 2026-03-24 by 4 parallel agents: ssp-reviewer, ssp-security, ssp-python, ssp-backend**

### CRITICAL Findings (All Resolved in v2.0)

| ID | Finding | Resolution |
|---|---|---|
| C1 | API key ใน URL `?key=` สำหรับ Gemini endpoint — leak ไปใน logs | ✅ Removed from URL; Bearer-only auth; added verification blocker B1 |
| C2 | Custom SSRF blocklist อ่อนแอ (DNS rebinding, IPv6 bypass) | ✅ Replaced with `validate_uri_strict()` from `media_job_validators` |
| C3 | Media dispatch wiring ไม่มี section | ✅ Added F1.4 media dispatch wiring with routing logic |
| C4 | `_upload_and_return_url()` ไม่มีอยู่จริง | ✅ Changed: provider returns raw bytes, Celery task handles S3/R2 upload |

### HIGH Findings (All Resolved in v2.0)

| ID | Finding | Resolution |
|---|---|---|
| H1 | `KNPLABAI_API_KEY` ไม่ได้ประกาศใน `config.py` | ✅ Added to F1.2 new files list |
| H2 | Factory wiring ผิด layer (LLM factory vs media) | ✅ F1.4 rewritten: media dispatch layer, not `factory.py` |
| H3 | `__init__.py` export ไม่ได้ระบุ | ✅ Added to modified files |
| H4 | Gemini response ไม่จำกัดขนาด (OOM risk) | ✅ Added `_MAX_RESPONSE_BYTES` + `_safe_parse_response()` in provider |
| H5 | Video task_id ไม่ validate (path injection) | ✅ Added `_validate_task_id()` regex in provider |
| H6 | TTS input ไม่ sanitize | ✅ Added allowlists, length cap, Content-Type check in provider |
| H7 | Video polling ไม่มี jitter/timeout/max count | ✅ Added jitter ±2s, per-poll timeout 30s, hard ceiling 60 attempts |
| H8 | Seed INSERT ไม่ครบ columns | ✅ Complete seed example with all 9 capability flags + modelName |
| H9 | Fallback modelId mismatch | ✅ Added explicit instructions to query existing canonical modelId |

### MEDIUM Findings (All Addressed in v2.0)

| ID | Finding | Resolution |
|---|---|---|
| M1 | Embedding dimension mismatch risk | ✅ Scoped to explicit-only use; no implicit fallback in embedding_service |
| M2 | VEO form-data missing prompt sanitization | ✅ All endpoints use `_sanitize_prompt()` + model allowlists |
| M3 | TBD credit costs = cost abuse risk | ✅ TBD models set `isEnabled = false`; blocker B2 added |
| M4 | `follow_redirects=False` not specified | ✅ Set at constructor level on httpx.AsyncClient |
| M5 | Embedding response not validated | ✅ Type check + dimension check added |
| M6 | Routing rule `maxFallbacks ≥ 1` needed | ✅ Documented in F1.1 routing requirements |
| M7 | `llmModels` table prerequisite | ✅ Added blocker B5 to verify FK |
| M8 | Media seed should be TypeScript | ✅ Changed to `apps/web/server/seeds/059-knplabai-media-models.ts` |
| M9 | Celery `_run_async()` + `recover_stuck_task` | ✅ Documented in F2.2 + F1.4 |
| M10 | Celery task registration missing | ✅ Added `tasks/__init__.py` to modified files + F1.4 |
