# Section 03: Dispatch and Sync

## Scope

Add the Upload-Post publish path, job persistence, status polling, and background sweep logic.

## Work

- Implement `UploadPostDispatcher` as a parallel path, not as a `SocialProviderAdapter`.
- Persist Upload-Post jobs in `upload_post_jobs`.
- Add publish-now, schedule, cancel, edit, list, and status syncing behavior.
- Add batched polling and a stale-job sweep for pending, scheduled, and queued jobs.

## Constraints

- Keep Upload-Post jobs out of `social_posts`.
- Decrypt the API key only for the duration of the request.
- Sanitize all upstream errors before storing or returning them.

