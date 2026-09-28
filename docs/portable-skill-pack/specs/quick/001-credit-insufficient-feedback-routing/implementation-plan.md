# Implementation Plan

## Objective

Route credit-related failures at the server auto-report boundary so the right user or admin receives the right message and severity.

## Files

- Add `apps/web/server/services/creditFailurePolicy.ts` with pure types, threshold constants, message/context extraction, and route classification.
- Update `systemAutoReportService.ts` to accept structured credit context, notify users for ordinary failures, and create high/critical tickets only for escalations.
- Update `_core/index.ts` to invoke credit routing for tRPC credit failures including `FORBIDDEN` and pass structured fields from the internal auto-report endpoint.
- Update `virtualAdmin/feedbackProcessor.ts` to preserve critical ticket priority.
- Update `routers/mediaJobs.ts` to bypass generic admin fan-out for classified credit failures and delegate to the central route.
- Add focused unit/integration tests for policy and notification routing.

## Data and safety

Use existing `contextJson` and notification metadata. Normalize requested credits to a finite non-negative number, cap diagnostic strings, and never store secrets. Preserve tenant lookup and admin scoping. All reporting remains best-effort and cannot alter the original error.

## Acceptance criteria

1. Ordinary user-credit errors create one deduplicated user notification with `/credits` and no feedback ticket/admin notification.
2. Suspicious user-credit errors create a high-priority feedback ticket and admin notification.
3. Provider-account credit errors create a critical ticket and critical admin notification.
4. User-facing messages distinguish purchase-needed, review-needed, and provider-unavailable cases.
5. Existing non-credit system auto-reports behave as before.
6. Focused tests, `pnpm check`, and `git diff --check` pass for the touched work.
