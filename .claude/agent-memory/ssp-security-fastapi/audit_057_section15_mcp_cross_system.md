---
name: Spec 057 Section 15 — MCP Cross-System Protections audit
description: Security audit of mcp_rate_limiter.py and integration into agency_tools.py / long_term_memory.py
type: project
---

Audited 2026-03-24. CONDITIONAL PASS — 3 HIGH, 3 MEDIUM, 2 LOW findings.

**Why:** Pre-merge review of the cross-system protection layer for feature 057 (MCP security context optimization). Module was created but not wired into the call path.

**How to apply:** On re-audit or follow-up, verify the integration points listed below are addressed before clearing the HIGH findings.

## Critical findings

- **I-04 HIGH** — `mcp_rate_limiter.py` is dead code: `wrap_mcp_response`, `truncate_response`, `scrub_params`, `PerTurnCounter`, and Redis rate-limit checks are never called from `agency_tools.py:_make_run_func`. All runtime protections 14.1–14.5 and M13 are unmet.
- **I-02 HIGH** — INCR/EXPIRE split in `check_tenant_rate_limit` (and `check_run_rate_limit`) has a TOCTOU race that can leave keys with no TTL, permanently blocking a tenant after a worker restart. Fix: use a pipeline to always set expire on every call.
- **I-03 HIGH** — `on_tenant_disabled` scans for `mcp:rate:run:{tenant_id}:*` but run keys are written as `mcp:rate:run:{run_id}` (no tenant segment), so the pattern never matches any real key.
- **I-01 HIGH** — `truncate_response` uses a character-index slice on UTF-8 content. Multi-byte characters (CJK, emoji) can produce output significantly exceeding `max_bytes`. Fix: encode first, slice bytes, decode.
- **I-05 MEDIUM** — `long_term_memory.extract_and_store_memories` missing the MCP guard (`memory_extraction_enabled` default-false check, spec 14.6). Test in test suite validates inline dict logic only, not the real function.
- **I-06 MEDIUM** — `scrub_params` does not recurse into list values; secrets inside array parameters pass through unscrubbed.
- **I-07 MEDIUM** — Spec items 14.7 (audit trail), 14.8 (credit tracking), 14.10 (health check task), 14.11 (Celery constraint docs) are entirely absent from the diff.

## Key files
- `python-backend/app/services/mcp_rate_limiter.py` — the new module (isolated, correct)
- `python-backend/app/services/agency_tools.py:826–841` — `_make_run_func` where protections must be integrated
- `python-backend/app/services/long_term_memory.py:501` — `extract_and_store_memories` missing guard
- Review: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-15-review.md`
