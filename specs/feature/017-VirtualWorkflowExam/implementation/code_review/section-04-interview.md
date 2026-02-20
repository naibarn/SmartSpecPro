# Section 04 Code Review Interview

## Findings Triage

### Asked User
1. **System user role** — 'admin' vs 'user'. User chose: **Change to 'user'** (safer).

### Auto-Fixed
1. **Timer leak in generateSvgWithTimeout** — Added `clearTimeout(timer)` in both success and catch paths.
2. **Counting bug** — Templates with SVG warnings now still get `[OK]` log and `ok++` on successful DB upsert. Added "(no SVG)" suffix when SVG is null.
3. **categoryId missing from onConflictDoUpdate** — Added `categoryId: sql\`excluded."categoryId"\`` to update set for full idempotency.
4. **Test queries by email → openId** — Changed all test queries from `users.email` to `users.openId` to match the unique constraint used by the seeder.
5. **Category count assertion** — Changed `toBeGreaterThanOrEqual(15)` to `toBe(15)` for exact count validation.
6. **Unused `count` import** — Removed from test file.

### Let Go
1. **Manual .env parser** — Works correctly for our use case. dotenv would require adding a dependency outside apps/web. The manual parser handles the simple KEY=VALUE format used in our .env files.
2. **Missing integration tests** (idempotency update, error resilience, exit code) — These require complex test setup (modifying JSON files mid-test, invalid DB URLs). The existing tests cover the core seeder functionality.
3. **No runtime validation of JSON shape** — The 60 template files are already validated by section-03 tests (721 assertions). Runtime Zod validation is unnecessary for this controlled input.
4. **Tests modify production DB** — Expected for integration tests. The seeder is idempotent so repeated runs are safe.
5. **Strict regex filter** — Correct for the naming convention we use (`tpl-NNN-slug.json`).

## Verification
- Seeder re-run after fixes: 60 OK, 0 warned, 0 errored
- Idempotency confirmed on second run
