# Decision log

## Depth

`standard` quick plan: the change crosses the Python skill, provider routing,
Node bridge boundary, and tests, but requires no schema migration or new
service.

## Decisions

- Use explicit per-stage `ModelSettings(max_tokens=8192)` as the default.
- Keep aggregate token budgets as a separate run-level guard.
- Use provider-qualified model id when available; fall back to the logical id
  only for legacy snapshots.
- Support Responses and Chat Completions explicitly; fail closed for Messages
  and Gemini in this OpenAI Agents bridge.
- Emit stable safe bridge diagnostics and classify them in the Node service.
- Do not write to `orchestra/plan.md` or other shared orchestration artifacts;
  those files already contain user-owned dirty changes.

## Plan self-review

- Round 1 — completeness: covered runtime cap, provider route metadata, safe
  errors, credit boundary, tests, and rollout constraints; no `[AUTO-FIX]`.
- Round 2 — code alignment: affected files match the current Python Agent
  factory, bridge, Node router/service, and focused test locations; no
  `[AUTO-FIX]`.
- Round 3 — security: raw provider response, key metadata, traceback, and
  filesystem paths are explicitly excluded from the browser error; no
  `[AUTO-FIX]`.
- Round 4 — failure modes: 402, 429, auth, unsupported transport, legacy
  snapshots, and generic failures are covered; no `[AUTO-FIX]`.
- Round 5 — verification/rollback: focused tests, parse checks, diff check,
  no provider/DB side effect, and dirty-worktree preservation are explicit;
  no `[AUTO-FIX]`.
