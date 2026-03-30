---
name: audit_agency_swarm_r2
description: Round 2 deep security audit of Agency Swarm frontend components (2026-03-23): 6 new findings, no new CRITICAL
type: project
---

Round 2 audit of Agency Swarm frontend on branch codex/feature-044-multimodal-chat-memory (2026-03-23).

**Why:** Pre-merge security review after Round 1 fixes (DOMPurify on markdown, isOwned gate, 14 node types) were applied.

**How to apply:** Use as baseline when reviewing future agency builder changes. All Round 1 CRITICAL/HIGH issues are resolved. Round 2 HIGH items remain open.

## Pass Items (verified clean)
- AgencyChatStream SSE rendering: text_delta → SafeMarkdown (DOMPurify), agent_switch names are JSX text
- AutoCreateAgencyModal: guide/question fields are JSX text nodes, not innerHTML
- NodePropertyPanel ErrorHandlerForm: watchedNodeIds from local state only, not raw input
- NodePropertyPanel DataTransformForm: JSONPath/Mustache inputs stored in state, not rendered as HTML
- useAgencyHistory undo/redo: structural snapshot only, no innerHTML or eval path
- AgencyBuilder hydration: server strings go into React state → JSX text nodes
- ToolPicker isOwned: server enforces ownership in deleteCustomTool/updateCustomTool, client gate is defense-in-depth
- TextContentPreviewContent dangerouslySetInnerHTML: DOMPurify with allowlist + URI restriction on both paths

## Open Findings (Round 2)

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| FE-R2-01 | HIGH | agency.ts:1148 | agents z.array() has no .max() — allows 1000+ node POST |
| FE-R2-02 | HIGH | useAgencyStream.ts:295-296 | Last-Event-ID written from raw SSE id: field without CRLF strip |
| FE-R2-03 | MEDIUM | AgencyBuilder.tsx:519-532 | Drag-drop templateData JSON not validated against nodeType allowlist or length limits |
| FE-R2-04 | MEDIUM | JsonSchemaEditor.tsx:149-157 | __proto__ key in raw JSON schema mode persists to DB; AJV on server has no $ref restriction |
| FE-R2-05 | MEDIUM | AutoCreateAgencyModal.tsx:424 | errorMsg/statusMessage from Celery have no length cap (potential multi-MB DOM injection) |
| FE-R2-06 | LOW | ToolPicker.tsx:272 | Tool delete: client confirm() only, no server-side in-use check (orphans agencyAgentTools rows) |

Full report: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/deep-frontend-audit-r2.md`
