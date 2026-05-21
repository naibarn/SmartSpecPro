# Decisions

[2026-05-21T13:19:28Z] DECISION: Auto-run deep-plan for Feature 115 without confirmation.
  Context: User explicitly requested orchestra deep-plan and no further confirmation.
  Alternatives considered: Wait for deep-plan invocation; rejected per user instruction.

[2026-05-21T13:32:00Z] DECISION: Use side panel as the v1 local AI analysis and review workspace.
  Context: Prompt API status, model download, cancellation, insight preview, evidence review, and storytelling readiness need more room than a popup.
  Alternatives considered: Popup-only UX; rejected because it would make review and fallback states cramped.

[2026-05-21T13:33:00Z] DECISION: Treat Prompt API as optional and runtime-detected.
  Context: Feature must work on machines that support and do not support Chrome Prompt API.
  Alternatives considered: Version-gated or required Prompt API; rejected because existing capture must remain intact.

[2026-05-21T13:34:00Z] DECISION: Use MarketplaceStorytellingHandoff as the typed bridge into Feature 114.
  Context: User requested a complete journey that feeds the upcoming storytelling system.
  Alternatives considered: Free-form insight text handoff; rejected because Feature 114 needs evidence-backed structured data.

[2026-05-21T13:55:00Z] AUTO-APPROVED: Implement Feature 115 on the current main branch with dirty worktree.
Reason: user explicitly requested complete deep-implement without further confirmation; operation is non-destructive and preserves unrelated changes.
Risk: MEDIUM
Files affected: apps/extension/src, apps/web/shared/marketplaceCapture.ts, apps/web/server marketplaceCapture routes/services/router, apps/web/drizzle schema/migration, apps/web/client marketplace capture insight route, specs/feature/115 implementation docs.

[2026-05-21T13:56:00Z] DECISION: Use a dedicated marketplace_capture_insights table.
Context: Insight lifecycle, idempotency, typed reads, claim resolution, and Feature 114 handoff queries need durable queryable records.
Alternatives considered: embed versioned JSON in capture sessions; rejected because it would make read/query/claim lifecycle brittle.
