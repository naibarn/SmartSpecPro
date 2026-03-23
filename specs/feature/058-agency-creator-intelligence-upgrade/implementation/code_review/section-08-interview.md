# Section 08 — Code Review Interview

## Triage

| # | Severity | Issue | Decision |
|---|---|---|---|
| 1 | HIGH | `Apply` button and `handleApplySuggestion` absent | **Let go**: Suggestions are intentionally read-only/informational in this section. A full `applySuggestion` tRPC procedure with whitelisted mutations is a separate concern requiring backend work beyond the UI scope. Adding a TODO comment. |
| 2 | HIGH | `change` field forwarded raw to client | **Auto-fix**: Strip `change` key in Python status endpoint before returning |
| 3 | MEDIUM | `onCreated` callback deferred | **Let go**: Intentional UX — user sees suggestions before navigating |
| 4 | MEDIUM | Defensive `?? { mutateAsync: null }` pattern | **Let go**: Consistent with existing patterns in this file (see autoCreateMutation) |
| 5 | MEDIUM | Empty catch block | **Auto-fix**: Add `console.warn` before toast |
| 6 | MEDIUM | Suggestion text without Zod parse | **Let go**: React text nodes are XSS-safe; Python backend already truncates |
| 7 | LOW | Phase stepper test is no-op | **Let go**: Component-level testing is limited by internal state |
| 8 | LOW | Data structure test is plain-value | **Let go**: Same limitation |
| 9 | LOW | Out-of-scope diff noise | **Let go**: Pre-existing staged changes from other features |
| 10 | LOW | Redundant Redis reads | **Let go**: At most 1 extra poll, acceptable |

## Applied Fixes

1. **Strip `change` field** (HIGH-2 → fixed): Python status endpoint now filters `change` key from each suggestion dict before returning: `{k: v for k, v in s.items() if k != "change"}`.

2. **Renamed `appliedSuggestions` → `dismissedSuggestions`**: Clarifies that the Set tracks dismissals, not applied changes.

3. **Error logging in catch** (MEDIUM → fixed): Added `console.warn("saveAsTemplate failed", e)` before the toast error.

## Deferred Items

- `applySuggestion` tRPC procedure: Deferred — requires backend implementation of whitelisted mutation logic per spec §4. The suggestions UI is currently read-only/informational, which is the safer default per F03 security guidance.
