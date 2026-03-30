# Spec 052 — Frontend Security Audit

## Verdict: CONDITIONAL PASS (2 MEDIUM, 0 HIGH)

| ID | Severity | File | Issue | Fix |
|----|----------|------|-------|-----|
| FE01 | MEDIUM | `preview/TextContentPreviewContent.tsx:67` | `renderMarkdown()` → `dangerouslySetInnerHTML` without DOMPurify on markdown path (html path uses it). One refactor away from XSS. | Pipe through `DOMPurify.sanitize()` — already imported in file |
| FE02 | MEDIUM | `McpServersPanel.tsx:106-116` | MCP Bearer tokens sent as plaintext in tRPC mutation. Client-side correct (type="password", no localStorage). Risk is backend — must confirm `encrypt()` used before DB write. | Backend must verify encryption |

## All-Pass Items
- 6 node cards — all use JSX text interpolation, no dangerouslySetInnerHTML
- NodePropertyPanel.tsx — controlled React inputs, no server HTML injection
- AutoCreateAgencyModal.tsx — status/error rendered as text children
- AgencyBuilder.tsx — double auth guard (RequireAuth + in-component redirect)
- No JWT in localStorage, no raw fetch() for mutations, no VITE_* leaks
