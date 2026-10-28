# Debian platform development and Runner topology check

Observed: 2026-10-28 03:31 UTC. Source checkout HEAD and `origin/main`: `3da6f7b71569772f224dd1fe57205ff1c0d14013`.

## Verified topology

- Host is Debian 13 (`6.12.63+deb13-amd64`), user `dev`.
- `/home/dev/projects/SmartSpecPro` resolves to `/mnt/SmartSpecDev/projects/SmartSpecPro`; both names refer to this same checkout. `.development-repository.toml` identifies this as the canonical development checkout.
- Development web listener `127.0.0.1:3100` is PID 1385421 with working directory `/mnt/SmartSpecDev/projects/SmartSpecPro/apps/web`.
- Development Python API listener `127.0.0.1:8100` is PID 997514 with working directory `/home/dev/.local/share/smartspec-dev/python`. That directory has no Git revision, so its source/build provenance remains unknown.
- Production web/API release targets are separate from the development listeners. No production release or routing action was performed.
- Local Runner service `smartaihub-runner.service` is `inactive` and `disabled`. Installed Runner status reports version `0.2.23`, `readyToolCount=0`; Codex is installed but availability/auth/health are `unknown`, version is unset, reason `probe_required`. These are local discovery observations, not registry registration, heartbeat, capability ACK, or execution proof.
- Existing SPEC-224 evidence says this Runner's prior production-bound credential expired and prohibits restarting/re-enabling it. This check did not start it or change credentials/services.
- Resource snapshot: 30 GiB RAM, 23 GiB available, 15 GiB swap (3.4 GiB used). Existing development services/workers remain active. Untracked local artifacts and task locks were preserved.

## Readiness and exact follow-up

No currently registered, authorized Debian Runner/project binding or provider-specific task-ready evidence was available in this local read-only check. The backend listener has no immutable Git provenance. Do not label the local Runner as online or Codex-ready, and do not infer a Platform Engineering Project from an alias, role, or filesystem path.

Next source operation for SPEC-277: after SPEC-293 exposes the existing trusted Platform Engineering Project/Runner binding and SPEC-224 exposes provider-specific readiness/pinning, update `Spec224WorkspacePanel.tsx` to gate the first-class Platform Engineering action on those server-authorized projections. Until then, keep existing general prompt/SPEC Task Control and do not add guessed project identity or Harness/Model/Profile selection.

Runtime prerequisite: enroll a Linux Runner through the existing owner-authenticated non-production registration/approval flow with a dev-scoped credential, then verify fresh heartbeat, applied capability ACK, Codex task probe, and authorized workspace publication. Do not reuse or restart the expired production-bound enrollment.
