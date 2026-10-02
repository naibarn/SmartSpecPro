# Incident Recovery — Web Login Availability

## Summary

- **Severity:** SEV-1, Web application unavailable.
- **Impact:** `smartaihub.app` returned HTTP 502, preventing Admin login and Cloudflare setup.
- **Cause:** The Web systemd unit had been intentionally masked during the G2 auth-state migration hold. The email/password cookie login path itself did not require external OAuth or Redis JTI lookup.
- **Recovery:** Restored only the Web unit from the repository service template, pointed it at a clean worktree, enabled the Redis JTI compatibility bridge, and started/enabled the unit.

## Recovery evidence

- Commit: `54e69ffaa69098e3d83efe540baa760c0fa7d9f5` in `/home/dev/smartspec-web-recovery`.
- Systemd: `smartspec-web.service` is active and enabled. `JTI_REDIS_ROLLBACK_MIRROR=enabled` is applied by `/etc/systemd/system/smartspec-web.service.d/20-auth-availability-recovery.conf`.
- Public checks: `/`, `/login`, `/healthz`, and the built JavaScript asset returned HTTP 200; TLS health check passed.
- Auth smoke: a synthetic nonexistent email reached `auth.login` and returned the expected 401. PostgreSQL read-only aggregation found one password-backed Admin account, not disabled, with 2FA off. The actual operator password was not available, so a successful credential sign-in and protected Admin query were not independently verified.
- Local checks: focused cookie, login-error, and JTI tests passed (19/19); clean production build passed. `auth.logout.test.ts` did not load because `vitest.config.ts` supplies an invalid short `CONTROL_PLANE_API_KEY` test value.
- JTI state: 211 active Redis-only and one PostgreSQL-only JTI at recovery time. The mirror keeps both stores in the deny decision. No import or deletion was performed.

## Remaining scope

- `smartspec-backend.service` and `smartspec-web-watchdog.service` remain masked/inactive. The Python API origin and non-login features that depend on it were not restored in this action.
- The operator has confirmed the real Admin sign-in works. G2 reconciliation, Runner/Worker pairing keyring setup, and a protected Admin tRPC query from this execution context remain unverified.
- The running service depends on the clean worktree and linked dependencies at `/home/dev/smartspec-web-recovery`; keep these in place until a reviewed normal deployment replaces them.

## Cloudflare settings follow-up

- Deployed the Admin Cloudflare Credential Center at Admin Settings → Infrastructure → Cloudflare, including Audit/Deployment token profiles, permission instructions, read-only probes, Account ID/Vectorize sync, and the existing R2 settings editor.
- Renamed the old runtime card as a Worker runtime deployment guide and clarified that it is separate from API-token settings.
- The existing Vectorize credential probe succeeded for Workers, KV, Queues, Workflows, Tunnels, Vectorize, and Worker Routes. It reported missing permissions for dispatch namespaces, Hyperdrive, Load Balancer pools, R2 administration, DNS, and zone Load Balancers; the Containers endpoint returned HTTP 400.
- The UI reports `CLOUDFLARE_RUNTIME_TOKEN` missing. Runtime secrets remain deployment-environment-owned; the UI explains where they must be set and that Web needs a restart.
- After deployment, the Admin asset returned HTTP 200, health remained HTTP 200, and an unauthenticated credential-center API request returned the expected 403. The operator can refresh the page with a hard reload to fetch the new bundle.

## Timeline

| Event | Result |
|---|---|
| Production inspection | Web/Backend/watchdog masked; public Web 502 |
| Read-only auth-state scan | Redis 211 active JTI-only; PostgreSQL one active JTI-only |
| Candidate validation | Focused auth/JTI tests 19/19; production build passed |
| Web recovery | Unit active/enabled with Redis JTI bridge |
| Public verification | Web, login page, health endpoint, and asset returned 200 |
