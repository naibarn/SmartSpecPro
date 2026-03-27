# Frontend Security Audit — Feature 058: Agency Creator Intelligence Upgrade

**Auditor:** CMD-6 SSP Frontend Security Auditor
**Date:** 2026-03-24
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** React frontend changes for feature 058 — suggestions UI, template save dialog, phase stepper updates

## Files Audited

| File | Lines |
|------|-------|
| `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` | 601 |
| `apps/web/client/src/components/agency/ImprovementSuggestionPanel.tsx` | 163 |
| `apps/web/client/src/components/agency/RunFeedbackCard.tsx` | 151 |
| `apps/web/client/src/pages/AgencyBuilder.tsx` | 950 |
| `apps/web/client/src/pages/AgencyChat.tsx` | partial (route/import review) |
| `apps/web/client/src/App.tsx` | route guard verification |

---

## Summary

**Verdict: CONDITIONAL PASS**

No CRITICAL issues found. The six mandatory audit areas are largely clean: no `dangerouslySetInnerHTML` usage in the new components, no JWT/token localStorage writes introduced by this feature, no raw `fetch()` mutations, no `VITE_*` secret leakage, and both `/agencies/:id/edit` and `/agencies/:id` routes are wrapped in `<RequireAuth>`. Two HIGH issues were identified: template name and description inputs lack `maxLength` constraints (unbounded client-side input that reaches a server mutation), and the `guide` field from the completed task response is displayed without length-capping the slice defensively. Three MEDIUM issues relate to missing input bounds on `templateDesc`, LLM-sourced suggestion fields being iterated with array index as key, and the `console.warn` call logging an error object from `saveAsTemplate`. Two LOW issues are noted for completeness.

The feature must address the two HIGH items before merge.

---

## Findings

