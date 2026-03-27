---
name: 061-Upload-Post Gateway Architecture Review
description: Architecture review findings for feature 061 — Upload-Post universal social gateway. Second-round review after first-round fixes.
type: project
---

First-round criticals resolved in spec update (2026-03-24). Second-round review below.

**Why:** Documents unresolved architectural gaps so build agents don't build into broken assumptions.
**How to apply:** Reference before implementing any section of spec 061.

## CRITICAL (remaining after spec update)

**C-01: SocialProviderAdapter interface is incompatible with Upload-Post**
`SocialBackgroundActionInput` has `pageId: number` (references social_pages), no `userId`, no API key. The existing `execute()` signature cannot dispatch Upload-Post operations without knowing who the user is. Section 4.4 shows `providerRegistry.register("upload_post", { type, capabilities, supportedPlatforms })` — this is a different object shape from the real `SocialProviderAdapter` interface. That call will fail TypeScript compilation.

**C-02: `uploadPost.publish` is a 30-second tRPC mutation with a decrypted key in memory**
Section 4.1 resolves the original Python-vs-Node split by putting ALL uploads in Node.js with a 30-second timeout. Section 6.1 says "decrypted key exists in memory only during the HTTP request lifecycle." For large video uploads (>100MB), the tRPC request holds the connection open for 30+ seconds with the plaintext key in V8 heap. tRPC has no streaming response. The delegation token pattern (Section 6.8) is labelled "future scope." The spec must either (a) accept the risk and cap video size, or (b) implement the delegation token for Phase 2 publish — not defer it.

## HIGH

**H-01: Unified timeline pagination has no defined cursor contract**
Section 5.3 does two parallel queries and merges. Both procedures have independent `cursor: z.string().optional()` with no defined format. Cursor-based pagination across two tables with independent cursors cannot maintain a consistent sort order when paging forward. No pagination strategy is defined for the merged view.

**H-02: Cron sweep has a 2–10 minute dead zone for browser-closed jobs**
Section 4.5 cron sweeps `WHERE updatedAt < NOW() - 2 minutes` every 5 minutes. A job created at T=0 becomes eligible at T=2min but cron may not fire until T=5min or T=10min depending on timing. A user who closes the browser at T=30s will see their job stuck in "pending" for up to 10 minutes with no update. For scheduled posts the gap is hours. The spec presents this as solved but user-visible stale status is the actual outcome.

**H-03: Feature flag enforcement pattern unspecified**
Section 7 defines `isUploadPostEnabled()` but does not say where it is called. 17 procedures — if each calls it individually: 17 Redis round-trips per page load and one missed procedure = silently accessible endpoint. Middleware wrapper is architecturally correct but is not specified.

**H-04: Workflow/agency user identity is undefined**
Section 4.6: "the workflow executor resolves the user's Upload-Post connection." In a workflow/agency context, no tRPC `ctx.user.id` exists. The spec does not define which user ID is used (workflow owner? triggering user?), nor does it show the Python code path for resolving the connection from `upload_post_connections`.

## MEDIUM

**M-01: providerRegistry.ts adapter interface mismatch**
The real `SocialProviderAdapter.execute()` receives `SocialBackgroundActionInput` with `pageId`, `conversationId`, `commentId`. Upload-Post has no concept of a `pageId` (social_pages row). Either the interface must be extended with an optional `userId` field, or Upload-Post should NOT be registered in `providerRegistry.ts` at all and should have its own dispatch path. The spec says "register as an adapter" but the concrete adapter body is never shown.

**M-02: `window.opener.postMessage` uses wildcard targetOrigin**
Section 6.7 callback sends `postMessage('upload-post-linked','*')`. Any window in the browser can receive this. Correct: `postMessage('upload-post-linked', 'https://smartaihub.app')`.

**M-03: Nonce in redirect URL leaks through logs**
Section 6.7 appends `?nonce=${nonce}` to the redirect URL passed to Upload-Post. Query parameters appear in Node.js/Nginx access logs and browser history. Better: store nonce in a session cookie; look it up server-side on callback without it appearing in any URL.

**M-04: `sanitizeUploadPostError` regex over-matches**
Regex `[A-Za-z0-9_-]{20,}` replaces any 20-char alphanumeric sequence. A file path like `/uploads/abc123def456ghi789jkl/video.mp4` would partially strip but the pattern misses path separators. More critically, a legitimate error message containing a 22-char word or model name would be redacted, destroying diagnostic value. Add a more targeted pattern (e.g., require no spaces, no slashes, entropy-like structure).

**M-05: Shared Upload-Post account queue collision**
If two SSP users share the same Upload-Post credentials (same account, different SSP logins), queue settings mutated by one user affect the other at the Upload-Post side. The `UNIQUE("tenantId", "userId")` constraint in `upload_post_connections` prevents detecting this sharing. The disclosure UI should note this risk.

## LOW

**L-01: `listJobs` cursor format is undefined**
`cursor: z.string().optional()` with no specification of encoding. Must be explicit to implement unified timeline merge correctly.

**L-02: `uploadPostEmail` stored but never displayed**
Section 3.2 stores `uploadPostEmail`. Section 5.1 explicitly says not to display email (PII minimization). If never displayed, storing it violates GDPR/PDPA data minimization (acknowledged in Section 1.5). Either drop the column or add a documented reason for retention.

## Resolved from first round (confirmed fixed)

- UploadPostClient now in Node.js for all operations — confirmed in Section 4.1
- `upload_post_jobs` is standalone with no FK to `social_posts` — confirmed in Section 3.1/3.4
- `providerRegistry.ts` is the correct extension point — confirmed as Node.js file
- `social_publish_task.py` Celery leakage — resolved by separate table design (no social_posts row created)
- JWT callback and nonce designed — Section 6.7 added
- Status sync loop designed — Section 4.5 added
