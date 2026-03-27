# Section 01: Core Provider Contract and Configuration

## Purpose

Create the Python-side KNPLabs provider contract and make the provider discoverable from the shared media-provider config path.

This section is the foundation for the rest of the feature. Nothing else should assume KNPLabs exists until this provider class and its config loader are in place.

## Files

- `python-backend/app/core/config.py`
- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/llm_proxy/unified_client.py`

## Implementation Notes

1. Add `KNPLABAI_API_KEY` and `KNPLABAI_BASE_URL` to the backend settings object.
2. Implement `KnplabsProvider` as an async HTTP client wrapper, not as a `BaseLLMProvider` subclass.
3. Give the provider the shared hardening behaviors used by the other media providers:
   - model allowlists
   - prompt sanitization
   - response size caps
   - `follow_redirects=False`
   - explicit `aclose()` cleanup
4. Add a `get_media_provider_key("knplabai")` path and an `initialize_knplabai_client()` helper in `media_provider_service.py`.
5. Add a lazy KNPLabs client slot to `UnifiedLLMClient` so TTS and embeddings can create the provider on demand.
6. Export the provider from `app/llm_proxy/providers/__init__.py`.

## Acceptance Criteria

- KNPLabs can be instantiated from shared media provider config.
- The provider can be closed cleanly.
- The provider has the validation helpers needed by later sections.

