# Request

## Task

ตรวจสอบและป้องกัน Remotion Vertical Drama assembly ที่ล้มเหลวด้วย `asset_stage_failed: Asset fetch failed (404)` เมื่อ worker พยายามอ่าน `/api/storage/files/*` จากคนละเครื่อง

## Constraints

- Preserve the existing dirty worktree and unrelated changes.
- Keep tenant/user authorization on managed media.
- Do not expose the protected storage proxy to unauthenticated workers.
- Do not add a database migration or dependency.
- Verify focused tests and `git diff --check`.

## Assumptions

- The worker-facing URL must be a short-lived managed download broker URL.
- Existing server-side staging may continue using the trusted storage adapter.
- The existing provider-only 60-minute broker TTL is sufficient for queued renders.

## Non-goals

- Changing storage ACL semantics.
- Deploying, restarting production services, or claiming browser/provider/live proof.
