# Section 07 Code Review Interview

## Issues Found

### AUTO-FIX (applying without asking)

1. **Dead code bug in `dispatchJob`** - The `useCloudTasks && result.kie_job_id` condition in the else branch is always false because the else branch only executes when `useCloudTasks` is falsy. Fix: remove the `useCloudTasks` guard.

2. **Missing JSON parse error handling** in webhook handler - `json.loads(body_bytes)` has no try/except, causing 500 on malformed payloads. Fix: wrap in try/except, return 400.

3. **Missing error handling around `enqueue_task`** in webhook handler - If Cloud Tasks enqueue fails after DB update, the job is stuck completed with no media processing. Fix: wrap in try/except, log error but don't fail the webhook.

4. **Missing warning log when webhook secret not configured** - Security improvement matching existing legacy handler behavior.

### INTERVIEW (needs user decision)

5. **Endpoint path**: Plan says `POST /api/webhooks/kie`, implementation puts it at `/tasks/webhook-kie` which is behind OIDC middleware.

### LET GO

6. Node.js tests are simple/placeholder - they validate mocking behavior not real app code. Acceptable for now.
7. Feature flag gating in webhook handler - not critical for the migration.
8. `job_events` recording - handled internally by MediaTaskService.
9. WebhookDedupService silent degradation - fail-open is the correct behavior.

## User Decision

**Endpoint path question was answered**: Keep at `/tasks/webhook-kie` for now. The OIDC middleware will need an exception for this path, which can be handled in Section 4's OIDC middleware configuration. This aligns with keeping all Cloud Tasks handlers under the `/tasks/` prefix for consistency.

## Applied Fixes

- [x] Fixed dead code bug in `dispatchJob` - removed `useCloudTasks &&` guard
- [x] Added JSON parse error handling in webhook handler
- [x] Added try/except around `enqueue_task` in webhook handler
- [x] Added warning log when webhook secret not configured
