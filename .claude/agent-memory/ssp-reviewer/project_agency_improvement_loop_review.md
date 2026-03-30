---
name: Agency Continuous Improvement Loop — Completeness Review
description: Completeness and wiring review of the Agency Continuous Improvement Loop feature (feedback, advisor, health monitor)
type: project
---

Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key issues:

**HIGH-1 — `agency_feedback` router not registered in `main.py`**: The FastAPI router at `python-backend/app/api/agency_feedback.py` defines `POST /api/v1/agency/analyze-feedback` but is never imported or wired into the app. `submitRunFeedback` in the Node.js tRPC router calls this URL — all calls silently fail with a connection error caught by the bare `except` block, so the advisor never runs and `advisorAnalysis` stays null forever.

**HIGH-2 — `onRunFinished` callback does not receive a `runId`**: `useAgencyStream` sets `runIdRef` from the `run_started` SSE event but does NOT pass it to the `onRunFinished` callback. `AgencyChat.tsx` falls back to `stream.messages.find((m) => m.id)?.id` which returns a message ID (e.g. a streaming chunk id), not the actual agency run UUID. The `RunFeedbackCard` then sends this incorrect ID to `submitRunFeedback`, causing the feedback row to be attached to an invalid runId.

**MEDIUM-1 — `applyImprovement` marks the whole feedback row `suggestionsApplied=true` on first decision**: Approving or dismissing any single suggestion marks the entire feedback row as processed, hiding all remaining suggestions from `getImprovementSuggestions`. If a feedback row has 4 suggestions and the user acts on suggestion[0], suggestions[1-3] vanish from the Improve tab.

**MEDIUM-2 — `_auto_enrich_instructions` deduplication check is O(instruction length), wrong anchor**: `suggestion[:50] in current` scans the entire instruction text for any substring match of the first 50 characters of the new suggestion. A common prefix like "Improve the response format" could match an unrelated prior instruction and silently skip valid enrichment.

**MEDIUM-3 — `getRunFeedback` has no tenant isolation**: Query filters only on `runId` + `userId`, not `tenantId`. A user who has been moved across tenants could retrieve another tenant's feedback row if they know the runId.

**LOW-1 — `check_agency_health` hardcodes `model_name="gpt-4o-mini"`**: Both `_check_single_agency` and `analyze_feedback_endpoint` hardcode this model. If the tenant has no OpenAI key configured, all analysis calls fail silently.

**LOW-2 — `_store_health_report` passes `user_id or 1` as fallback**: If `createdBy` is null in the agencies table, the memory is stored under userId=1 (the first user in the system), which could be a different tenant's superadmin.

Review covers: schema.ts:4757-4827, agency.ts:4605-4798, agency_improvement_advisor.py, agency_health_monitor_task.py, agency_feedback.py, RunFeedbackCard.tsx, ImprovementSuggestionPanel.tsx, AgencyChat.tsx:98-1052.
