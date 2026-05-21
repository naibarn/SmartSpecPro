# Section 11 - Security QA Release

## Objective

Complete security hardening, QA, docs, and production release gates.

## Scope

- Security route tests.
- Extension fixture tests.
- Manual QA checklist.
- Dev install docs.
- Privacy/data handling docs.
- Release checklist.

## Implementation Notes

- Security test matrix must include:
  - extension auth and scope failures
  - CORS/origin failures
  - cookie CSRF attempts
  - upload validation failures
  - SSRF/private IP/redirect failures
  - preview XSS payloads
  - prompt injection payloads
  - tenant isolation failures
  - idempotency retries
  - rate limits
  - retention cleanup
- Manual QA:
  - Shopee category/search
  - Shopee product with variants
  - Shopee product with long description
  - unsupported pages
  - blocked checkout/cart/account/order/chat/seller pages
- Docs:
  - dev extension install
  - pairing flow
  - data sent to SmartSpecPro
  - retention policy
  - known limitations
  - rollback with `MARKETPLACE_CAPTURE_ENABLED=false`
- Add Chrome Web Store checklist:
  - single-purpose disclosure
  - permissions justification
  - user data disclosure
  - no remote-code/eval policy
  - marketplace terms responsibility copy
- Add threat model covering malicious marketplace DOM, malicious image URLs, compromised extension token, cross-tenant capture IDs, LLM prompt injection, preview XSS, and service worker replay/retry behavior.
- Add operations readiness:
  - metrics and alerts for capture volume, upload failures, analyze failures, storage growth, LLM spend, rate-limit events, rejected origins, and security validation failures
  - dashboards or log queries for incident triage
  - runbook for disabling capture with `MARKETPLACE_CAPTURE_ENABLED=false`
  - cleanup runbook for orphan assets and stale captures
- Add legal/product review checklist for marketplace terms, user responsibility copy, copyright/IP handling for saved images, privacy policy updates, and data deletion/export expectations.
- Add Playwright/Chrome extension E2E plan that loads the built extension, exercises side panel flows against fixtures, and verifies local pre-upload review blocks unwanted evidence.

## Tests First

- Add focused web security tests before enabling production flag.
- Add extension scanner fixture tests before manual QA.
- Add preview XSS tests before rendering raw evidence.
- Add retention/deletion tests before enabling production flag.
- Add threat-model review before production release.
- Add operations smoke checks for metrics/log events and cleanup runbooks.
- Add legal/product checklist signoff before production release.
- Add Playwright extension E2E coverage before Chrome Web Store publication.

## Acceptance Criteria

- Web `check` and focused marketplace capture tests pass.
- Extension build and tests pass.
- Release checklist marks production gates complete or blocked with owner.
- Chrome Web Store disclosure requirements are documented before publication.
- Threat model has no unresolved critical risks.
- Operations runbook and alert checklist are ready.
- Legal/product review checklist has no unresolved production blockers.
