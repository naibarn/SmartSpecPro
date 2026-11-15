# R1.19 Implementation Specification

Implement the missing authoritative execution contracts around the existing assistant-ui Chat adapter without replacing working Chat, job, credit, Runner, Harness, Task Control or Mission Control systems. Source code is in `/mnt/SmartSpecDev/projects/smartaihub-platform`; canonical SQL migrations and authoritative program SPECs remain in SmartSpecPro.

## Required behavior

- Persisted, versioned tenant/workspace-scoped execution events; stable IDs, monotonic per-subject cursor, idempotent insertion, authorized replay/retention.
- Authenticated SSE event delivery with cursor replay, reconnect and polling fallback; no cancellation on disconnect and no token-stream claims for non-streaming provider calls.
- Private, owner-authorized artifact registration/read/download and typed safe previews; capability enabled only after functional route/storage/security path exists.
- Truthful Core-backed inspector data and existing Task/Mission navigation using canonical relationships only. Missing backend facts are explicitly unavailable; never create parallel run/task/mission stores.
- Assistant-ui responsive desktop/tablet/mobile completion, keeping current Astryx themes, locale, history, attachments and queue-first execution.
- Update SPEC-312 R1.19 amendment and relevant authoritative contracts/traceability/handoff, preserving R1.18 history. Deploy only to `modular-debian-dev` and report authenticated UAT blocked if no authorized browser session exists.

## Invariants

All LLM/agent work remains on `worker_jobs` + outbox + Cloudflare Queue. Enforce current auth, tenant/workspace scope, worker lease/fencing, provider admission, credits and private R2 authorization. Migrations additive/reversible. Preserve `smartaihub.app` and future production `smartsihub.com` unchanged.

## Acceptance

For every phase, include source/API mapping, focused regression evidence, exact SHA and DEV evidence. Final eight-area report remains status-accurate. No full acceptance from mock-only tests or public health checks.
