# Section 02 — Discovery, Authorization and Quarantine Lifecycle

## Source coverage

Feature 199 sections 9–15, 24–25 and all protocol/OAuth/schema/risk/health/reconnect requirements plus Appendices A–H.

## Deliverable

Implement version-probed remote/STDIO/Runner discovery, bounded lazy pagination, OAuth metadata/PKCE/rotation, schema canonicalization, risk classification, quarantine/review, health and revocation.

## TDD steps

Test metadata fallback, invalid redirect/token, expiry/revocation, malformed schema/duplicate keys, pagination, schema drift, downgrade and reconnect races first; implement; rerun.

## Completion gate

Untrusted or changed tools cannot become callable without the required review/grant.

## UI/UX Contract

### Target User / JTBD
N/A — lifecycle backend; UI review is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created; section-05 reuses MCP manager/settings patterns.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — discovery/OAuth/quarantine services only.

### State Matrix
N/A — quarantine/revocation rendering is tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
