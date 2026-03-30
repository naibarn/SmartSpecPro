# Section 06: TTS and Embeddings

## Purpose

Extend the internal audio and embedding APIs so KNPLabs can be selected explicitly.

This section is intentionally explicit-only. KNPLabs should not become a hidden fallback for existing callers.

## Files

- `python-backend/app/api/stt.py`
- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/llm_proxy/unified_client.py`
- `python-backend/app/services/embedding_service.py`

## Implementation Notes

1. Add `provider=knplabai` support to the internal TTS request flow.
2. Keep the current text-length guard in place.
3. Validate voice and output format against KNPLabs allowlists before calling the provider.
4. Return raw audio bytes and the correct content type from the KNPLabs TTS path.
5. Add an explicit KNPLabs embedding path to the internal embeddings API.
6. Validate embedding vector dimension before returning the response.
7. Leave the generic embedding service’s default behavior unchanged unless the new explicit path is selected.

## Acceptance Criteria

- KNPLabs can synthesize speech through the internal API.
- KNPLabs embeddings are explicit and dimension-checked.
- Existing OpenAI embedding behavior remains the default for current callers.

