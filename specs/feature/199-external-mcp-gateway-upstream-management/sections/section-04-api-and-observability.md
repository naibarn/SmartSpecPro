# Section 04 — APIs, Activity, Lineage and Operations

## Source coverage

Feature 199 sections 22–25, Appendices O–Q and all API/observability/failure/retention requirements.

## Deliverable

Implement role-scoped management/execution APIs, stable error taxonomy, trace/job correlation, activity/audit, health/reconciliation, RAG lineage and data deletion/retention controls.

## TDD steps

Test endpoint auth, idempotency, pagination, error shape, audit lineage, retention/deletion, limits and projection reconciliation; implement; rerun.

## Completion gate

Every API is tenant-safe and exposes only the role’s allowed projection; no credential appears in response/log.

## UI/UX Contract

### Target User / JTBD
N/A — API/observability layer; user workflows are covered by section-05.

### Existing Pattern Reference
N/A — no UI is created; existing admin/settings routers are the integration pattern.

### Surface Inventory
N/A — no component changes in this section.

### Component Map
N/A — API/telemetry/projection services only.

### State Matrix
N/A — UI state rendering is tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — API error codes are not UI copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
