---
name: ElevenLabs Sound Effects
description: Generate sound effects from a prompt using the direct ElevenLabs sound generation model
category: audio_generation
execution_mode: media-generate
icon: zap
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: true
enabledByDefault: true
priority: 86
creditMultiplier: 1.0
defaultModel: elevenlabs/sound-effects
triggerPatterns:
  - "elevenlabs sound effects|generate sound effect|create sfx|sound generation"
  - "สร้างเสียงเอฟเฟกต์|ทำ sound effect|สร้าง sfx"
tags:
  - audio
  - elevenlabs
  - sound-effects
  - media
---

# ElevenLabs Sound Effects

Route this request to media generation with model `elevenlabs/sound-effects`.

Return ONLY valid JSON.

```json
{
  "prompt": "Sound effect description",
  "model": "elevenlabs/sound-effects",
  "duration_seconds": 5,
  "loop": false,
  "prompt_influence": 0.3
}
```

Keep prompts concise and concrete. Do not call ElevenLabs directly.
