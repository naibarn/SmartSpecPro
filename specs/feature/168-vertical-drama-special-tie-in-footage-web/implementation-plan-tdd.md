# TDD plan

- Contract tests first: guide, transcript tokens, no-dialogue story, selected-character allowlist, nine-shot gate and B-roll bounds.
- Service tests: tenant/series/product/media authorization, idempotency, stale revisions, history isolation and credit reservation/finalization/refund.
- Skill adapter tests: exactly three distinct ideas, human-readable story fields, no dialogue leakage and prohibited claim enforcement.
- Router tests: upload/analyze/prepare/status/story/placement lifecycle and durable failure responses.
- UI tests: fullscreen preview, searchable scroll model selectors, individual character selection, no-dialogue display, refresh/history and timeline conflict states.
- Contract tests: current model-catalog resolution for LLM/image/video, millisecond timebase, Worker event replay, resumable upload finalization and credit reservation release.
- Browser test: authenticated end-to-end flow with Worker fixtures; live Worker/transcription/render evidence is a release gate.
