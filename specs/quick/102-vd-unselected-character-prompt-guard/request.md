# Request

Prevent a Vertical Drama start-frame image from depicting a character who is
only mentioned in the shot synopsis and was not selected for that shot.

## Constraints

- `requiredCharacterRefs` is authoritative for physical presence.
- `screenCallerCharacterRefs` is authoritative for device-only presence.
- Apply to all start-frame prompt modes.
- No additional LLM calls, credits, schema changes, or presence model.
- Preserve unrelated dirty-worktree changes.
