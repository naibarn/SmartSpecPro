---
name: Spec 058 Meta Channels — Plan Completeness Review
description: Completeness review of Feature 058 Meta Channels plan against spec and interview decisions. Verdict: APPROVE_WITH_FIXES (2026-03-23)
type: project
---

# Spec 058 — Meta Channels Plan Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-23)

Overall the plan is thorough and well-structured. Key gaps:

**CRITICAL:**
- `socialPages` schema in plan is missing `aiActionMode` and `autoSendConfidenceThreshold` columns (in the spec detail table but NOT in the Drizzle ORM TypeScript code block at plan line ~201-218). Sections relying on these fields (section-08-ai-draft, section-14-automation-rules) will have schema mismatch.

**HIGH:**
- Skills integration (`meta-messenger`, `meta-page-manager`) from spec.md §1.1 is not in plan or index. Not in any section manifest.
- `social_cleanup_task.py` (raw webhook archive cleanup) listed in spec.md §4.6 but has no corresponding plan section, task file, or TDD tests.
- `socialMessages.workflowTriggerStatus` column present in plan's narrative (section 9) but MISSING from the Drizzle schema TypeScript code block — will cause runtime error when batch trigger Celery task tries to query it.
- API version mismatch: spec.md env vars reference `v21.0` but claude-spec and plan consistently use `v25.0`. The env var example in spec.md is stale but could cause confusion if copied verbatim.

**MEDIUM:**
- Redis-based unread counters (interview Q2 decision) — plan stores `unreadCount` in DB but no Redis counter for fast reads. No section plans the Redis layer for inbox count caching.
- Real-time trigger rate limiting (interview Q5: "max N triggers per minute") — mentioned in plan narrative (section 9.2 "max 10 triggers/min") but no section implements or tests the Redis counter.
- `social_cleanup_task.py` has no Celery beat schedule defined anywhere (cleanup of old `socialWebhookEventsRaw` records).
- Page-level user ownership check ("user must own the connection that created the page") documented in plan §12.3 but no tRPC helper or service function is specified to enforce this — easy to miss in implementation.
- `section-14-automation-rules` summary mentions blocked category enforcement and kill switch but no plan section details how blocked categories are detected during `generateDraft` or auto-send path.

**LOW:**
- `proposedContent` column missing from `socialHumanApprovals` Drizzle TypeScript block (present in spec detail table).
- `section-14` depends on `section-13-rag-archival` per index.md but this dependency is not reflected in the section-13 "Blocks" column.

Review file: `.claude/agent-memory/ssp-reviewer/project_058_meta_channels_plan_review.md`

**Why:** Plan completeness review for Feature 058 implementation
**How to apply:** Use these findings when reviewing section implementations to flag unplanned or schema-inconsistent code.
