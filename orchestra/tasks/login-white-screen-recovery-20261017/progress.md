# Login white screen recovery

- WorkUnit: `LOGIN_WHITE_SCREEN_RECOVERY_20261017`
- Owner: Codex primary
- Base canonical SHA: `27bd01188b524ac1e86ab8e88811da46a92369ba`
- Workspace: `/mnt/SmartSpecDev/.tmp/login-white-screen-recovery`
- Symptom: production `/login` intermittently renders blank; hard refresh temporarily restores it. Browser console reports React `removeChild` against a null DOM parent. Repeated 402 errors in extension scripts appear browser-extension requests and are not evidence of application API failure.
- Evidence-based root cause: browser translation/DOM mutation can alter React-managed text nodes and trigger this React DOM `removeChild` failure. Login itself previously disabled translation only within its React subtree, which occurs after React starts and does not protect the whole document.
- Implemented: set `google notranslate`, `translate=no`, and `notranslate` at the static document/body/root boundary before React mounts; wrap App in the existing ErrorBoundary as a recovery fallback.
- Local fast gate: `git diff --check` passed. No tests/build run before canonical integration.
- Current source commit: pending.
- Integrated main SHA: pending.
- Remaining: protected PR integration; canonical build from `/mnt`; production rollout and smoke verification; verify repeated normal `/login` navigation without hard reload.
- Next action: run diff/fast gate, commit and open PR, wait required checks, merge via integration controller, canonical build, then deploy frontend hotfix under prior user authorization and perform read-only production smoke.
