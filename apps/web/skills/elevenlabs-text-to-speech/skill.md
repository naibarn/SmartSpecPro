---
name: ElevenLabs Text to Speech
description: Generate narrated speech using the direct ElevenLabs text-to-speech media model
category: audio_generation
execution_mode: media-generate
icon: music
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: true
enabledByDefault: true
priority: 82
creditMultiplier: 1.0
defaultModel: elevenlabs/text-to-speech
triggerPatterns:
  - "elevenlabs text to speech|elevenlabs tts|generate elevenlabs voice|create elevenlabs narration"
  - "สร้างเสียง elevenlabs|พากย์เสียง elevenlabs|แปลงข้อความเป็นเสียง elevenlabs"
tags:
  - audio
  - elevenlabs
  - tts
  - media
---

# ElevenLabs Text to Speech

Route this request to the configured media generation path with model `elevenlabs/text-to-speech`.

Return ONLY valid JSON.

```json
{
  "prompt": "Text to speak",
  "model": "elevenlabs/text-to-speech",
  "voice_id": "Required ElevenLabs voice ID when supplied by user",
  "model_id": "eleven_multilingual_v2",
  "output_format": "mp3_44100_128"
}
```

Do not call ElevenLabs directly. The ElevenLabs provider key must be configured in Admin > Media Providers.
