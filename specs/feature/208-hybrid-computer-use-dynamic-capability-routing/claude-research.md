# Spec 208 Research

## Repository evidence

Targeted shell discovery was used because SocratiCode was unavailable. Existing
building blocks include `apps/web/shared/workflowBrowserSessionNodeTypes.ts`,
browser-session flags/routes, live browser session models, Runner contracts and
MCP governance. The feature is not production-complete and the browser-session
flag is disabled by default.

## Boundaries

- Feature 197 owns local Runner control and identity/fencing.
- Spec 199 owns MCP lifecycle/auth/transport.
- Spec 206/200 own external-agent/A2A routing.
- Spec 207 authorizes economic effects; a visible button or model confidence
  cannot authorize a payment or purchase.
- Browser/desktop effects require capability policy, approval where required,
  independent verification and profile/session isolation.

## Testing

Use Vitest for capability/policy/router/UI contracts, Python pytest for any
backend/browser protocol helper and existing Playwright/browser evidence for
real workflows when environments are available. Browser provider certification
and authenticated local Runner proof remain external gates.

