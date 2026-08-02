# Worker App — "Worker token has been revoked" + login autostart not working

Status: implementing (2026-08-02)

## Problem

Field report: Worker App 0.1.159 restores its saved connection at launch, shows
"Ready for render jobs", and simultaneously raises a native dialog —
`unable to refresh worker access: worker control plane returned HTTP 401
Unauthorized: Worker token has been revoked`. The same machine has "Start with
Windows sign-in" ticked and does not pick up jobs after login.

## Root cause

`refreshWorkerAccessTokens` (apps/web/server/services/workerAuthService.ts:638)
revokes the presented refresh `jti` the instant it issues a replacement —
single-use rotation with no reuse-grace window, denylisted in Redis for the
refresh TTL (7 days).

Four independent drivers rotate that single-use token, reading the same
`connection.json`, with no lock and no in-flight coalescing:

1. `worker_app_check_connection_health` — every launch + hourly
2. React renewal `setTimeout` (`computeRefreshDelayMs`) — ~1h45m, because the
   upload token TTL is 2h
3. `startLoop` → `shouldRefreshBeforeStartingLoop` — true whenever the app was
   closed longer than the 2h upload TTL, i.e. exactly the login-autostart case
4. Rust `try_refresh_connection_if_needed` in the worker loop

At login after an overnight shutdown, (1) and (3) fire together on the same
token: one wins, the other gets 401 "revoked". Contributing factors:

- `lib.rs` registers no single-instance plugin, so autostart can start a second
  copy on top of a tray-resident one — two processes, one connection file.
- A rotation that succeeds server-side but is never persisted (process killed,
  connection dropped) spends the token with no replacement on disk = permanent
  lockout.
- `shouldClearSavedConnectionAfterRefreshError` matches "revoked" and DELETES
  the saved connection, so a lost race silently disconnects the machine —
  which presents the next morning as "autostart doesn't work".
- `isJtiRevoked` (server/_core/revocation.ts) fails closed when `REDIS_URL` is
  set but Redis is unreachable: every worker token reads as revoked.

## Affected files

| File | Change |
|---|---|
| `apps/worker-app/src-tauri/src/diagnostics.rs` | structured rotating log (DONE) |
| `apps/worker-app/src-tauri/src/commands.rs` | refresh gate + coalescing + read-only health probe |
| `apps/worker-app/src-tauri/src/worker_control_plane.rs` | `get_worker_json` (device-proof GET) |
| `apps/worker-app/src-tauri/src/lib.rs` | single-instance plugin, app.start/exit logging |
| `apps/worker-app/src-tauri/Cargo.toml` | `tauri-plugin-single-instance` |
| `apps/worker-app/src/main.tsx` | stop auto-clearing on "revoked", caller tags |
| `apps/web/server/services/workerAuthService.ts` | refresh reuse-grace window |

## Changes

1. **Serialize + coalesce rotation (client).** A process-global async mutex
   around read → rotate → persist. Inside the lock, re-read from disk and skip
   the rotation entirely when the stored tokens were refreshed recently and
   still have comfortable life left. Removes the intra-process race and cuts
   rotation frequency.
2. **Single-instance guard.** `tauri-plugin-single-instance` focuses the
   existing window instead of starting a second copy on the same
   `connection.json`.
3. **Health check stops rotating.** Probe `GET /api/workers/:id/policy` with
   the execution token — read-only, same auth path, and it also catches an
   admin revocation (`ensureWorkerScopedAccess` → `readWorkerRevokedAt`) that
   the refresh endpoint never checks. Fall back to a rotation only when the
   execution token is too close to expiry to probe with.
4. **Server reuse-grace.** Remember the token set issued for a refresh `jti`
   for 60s; replaying that jti inside the window returns the same set instead
   of 401. Fixes both the residual race and the rotation-lost-in-transit
   lockout. Standard refresh-token grace-window behaviour.
5. **Stop auto-deleting the saved connection** on "revoked"/"reuse"/"replay".
   Those are now recoverable; the user keeps the connection and decides. Only
   genuinely unrecoverable verdicts (device proof, expired refresh) still
   clear it.

## Risk

- (4) widens the refresh window: a stolen refresh token replayed within 60s
  gets a valid token set. Accepted — this is the standard grace-window
  tradeoff, still device-proof bound, and strictly narrower than the 7d
  validity the token already had.
- (3) changes what "healthy" means: the probe no longer proves the refresh
  token works. Mitigated by falling back to a rotation near expiry and by the
  renewal timer still exercising refresh on schedule.

## Verification

- `cargo test --lib` in `apps/worker-app/src-tauri` (126 tests baseline)
- `npx tsc --noEmit` in `apps/worker-app`
- `pnpm vitest run` for the touched server auth suite
- Windows installer built via `npm run release:windows` (cargo-xwin cross
  build) and published to `apps/web/client/public/releases/` +
  `apps/web/dist/public/releases/`

## Verification results (2026-08-02)

- `cargo test --lib`: **133 passed, 0 failed** (121 baseline + 5 diagnostics +
  7 refresh-coalescing tests)
- `npx tsc --noEmit` (worker-app): clean
- `npx tsc --noEmit` (apps/web): no new errors in `workerAuthService.ts`
- `vitest run server/services/__tests__/workerAuthService.test.ts`:
  **20 passed, 0 failed** (15 baseline + 5 new grace-window tests)
- `vitest run server/hermesWorker/__tests__/controlPlaneClient.test.ts`:
  6 passed
- Windows installer: `smart-ai-hub-worker-app-0.1.162-x64-setup.exe` (4.35 MB),
  cross-built with cargo-xwin + NSIS, copied to
  `apps/web/client/public/releases/` and `apps/web/dist/public/releases/`.
  `GET /api/desktop-releases/worker-app/latest` → 0.1.162;
  `/download` serves it with the matching content-disposition.
- Server change deployed via `npm run build:deploy` + `sudo systemctl restart
  smartspec-web.service`; service `active`, endpoint 200.

### Note on 0.1.161

0.1.161 was built and published a minute before 0.1.162 and then superseded:
the removal of the unused `worker_app_refresh_connect_tokens` command landed
after that crate had already compiled. 0.1.161 is functionally equivalent for
users (the removed command had no callers) and was never announced; it is left
in the releases directory because the download endpoint always serves the
highest version. Delete it if the release list should stay clean.

## Not fixed (known, out of scope)

`isJtiRevoked` in `server/_core/revocation.ts` fails CLOSED when `REDIS_URL` is
set but Redis is unreachable — every worker token then reads as revoked, and
`assertConnectionNotBlocked` reports "connection is blocked" for the same
reason. That is a deliberate security posture, but it means a Redis outage is
indistinguishable from a mass revocation. Worth a separate decision.
