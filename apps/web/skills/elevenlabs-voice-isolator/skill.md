---
name: ElevenLabs Voice Isolator
description: Clean noisy speech audio using the direct ElevenLabs voice isolation model
category: audio_generation
execution_mode: media-generate
icon: volume-2
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: true
enabledByDefault: true
priority: 87
creditMultiplier: 1.0
defaultModel: elevenlabs/voice-isolator
triggerPatterns:
  - "elevenlabs voice isolator|clean this noisy audio|isolate voice|remove background noise from speech"
  - "แยกเสียงพูด|ลบเสียงรบกวน|ทำเสียงพูดให้ชัด"
tags:
  - audio
  - elevenlabs
  - voice-isolator
  - media
---

# ElevenLabs Voice Isolator

Route this request to media generation with model `elevenlabs/voice-isolator`.

Return ONLY valid JSON.

```json
{
  "prompt": "Voice isolation cleanup",
  "model": "elevenlabs/voice-isolator",
  "audio": "Required source audio or video URL",
  "output_format": "mp3_44100_128"
}
```

If no source media URL or attachment is available, ask for the source media first.
