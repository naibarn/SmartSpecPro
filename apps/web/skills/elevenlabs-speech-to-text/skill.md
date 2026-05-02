---
name: ElevenLabs Speech to Text
description: Transcribe audio or video using the direct ElevenLabs Scribe media model
category: audio_generation
execution_mode: media-generate
icon: languages
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: true
enabledByDefault: true
priority: 84
creditMultiplier: 1.0
defaultModel: elevenlabs/speech-to-text
triggerPatterns:
  - "elevenlabs speech to text|transcribe this recording|transcribe audio|speech to text"
  - "ถอดเสียง|ถอดข้อความจากเสียง|แปลงเสียงเป็นข้อความ"
tags:
  - audio
  - elevenlabs
  - transcription
  - media
---

# ElevenLabs Speech to Text

Route this request to media generation with model `elevenlabs/speech-to-text`.

Return ONLY valid JSON.

```json
{
  "prompt": "Speech to Text transcription",
  "model": "elevenlabs/speech-to-text",
  "file": "Required source audio or video URL",
  "model_id": "scribe_v2",
  "language_code": "Optional BCP-47 language code",
  "diarize": false
}
```

Output is a transcript artifact, not an audio file. Do not call ElevenLabs directly.
