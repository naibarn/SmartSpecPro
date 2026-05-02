---
name: ElevenLabs Voice Changer
description: Convert source speech audio to a target ElevenLabs voice
category: audio_generation
execution_mode: media-generate
icon: mic
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: true
enabledByDefault: true
priority: 83
creditMultiplier: 1.0
defaultModel: elevenlabs/voice-changer
triggerPatterns:
  - "elevenlabs voice changer|change this voice|convert this voice|voice conversion"
  - "เปลี่ยนเสียง elevenlabs|แปลงเสียง|voice changer"
tags:
  - audio
  - elevenlabs
  - voice-changer
  - media
---

# ElevenLabs Voice Changer

Route this request to media generation with model `elevenlabs/voice-changer`.

Return ONLY valid JSON.

```json
{
  "prompt": "Voice Changer conversion",
  "model": "elevenlabs/voice-changer",
  "audio": "Required source audio URL",
  "voice_id": "Required ElevenLabs target voice ID",
  "model_id": "eleven_multilingual_sts_v2",
  "remove_background_noise": false
}
```

If no source audio URL or attachment is available, ask for the source audio instead of inventing one.
