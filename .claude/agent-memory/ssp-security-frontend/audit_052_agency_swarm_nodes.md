---
name: audit_052_agency_swarm_nodes
description: 2026-03-23 frontend security audit of Agency Swarm spec 052 node cards, NodePropertyPanel, AutoCreateAgencyModal, and AgencyBuilder page
type: project
---

Audit of 9 files for Agency Swarm (feature 052) frontend components.

**Result: CONDITIONAL PASS**

**Why:** All six new node card components are clean — no dangerouslySetInnerHTML, no innerHTML=, no raw fetch(). AgencyBuilder route is double-guarded (RequireAuth in App.tsx:329 + in-component redirect). AutoCreateAgencyModal uses JSX text rendering for all server-sourced strings.

**Open items:**

- FE01 MEDIUM: `TextContentPreviewContent.tsx` — `renderMarkdown()` output fed to `dangerouslySetInnerHTML` without a final DOMPurify pass. The `html` format path uses DOMPurify correctly; the `markdown` path does not. Currently safe due to entity-escaping order in the pipeline, but fragile. Fix: pipe `renderMarkdown()` result through `DOMPurify.sanitize()` at line 67 (DOMPurify already imported).

- FE02 MEDIUM: `McpServersPanel.tsx` — MCP Bearer tokens sent to `saveMcpServers` tRPC mutation as plaintext. Client handling is correct (transient state, password input, no localStorage). Backend must encrypt tokens with `encrypt()` from `crypto.ts` before DB insert. Flagged for backend auditor to verify in `apps/web/server/routers/agency.ts`.

**How to apply:** In future audits of agency swarm preview or MCP panels, the `renderMarkdown` DOMPurify gap and MCP token persistence are known open items until closed by the respective fix commits.
