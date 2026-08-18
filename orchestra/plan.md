# Orchestra Plan: Credit Insufficiency Feedback Routing

## Scope

Implement the approved credit-failure routing policy in the SmartSpecPro server while preserving unrelated dirty worktree changes.

## Risk

Medium: cross-cutting server observability, notifications, tenant-scoped admin feedback, and credit/provider classification. No schema migration planned.

## Discovery

- SocratiCode MCP was unavailable; discovery used bounded `rg` and targeted file reads.
- Current auto-report entrypoint: `apps/web/server/services/systemAutoReportService.ts`.
- Current admin fan-out: `apps/web/server/services/virtualAdmin/feedbackProcessor.ts`.
- Current tRPC hook: `apps/web/server/_core/index.ts`.
- Existing user notification service and `/credits` destination are available.

## Waves

1. Spec and contract review.
2. Implement classifier and notification/report routing.
3. Add focused regressions and run server/typecheck gates.