| ID | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|----|----------|-----------|--------------|-------------|-----------------|
| FE01 | HIGH | `AutoCreateAgencyModal.tsx:529–544` | Missing input bounds | `templateName` Input and `templateDesc` Input have no `maxLength` attribute. `templateName` is passed directly to `saveAsTemplate.mutateAsync()` with no client-side length cap before the tRPC call. The server-side Zod schema validates `max(255)` and `max(2000)` but the client sends the full string regardless, wasting bandwidth and enabling oversized payloads to be constructed by an abusive user who bypasses the UI. More importantly, the missing cap allows the user to type an arbitrarily long string before the server rejects it, giving no early feedback. | Add `maxLength={255}` to `tpl-name` Input and `maxLength={2000}` to `tpl-desc` Input so the browser enforces the same bounds as the server Zod schema. |
| FE02 | HIGH | `AutoCreateAgencyModal.tsx:468` | LLM content length not validated before render | `guide` is the raw LLM-generated text coming directly from `status.guide` (the Celery task result). The display is `guide.slice(0, 200)` which truncates the rendered text, but the full string is stored in component state with no cap. If `guide` is a very large string (e.g. the LLM generates megabytes of text), it occupies memory until modal close. More critically, there is no length check on `status.guide` before assignment at line 158 (`setGuide(status.guide ?? "")`), so an unusually long server response can be stored verbatim. | Cap guide on assignment: `setGuide((status.guide ?? "").slice(0, 2000))` so that at most 2000 characters enter state. The displayed truncation to 200 chars remains correct, but the in-memory string is bounded. |
| FE03 | MEDIUM | `AutoCreateAgencyModal.tsx:479` | Array index used as React key for LLM-sourced items | `suggestions.map((s, i) => <div key={i} ...>)` uses the array index as the key for suggestion cards. The suggestions array originates from LLM/Celery output (`status.suggestions`). If the list is reordered or items are dismissed and the array mutates, React will reconcile incorrectly, leading to stale dismissed-state rendering. `dismissedSuggestions` is a `Set<number>` of indices, so if the array ever changes size, the wrong items appear as dismissed. | Use a stable key derived from suggestion content: e.g. `key={`${s.category}-${s.title}`}` or add a server-assigned `id` field to the suggestion schema. Update `dismissedSuggestions` to track content-based identifiers rather than positional indices. |
| FE04 | MEDIUM | `AutoCreateAgencyModal.tsx:563` | `console.warn` logs error object | `console.warn("saveAsTemplate failed", e)` at line 563 logs the raw caught error object `e` to the browser console. In development this is harmless, but in production the error object from tRPC may contain fragments of server-side messages (e.g. Drizzle query errors, stack traces, or partial SQL context) that appear in browser devtools and browser extension telemetry collection. | Replace with `console.warn("saveAsTemplate failed", e instanceof Error ? e.message : String(e))` or remove the console call entirely since `toast.error` already surfaces the failure to the user. |
| FE05 | MEDIUM | `AutoCreateAgencyModal.tsx:97` | Misleading variable name obscures dismissed-state semantics | `setAppliedSuggestions` is the setter for `dismissedSuggestions` state (line 97: `const [dismissedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set())`). The setter is named `setAppliedSuggestions` but the state is named `dismissedSuggestions` and the button it drives is labelled "Skip". This naming contradiction is not a security vulnerability in itself but it means any future developer reading the code may misinterpret the state (thinking suggestions were "applied" when they were dismissed), potentially re-introducing them incorrectly. | Rename to `const [dismissedSuggestions, setDismissedSuggestions]`. This is a code-quality concern with a minor risk of future logic error. |
| FE06 | LOW | `ImprovementSuggestionPanel.tsx:67,150` | `any` type on LLM-sourced data | `suggestions.map((s: any, ...)` and `history.map((h: any, ...)` iterate over untyped tRPC response data. No field validation is performed before rendering `s.suggestion`, `s.priority`, `s.category`, `h.changeType`, and `h.description` directly into JSX text nodes. React's default escaping protects against XSS here, but a missing or `null` field would render the string "null" or throw a runtime error. | Define TypeScript interfaces for the suggestion and history item shapes matching the server Zod output, or use the tRPC inferred output type. Add nullish coalescing guards: `{s.suggestion ?? ""}`. |
| FE07 | LOW | `AutoCreateAgencyModal.tsx:237–240` | Raw error message forwarded to toast | `setErrorMsg(err.message || "Failed to start agency creation")` and `toast.error(err.message || ...)` forward the raw error message from tRPC to the UI. tRPC client errors typically contain only the TRPC error message (not a stack trace), so this is low risk. However, if an unexpected network or JSON parse error occurs, `err.message` may contain internal details (e.g. a URL fragment). | Wrap with: `const userMsg = err?.data?.code ? (err.message || "Failed to start agency creation") : "Failed to start agency creation";` to restrict forwarding to TRPCClientError messages only. |

---

## Area-by-Area Checklist

### 1. XSS via `dangerouslySetInnerHTML`
**PASS.** No `dangerouslySetInnerHTML` appears in any of the audited files. All LLM-sourced fields (`suggestion.title`, `suggestion.description`, `suggestion.category`, `suggestion.impact`, `guide`, `errorMsg`, `statusMessage`, `q.question`, `h.description`, `h.changeType`) are rendered as React text children, which are automatically escaped. The `guide` field is rendered as `{guide.slice(0, 200)}` — plain text node. No markdown renderer is invoked on these fields.

### 2. User-controlled HTML via other mechanisms
**PASS.** No `ref.current.innerHTML`, `<iframe src={userContent}>`, or dynamic `<script>` tag insertion found in any audited component. `ImprovementSuggestionPanel` renders suggestion text via `<p className="text-slate-700">{s.suggestion}</p>` — safe text node.

### 3. JWT / auth token in localStorage
**PASS (no regression introduced).** No new `localStorage.setItem` calls appear in the feature-058 components. Existing `smartspec_auth_token` cleanup patterns in `authService` are pre-existing findings tracked in prior audits (audit_feature048_auth_hardening.md) and are out of scope for this delta audit.

