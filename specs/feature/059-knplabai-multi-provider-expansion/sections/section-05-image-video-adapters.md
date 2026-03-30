# Section 05: Image and Video Adapters

## Purpose

Implement the KNPLabs request adapters for image generation, video generation, and the two image formats the spec calls out.

This section holds the provider-facing HTTP contract details.

## Files

- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `python-backend/app/llm_proxy/unified_client.py`

## Implementation Notes

1. Implement the OpenAI-compatible image path for GPT/Grok/Sora-style image models.
2. Implement the Gemini-native image path for Nano Banana-style models.
3. Implement the video submission path for VEO-style models.
4. Implement bounded async polling for long-running video tasks.
5. Apply input validation before any request leaves the process:
   - allowed model IDs
   - prompt sanitization
   - strict URL checks
   - response size caps
6. For Gemini-native image generation, check payload size before base64 decoding.
7. For video tasks, capture the upstream task ID as soon as the submission succeeds.

## Acceptance Criteria

- Each KNPLabs image/video family uses the correct endpoint shape.
- Oversized or malformed upstream responses are rejected safely.
- The provider can return a final URL or a processing state in a predictable shape.

