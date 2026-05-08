# Section 04 Acceptance Interview

Date: 2026-05-06

## Questions

### Does the provider send Magnific authentication correctly?

Yes. All provider requests use `x-magnific-api-key` and do not set an Authorization header.

### Are endpoint paths explicit?

Yes. The provider uses `MAGNIFIC_MODEL_SPECS`, keyed by concrete model id. It does not build endpoint paths from display names.

### Are representative flows covered by tests?

Yes. Tests were added for Mystic submit/status, Veo status, sync Remove Background, Video Upscaler Precision controls, unsafe input URLs, unknown completed shapes, base URL validation, auth header shape, and `aclose()`.

### Does Remove Background avoid polling?

Yes. `remove_background()` submits to the sync endpoint, extracts returned URLs, marks the response complete, and returns `requires_rehost: True` so later gateway work can force immediate re-hosting before user delivery.

### Are errors sanitized?

Yes. HTTP, timeout, malformed JSON, task failure, and result extraction failures raise `MagnificProviderError` with categorized sanitized messages.

## Residual Risks

- Unit tests are written but not executable in the current environment because `pytest` is unavailable.
- Runtime gateway and Celery integration are intentionally deferred to sections 05 and 06.