### 4. CSRF — raw `fetch()` for state-changing mutations
**PASS.** All mutations use tRPC:
- `agency.autoCreate.useMutation()` — tRPC
- `agency.autoCreateAnswer.useMutation()` — tRPC
- `agency.saveAsTemplate.useMutation()` — tRPC (server enforces `protectedProcedure` + ownership check)
- `agency.applyImprovement.useMutation()` — tRPC
- `agency.submitRunFeedback.useMutation()` — tRPC

No raw `fetch()` calls for mutations found in the three new components.

### 5. `VITE_` env vars leaking server secrets
**PASS.** No `import.meta.env.VITE_*` references in any of the audited files. The `defaultModel` prop passed to `AutoCreateAgencyModal` comes from local React state set by the model availability query — no env var is forwarded to the Celery task from the client bundle.

### 6. Wouter routes without auth guards
**PASS.** Both routes affected by this feature are verified in `App.tsx`:
- Line 345: `<Route path="/agencies/:id/edit"><RequireAuth><AgencyBuilder /></RequireAuth></Route>`
- Line 346: `<Route path="/agencies/:id"><RequireAuth><AgencyChat /></RequireAuth></Route>`

`AgencyBuilder` additionally performs an in-component auth check at lines 242–247 that redirects to `/login` if `isAuthenticated` is false, providing defence-in-depth consistent with prior audit findings.

### 7. File upload — spec file base64 validation
**PASS.** `handleFileSelect` enforces:
- Size cap: `file.size > 7_500_000` → rejected (line 191)
- Type allowlist: `application/pdf`, `text/plain`, `text/markdown`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, with fallback extension check on `.txt|.md|.pdf|.docx` (lines 195–199)
- Base64 is extracted client-side from `FileReader.readAsDataURL()` and the data-URI prefix is stripped (line 203)

Server-side must re-validate the decoded base64 size and content type — this is outside frontend scope but should be confirmed in the tRPC/Python backend audit.

### 8. `onCreated` deferral — caller impact
**PASS.** The change to defer `onCreated` (previously called on `status.completed`, now only called explicitly when the user clicks "Open in Agency Editor") has one caller in `AgencyBuilder.tsx` (lines 842–845):

```
onCreated={(newAgencyId) => {
  setAutoCreateOpen(false);
  setLocation(`/agencies/${newAgencyId}/edit`);
}}
```

The deferral is safe: `setAutoCreateOpen(false)` and `setLocation` are only called when the user explicitly clicks the button, after `createdAgencyId` is set. There is no race condition. `createdAgencyId` is validated as non-null before the button renders (line 583: `{createdAgencyId && (...)}`) and again inside the click handler (line 553: `if (!createdAgencyId ...) return`). The `agencyId` value originates from `status.agencyId` which is a UUID set by the Celery task — no user input influences the navigation target.

### 9. State management — session/user leakage
**PASS.** All suggestion state (`suggestions`, `dismissedSuggestions`, `showTemplateDialog`, `templateName`, `templateDesc`, `createdAgencyId`) is local React component state. `handleClose` (lines 258–278) resets all state fields to their initial values on modal close, including `setSuggestions([])`, `setAppliedSuggestions(new Set())`, `setCreatedAgencyId(null)`. No state persists to `localStorage`, `sessionStorage`, or a global store. No cross-user leakage is possible from the frontend layer.

---

## Recommendations

1. **Before merge (HIGH):** Add `maxLength={255}` to the template name `<Input>` at line 529 and `maxLength={2000}` to the template description `<Input>` at line 540.

2. **Before merge (HIGH):** Cap `guide` on assignment at line 158: change `setGuide(status.guide ?? "")` to `setGuide((status.guide ?? "").slice(0, 2000))`.

3. **Post-merge cleanup (MEDIUM):** Replace suggestion array index key with a content-derived stable key (FE03). Replace the `console.warn(... e)` with a message-only log (FE04). Rename the state/setter pair for dismissed suggestions (FE05).

4. **Post-merge cleanup (LOW):** Add typed interfaces for `ImprovementSuggestionPanel` suggestion and history data (FE06). Restrict raw error message forwarding to toast (FE07).
