# Spec 211 Interview Record

The user explicitly requested autonomous plan and implementation execution, so
no additional confirmation pause was required.

## Confirmed constraints

- Prioritize critical foundations and continue without routine questions.
- Preserve unrelated dirty worktree changes.
- Any UI must follow the Spec 209 mockup hierarchy rather than a new design.

## Auto-decisions

- Implement ACP adapter and Gas City bridge only after Spec 210 route/session
  contracts exist.
- Treat ACP/Gas City identities as runtime metadata, never workflow semantics.
- Use a capability-specific managed registry and pinned dependency manifest.
- Keep protocol/daemon state outside the canonical Job lifecycle, projecting
  events and receipts into it.

