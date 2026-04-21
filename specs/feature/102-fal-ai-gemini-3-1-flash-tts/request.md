# Request

## Original request

เพิ่ม model ใหม่ใน media model สำหรับ `fal-ai/gemini-3.1-flash-tts` ตามเอกสาร:
https://fal.ai/models/fal-ai/gemini-3.1-flash-tts/api

ต้องรองรับ text-to-speech และต้องรองรับแบบหลายคนพูดได้

ปรับ Media Studio ให้รองรับกรณี multi-speaker

และสร้าง spec ใหม่ต่อจาก spec เดิมใน `specs/feature`

## Assumptions

1. The new model should be added as a new `audio` entry in the existing fal.ai catalog.
2. Multi-speaker support should be represented by a structured `speakers` array with per-speaker `speaker_id` and `voice`, and the aliases should stay unique within a request.
3. The existing `voice` field should remain available for single-speaker TTS.
4. Gemini-specific extra parameters should stay limited to the documented fal.ai schema so unsupported keys are rejected rather than silently forwarded.
5. The new model should be discoverable through the existing media provider, model registry, seed, and Media Studio paths.
6. The new feature spec should be added as the next sequential feature folder under `specs/feature`.
