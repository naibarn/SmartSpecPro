# Interview transcript

## Context

No new interview round was required after the user explicitly confirmed the written design. The answers below preserve the confirmed business decisions that implementation must honor.

## Q1 — What identity is authoritative when the user visits another domain?

**Answer:** The account is bound to exactly one tenant. The authenticated user's database `currentTenantId` is authoritative. The hostname may provide public branding, but it cannot override authorization, billing, data ownership, or workspace identity.

## Q2 — How is tenant selected during signup?

**Answer:** A valid tenant-bound invite wins first. Without one, use an exact active host-domain match. If there is no match, use the Default/SmartAIHub tenant. A global invite authorizes but does not bind a tenant. Any supplied invalid or expired invite must reject signup rather than silently falling back.

## Q3 — What happens when an existing account is moved by a System Admin?

**Answer:** Email/account identity remains unchanged. Credits reset to zero immediately. Old tenant data and files stay in the old tenant and do not move. The UI must show a clear warning, and existing sessions/tokens must be revoked.

## Q4 — What data may transfer?

**Answer:** Selected images, videos, files in supported formats, Series, Presentations, Storyboards, projects/workflows, completed artifacts/results, and every terminal job-linked resource type with a registered handler. Transactions, usage history, credits, billing/settlement, credentials, sessions, secrets, admin privileges, and active execution state never transfer.

## Q5 — What happens to work waiting in queues?

**Answer:** Pending/queued/retry-scheduled work is killed/cancelled, fenced, and removed from transport where possible. Its canonical `worker_jobs` row and `worker_job_events` history remain for audit/recovery evidence. It is not requeued or regenerated automatically; the user can issue a new job later. Leased/running/waiting-external work is blocked and handled explicitly rather than copied.

## Q6 — Must a failed transfer be restartable?

**Answer:** Yes. The operation and each item are durable and resumable. Successful items are skipped on resume; only bounded retryable system failures retry; conflicts/permanent errors require resolution or skip. The UI must expose a clear “ดำเนินการต่อ” action when the operation pauses.

## Auto-Decisions

- Use the existing Drizzle/PostgreSQL schema and tRPC/Express/Vitest/Playwright conventions.
- Keep public hostname tenant resolution separate from authenticated tenant authorization.
- Implement cross-root SSO as an internal one-time code handoff protected by PKCE/state/nonce and an exact origin allowlist; do not rely on cross-domain cookies.
- Represent transfer execution as a Feature 186 canonical `worker_jobs` job with a dedicated item companion table and registered resource handlers.
- Use guarded transactions, idempotency keys, outbox/settlement markers, and per-item status to make retries safe.
- Treat the handler registry as the completeness authority; unsupported job-linked resource types are explicit conflicts/errors, never silently skipped.
- Preserve unrelated worktree changes and avoid `.env`, deployment, credential, or infrastructure changes in this plan.
