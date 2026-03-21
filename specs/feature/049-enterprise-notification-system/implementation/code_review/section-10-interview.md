# Section 10 — Code Review Interview

## Auto-fixed

1. **HIGH: Feature flag** — Added `notificationEmailDelivery` (F24) to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS`. Note: tenant-level gate in createNotification requires tenant context which the service doesn't have. `channels.email` defaults to false, providing user-level gating. Section-13 will add the tenant-level flag gate.

2. **HIGH: BullMQ connection** — Changed from `{ host, port }` extraction to `redis.duplicate()` passing IORedis instance directly, matching reliable production pattern.

3. **MEDIUM: SQL filter** — Added `isNotNull(notificationPreferences.emailDigestFrequency)` to the WHERE clause to reduce unnecessary row fetches.

4. **MEDIUM: Column projection** — Added explicit select columns for the unread notifications query in digest job.

## Documented gaps

5. **HIGH: Locale hardcoding** — `users` table has no `locale` column. Hardcoded to "en". Known gap documented in code comments. Will need schema migration in the future.

## Let go

6. **MEDIUM: Category deduplication** — First-row-wins per userId is adequate for initial implementation.
7. **MEDIUM: userId in success log** — Using "redacted" in immediate email is intentional to avoid PII correlation. Digest already logs userId.
8. **LOW: Test assertion tightening** — Tests provide adequate coverage at current level.
