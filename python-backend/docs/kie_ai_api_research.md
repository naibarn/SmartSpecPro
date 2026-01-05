# Kie.ai API Research Notes

## Overview

Kie.ai เป็น API marketplace ที่รวม AI generation APIs หลากหลาย providers

**Base URL:** `https://api.kie.ai/api/v1/jobs/`

**Authentication:** Bearer Token (API Key)

---

## 1. Image Generation APIs

### 1.1 Nano Banana Pro (Gemini 3.0 Pro Image)

**Model ID:** `nano-banana-pro`

**Pricing:** 
- 1K/2K: 18 credits (~$0.09)
- 4K: 24 credits (~$0.12)

**Endpoint:** `POST /api/v1/jobs/createTask`

**Request Parameters:**
```json
{
  "model": "nano-banana-pro",
  "callBackUrl": "string (optional)",
  "input": {
    "prompt": "string (required, max 20000 chars)",
    "image_input": "array[URL] (optional, up to 8 images)",
    "aspect_ratio": "1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9|auto",
    "resolution": "1K|2K|4K",
    "output_format": "png|jpg"
  }
}
```

**Response:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "taskId": "task_12345678"
  }
}
```

**Query Task:** `GET /api/v1/jobs/queryTask?taskId={taskId}`

---

### 1.2 Z-Image

**Model ID:** `z-image` (to be confirmed)

**Features:** TBD - need to research

---

### 1.3 Seedream 4.5

**Model ID:** `seedream-4-5` (to be confirmed)

**Features:** TBD - need to research

---

### 1.4 FLUX 2

**Model ID:** `flux-2` (to be confirmed)

**Features:** TBD - need to research

---

## 2. Video Generation APIs

### 2.1 Wan 2.6 (Text-to-Video)

**Model ID:** `wan/2-6-text-to-video`

**Pricing:**
- 720p: 70/140/209.5 credits (~$0.35/$0.70/$1.05) for 5/10/15s
- 1080p: 104.5/209.5/315 credits (~$0.53/$1.05/$1.58) for 5/10/15s

**Request Parameters:**
```json
{
  "model": "wan/2-6-text-to-video",
  "callBackUrl": "string (optional)",
  "input": {
    "prompt": "string (required, max 5000 chars)",
    "duration": "5|10|15 (seconds)",
    "resolution": "720p|1080p",
    "multi_shots": "boolean (optional)"
  }
}
```

**Variants:**
- `wan/2-6-text-to-video` - Text to Video
- `wan/2-6-image-to-video` - Image to Video  
- `wan/2-6-video-to-video` - Video to Video

---

### 2.2 Seedance 1.5 Pro

**Model ID:** `seedance-1-5-pro` (to be confirmed)

**Features:** TBD - need to research

---

### 2.3 Sora 2 Pro Storyboard

**Model ID:** `sora-2-pro-storyboard` (to be confirmed)

**Features:** TBD - need to research

---

### 2.4 Veo 3.1

**Model ID:** `veo-3-1` (to be confirmed)

**Features:** TBD - need to research

---

### 2.5 Sora 2 Pro

**Model ID:** `sora-2-pro` (to be confirmed)

**Features:** TBD - need to research

---

### 2.6 Infinitalk

**Model ID:** `infinitalk` (to be confirmed)

**Features:** TBD - need to research

---

## 3. Audio Generation APIs

### 3.1 ElevenLabs TTS

**Model ID:** `elevenlabs-tts` (to be confirmed)

**Features:** Text-to-Speech

---

### 3.2 ElevenLabs Sound Effect

**Model ID:** `elevenlabs-sound-effect` (to be confirmed)

**Features:** Sound effect generation

---

## Common API Pattern

All kie.ai APIs follow the same pattern:

1. **Create Task:** `POST /api/v1/jobs/createTask`
   - Returns `taskId`
   
2. **Query Task:** `GET /api/v1/jobs/queryTask?taskId={taskId}`
   - Returns task status and result

3. **Callback (Optional):** 
   - System sends POST to `callBackUrl` when task completes

---

## Implementation Notes

### Unified Interface Design

```python
class KieAIProvider:
    """Base class for all kie.ai providers"""
    
    BASE_URL = "https://api.kie.ai/api/v1/jobs"
    
    async def create_task(self, model: str, input_params: dict) -> str:
        """Create generation task, returns taskId"""
        pass
    
    async def query_task(self, task_id: str) -> dict:
        """Query task status and result"""
        pass
    
    async def wait_for_completion(self, task_id: str, timeout: int = 300) -> dict:
        """Poll until task completes or timeout"""
        pass
```

### Provider Registry

```python
PROVIDERS = {
    # Image
    "nano-banana-pro": ImageProvider,
    "z-image": ImageProvider,
    "seedream-4-5": ImageProvider,
    "flux-2": ImageProvider,
    
    # Video
    "wan-2-6": VideoProvider,
    "seedance-1-5-pro": VideoProvider,
    "sora-2-pro-storyboard": VideoProvider,
    "veo-3-1": VideoProvider,
    "sora-2-pro": VideoProvider,
    "infinitalk": VideoProvider,
    
    # Audio
    "elevenlabs-tts": AudioProvider,
    "elevenlabs-sound-effect": AudioProvider,
}
```
