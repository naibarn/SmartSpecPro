# R03.7 Admin Relay Authorization Fix — 2026-11-17

## Source and integration

- Platform commit: `a8db8d74e35863cc508847292684e303616ecdb9`
- Platform `main` and `origin/main` both resolve to that SHA after non-force
  push.
- Changed Platform paths: `apps/saas-core/src/identity/authRoutes.ts` and
  `apps/saas-core/src/identity/authRoutes.test.ts`.
- Root cause: the authenticated Runner pairing relay resolved only legacy
  tenant memberships, although the Chat client sent the selected modular
  personal-workspace ID. The relay owner-session resolver now combines modular
  and legacy membership records before the existing DEV system-admin policy;
  duplicate identity remains fail-closed.

## Verification and deployment

- Core test suite: 22 files / 148 tests passed, including the route regression
  for a system admin with an authorized modular personal workspace.
- Immutable Core, Shell and Chat builds and Wrangler dry-runs passed.
- Registered controller: `DEPLOYED_AND_VERIFIED`, target
  `modular-debian-dev`, domain `aimarkethubs.com`, source
  `a8db8d74e35863cc508847292684e303616ecdb9`.
- Release artifact:
  `/home/dev/modular-development-releases/modular-debian-dev-a8db8d74e35863cc508847292684e303616ecdb9-system-admin-runner-membership-fix`.
- Controller local smoke: Core/Chat/Shell 200; Chat session without cookie
  401; Chat manifest and entry 200. Public smoke: Shell root/login and Chat
  health 200; Chat session without cookie 401.
- Controller deployment timestamp: `2026-11-17T04:04:24.945613+00:00`.

## Acceptance still pending

- Authenticated browser UAT was not performed. The same user screenshot showed
  “This account cannot access the selected workspace”; this fix covers the
  Runner relay route's membership resolution and does not prove that separate
  Chat workspace error is resolved.
- Runner approval, enrollment, live heartbeat, and canonical Job execution are
  not claimed. Next action: retry from an authenticated admin browser; if Chat
  workspace denial remains, capture the failing Core request/status and
  workspace ID. If the relay action succeeds, complete approval and verify
  enrollment before any real Job UAT.
