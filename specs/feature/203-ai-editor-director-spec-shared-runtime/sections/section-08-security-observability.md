# Section 08 — Security, tenant isolation, and observability

## Objective

Close cross-cutting safety risks before rollout and make failures diagnosable
without leaking secrets or user media paths.

## Files and ownership

- Extend shared validators and editor services from sections 01–07.
- Add focused security/tenant/retry/event tests.
- Reuse existing structured logging/metrics conventions.

## Requirements

- Server-derived tenant/user/project authority for every read/write/status path.
- Reject SSRF, path traversal, local paths, unsafe URLs, secrets, and prompt
  injection at contract boundaries.
- Bound retries, cancellation, lease watchdogs, and billing reservations.
- Emit redacted events for admission, conflicts, capability blocks,
  degradation, promotion rejection, lease loss, artifact commit, and rollback.
- Expose queue/agent/evidence/artifact metrics without raw media or credentials.

## TDD and acceptance

Test cross-tenant identifiers, path/URL attacks, retry exhaustion,
cancellation, duplicate billing, and log redaction. Run impact review before
changing shared auth, router, schema, or exported types.

## UI/UX Contract

### Target User / JTBD
Editor needs safe, understandable failure messages without secret leakage.

### Surface Inventory
Error banners, status reasons, audit/event detail available to authorized users.

### Component Map
Security services redact and classify; Web surfaces render safe reason strings.

### State Matrix
Unauthorized, forbidden, invalid input, blocked, retrying, redacted failure,
and safe recovery.

### Responsive Matrix
All layouts keep the safe reason and next action visible; raw diagnostics remain
behind authorized desktop inspection.

### Accessibility Acceptance
Errors use live regions, semantic roles, readable focus order, and no secret or
path disclosure.

### Copy Contract
Thai-first safe messages; internal codes may be shown only to authorized
operators and never include credentials.

### Browser Evidence Required
Authenticated tenant-isolation and safe-error evidence; no secrets in captures.
