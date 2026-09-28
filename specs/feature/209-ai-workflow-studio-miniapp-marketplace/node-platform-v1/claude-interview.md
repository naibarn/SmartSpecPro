# Interview — Typed Workflow Node Platform v1

This planning pass did not pause for stakeholder questions because the user
explicitly requested a complete design that anticipates common workflow use
cases and does not require asking for missing node types one by one. The prior
mockups, issue list, and repository contracts provide enough product direction.

## Q1 — What is the primary product outcome?

**Answer inferred from the request:** A user must be able to start from the
Dashboard, build a real workflow by dragging meaningful node types, configure
each node with understandable forms, connect compatible ports, enter a nested
Subflow, generate/edit a draft with AI, run it, inspect outputs/artifacts/logs,
and recover from approval or failure without leaving the product surface.

## Q2 — Which workflows should v1 cover?

**Answer inferred from the request and existing product domains:** v1 must cover
document intelligence, Library/RAG, text/structured AI, skills and agents,
HTTP/MCP/connector tools, database/data transformation, media generation and
rendering, human approval/input, reusable subflows, scheduled/webhook/manual
triggers, artifacts/previews, and operational run debugging. The catalog is
therefore intentionally several dozen node types rather than a small demo set.

## Q3 — What visual direction should govern implementation?

**Answer:** The attached mockup is the authority. Preserve its clean light
workflow-editor hierarchy: top navigation and Dashboard return, Build/Test/Runs
tabs, centered graph canvas with visible directional edges and branch labels,
bottom node palette, right resizable Configure/Settings/Notes inspector, and a
bottom run/debug panel. Do not invent a different page composition. Existing
local design primitives and the mockup’s spacing/density are implementation
references.

## Auto-decisions

- Use the existing React Flow dependency and current Feature 209 route as the
  canvas foundation; do not replace it with another graph library.
- Use shared Zod contracts in `apps/web/shared` for node definitions, ports,
  config schemas, bindings, readiness, and run requests.
- Keep the canonical `worker_jobs` plus outbox control plane as the only durable
  execution authority.
- Treat provider-specific media, browser/computer, MCP, and external-agent work
  as adapters with explicit capability and permission manifests.
- Use additive migrations only when existing JSON columns cannot express a
  required invariant; preserve existing Feature 209 records and migrations.
- Implement in dependency waves from contracts and registry to graph/UI, then
  adapters/runtime, then AI/Marketplace polish and certification.
- No new dependency is assumed. Existing Radix/shadcn-like primitives, skill
  forms, mobile sheets, dashboard primitives, and i18n utilities are reused.
- Published versions remain immutable. AI Draft/Edit can create or revise a
  draft candidate only; apply requires validation and explicit user action.
