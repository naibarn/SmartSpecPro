# Credit Insufficiency Feedback Routing

## Status

Approved design direction on 2026-08-18. Implementation remains pending spec review.

## Goal

Route insufficient-credit feedback to the correct audience:

- Ordinary SmartSpec user-credit failures notify only the affected user with an actionable prompt to buy credits.
- Suspiciously large user-credit requests create a high-priority admin diagnostic ticket.
- Provider-account credit failures (for example KIE.ai or OpenRouter) always create a critical admin alert.
- Unrelated failures keep their current auto-feedback behavior.

## Policy

The classifier uses structured credit context first and conservative fallback rules second.

| Failure | Normal threshold | Admin action | User action |
| --- | ---: | --- | --- |
| Explicit LLM user-credit deduction | <= 3,000 credits | None | Tell user to buy credits |
| Explicit media user-credit deduction | <= 10,000 credits | None | Tell user to buy credits |
| Unknown/unclassified user-credit deduction | <= 3,000 credits | None | Tell user to buy credits |
| User-credit request over its threshold | N/A | High-priority diagnostic feedback | Tell user the request is under review |
| Provider account credit/balance/quota failure | N/A | Critical admin alert and feedback | Tell user the provider is temporarily unavailable |

An explicit media classification is the only exception that permits a request above 3,000 credits. A media request above 10,000 credits is suspicious. Unknown context uses the 3,000-credit threshold.

## Architecture

1. Add a small, pure credit-failure classifier owned by the server feedback/observability boundary.
2. Extend `reportSystemFailure` with optional structured credit context: source (`user` or `provider`), model kind (`llm` or `media`), requested credits, provider name, and reason.
3. Update authoritative credit/provider failure boundaries to provide that context where available. Do not depend on client strings or UI heuristics.
4. Make the tRPC error hook route credit failures through the classifier, including user-facing `FORBIDDEN` credit errors that are currently excluded from auto-reporting.
5. For ordinary user-credit failures, create a deduplicated in-app notification for the affected user with an action URL to `/credits`, and stop before creating an admin feedback ticket.
6. For suspicious user-credit failures, create the existing system feedback ticket with high priority and notify the admin scope; the user receives a review message rather than a purchase instruction.
7. For provider-credit failures, create a critical system feedback ticket and critical admin notification, preserving provider and trace context; the user receives a provider-outage message.
8. Preserve existing fingerprint deduplication and flood protection. User notifications use a per-user group key so repeated failures merge rather than flood.
9. Ensure `feedbackProcessor` preserves a ticket's critical priority when building admin notifications; keyword classification must not downgrade provider-credit alerts.

No database migration is required. Existing feedback `contextJson` and notification metadata carry the additional diagnostic fields.

## Failure handling and safety

- All notification and auto-report work remains best-effort and must never change the original request result.
- Provider classification must fail closed toward admin escalation when structured provider-credit evidence is present.
- Sensitive provider credentials and raw secrets remain excluded by the existing `sanitizeExtra` path.
- Tenant scoping remains unchanged for feedback tickets and admin recipients.
- If the requested amount is missing or malformed, use the conservative unknown/3,000-credit policy rather than silently suppressing a possible anomaly.

## Verification

Add focused tests for:

- LLM, media, and unknown threshold decisions.
- Ordinary user-credit failures producing only a user notification.
- Suspicious user-credit failures producing high-priority admin feedback.
- KIE/OpenRouter/provider-account credit failures producing critical admin feedback.
- Critical priority surviving feedback processing.
- Deduplication of repeated user notifications and system tickets.
- Existing non-credit auto-report behavior remaining unchanged.

Run the touched server test files, `pnpm check` in `apps/web`, and `git diff --check`. Browser/provider/deployment checks are not required for this backend notification-routing change unless the focused tests expose a user-facing contract issue.

## Trade-offs

Structured context is more reliable than message-only matching but requires threading metadata through credit/provider boundaries. The conservative 3,000-credit fallback may escalate some legitimate unknown workloads; this is intentional to avoid silently hiding anomalous charges.
