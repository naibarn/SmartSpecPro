# Section 05 — MCP Center, Connected Apps and Approval UI

## Source coverage

Feature 199 section 22, source UI requirements, user stories and UI acceptance criteria.

## Deliverable

Extend `McpServerManager.tsx`, MCP settings/admin panels and Chat approval components with role-scoped catalog/install/connect/review/health/activity/revoke flows.

## UI/UX Contract

### Target User / JTBD
Platform/Tenant Admins govern upstreams; end users connect approved apps and approve sensitive capability calls.

### Existing Pattern Reference
Reuse `McpServerManager.tsx`, `McpConnectPanel`, `McpServersSettingsPanel`, current settings forms and Chat approval cards.

### Surface Inventory
Catalog, install wizard, OAuth callback, connection detail, tool review/quarantine, permissions, health/activity, revoke/delete and Chat approval.

### Component Map
Admin MCP manager owns upstream state; settings owns user connection; Chat owns approval presentation; Feature 199 API owns policy truth.

### State Matrix
Loading, empty, error, success, partial, quarantine, revoked, expired, disabled, selected, hover and focus.

### Responsive Matrix
Mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900 and wide desktop 1280×800 for tables.

### Accessibility Acceptance
Keyboard install/review/revoke path, focus, labels/semantics, contrast, safe live updates and reduced motion.

### Copy Contract
Thai/English copy clearly says Connect, Review required, Quarantined, Healthy, Degraded, Revoked and Needs authorization; never display token values.

### Browser Evidence Required
Admin register → review → enable, user connect → grant, revoke and Chat approval.

## TDD steps

Test state matrix and secret non-disclosure first; implement UI/projections; run focused jsdom/browser checks.

