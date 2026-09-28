# Synthesized specification

This plan implements the approved design in `docs/portable-skill-pack/specs/2026-08-25-vertical-drama-async-skill-jobs-design.md`.

The system must expose fast submit mutations and durable status/result queries for all browser-facing Drama Series LLM work. Workers must call the real existing skill/service with the exact selected model, preserve tenant/user/series/session ownership, persist output before terminal success, and settle ledger entries with canonical skill metadata. The UI must resume work after refresh and must not mistake a polling budget timeout for an LLM failure. Full-story completion must validate episode/shot/dialogue completeness and enqueue real repair work when needed.

The implementation must be incremental and preserve existing async flows. It must not silently fall back to a synchronous request or delete immutable ledger/version data.
