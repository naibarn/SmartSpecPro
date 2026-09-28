# Request

Fix the confirmed SmartAIHub OAuth login bug so a completed OAuth account is
not asked for an invite code again, while preserving invite-only admission for
new or pending OAuth accounts.

## Assumptions

- `registeredDomain` and `currentTenantId` are the authoritative completion
  markers for the shared OAuth user row.
- The existing invite-only checks and cleanup path remain in scope.
- No schema migration, account deletion, or deployment is implied by the local
  implementation step.

## Non-goals

- Changing Google OAuth redirect URLs or provider credentials.
- Disabling invite-only registration.
- Repairing unrelated dirty-worktree changes.
