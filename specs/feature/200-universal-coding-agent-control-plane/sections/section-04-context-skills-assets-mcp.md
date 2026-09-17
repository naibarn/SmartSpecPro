# Section 04 — Context, Skills, Assets and MCP Mediation

## Source coverage

Feature 200 sections 4, 6, 18, 22–24, 28–30, 32–39, 47–48 and all context/skill/asset/MCP/security requirements.

## Deliverable

Use bounded scoped Context Packages/live retrieval, SmartAIHub skills through capability metadata, asset references, and Feature 199 MCP mediation with ACL/consent/egress/revocation.

## TDD steps

Test context freshness/tenant isolation, asset authorization, skill version/deprecation, large payloads, revoked grants and direct-MCP bypass first; implement; rerun.

## Completion gate

External Agents cannot access arbitrary upstreams or copy platform skills into an uncontrolled local catalog.

## UI/UX Contract

### Target User / JTBD
N/A — gateway integration backend; scope UI is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created; existing context/asset/skill/MCP surfaces remain canonical.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — context/skill/asset/MCP adapters only.

### State Matrix
N/A — scope/error states are rendered/tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
