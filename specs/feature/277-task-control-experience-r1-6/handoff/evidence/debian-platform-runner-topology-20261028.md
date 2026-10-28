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

## Signed Linux Runner candidate attempt

- GitHub Actions workflow `SmartAIHub Runner manual release`, run `40627538831`, was dispatched from integrated SHA `0707f1eb709490edcf27c70031e9eabd29c095f1` for Linux `local_device`, version label `0.2.49-platform-dev-20261028`, `required-secret` signing, and `publish=false`.
- The required `Test Runner crate` gate failed twice on GitHub's Linux runner: 219 passed, 1 failed. Both failures were `moli_isolation::tests::linux_spawn_uses_user_network_namespaces_private_profile_and_group_cleanup`, `apps/runner-app/src/moli_isolation.rs:797`, where the nested test process exited 1 instead of 0. Child stderr is discarded by the test, so its internal failure cause is not exposed by the CI receipt.
- On this Debian host, the same exact test passed 1/1 and `unshare --user --map-root-user --net --fork --kill-child=SIGKILL -- /bin/true` succeeded. The Linux installer lifecycle test passed. These results do not excuse the required CI failure.
- The release workflow did not produce an artifact; no Runner binary was installed or started.

## Browser approval route observation

- `http://127.0.0.1:3100/runners/connect` returned 200 HTML and local `/healthz` returned 200 JSON.
- `https://aimarkethubs.com/runners/connect` returned 404 JSON while `https://aimarkethubs.com/healthz` returned 200 JSON. No enrollment request was created. The current public development origin therefore did not expose the browser approval route during this check; do not fall back to the production origin.

## Exact remaining operations

- SPEC-224 / Runner owner: diagnose the CI-only nested namespace test failure (including surfacing the child test's bounded error) and produce a passing signed Linux `local_device` candidate without bypassing or weakening the required test. Provide the trusted release public key for local signature verification.
- Development ingress owner: route the existing `/runners/connect` approval UI through the authorized non-production origin or provide its existing accessible non-production URL. Do not change production routing.
- SPEC-293 / workspace owner and SPEC-224 / runtime owner: expose the existing trusted Platform Engineering Project/Runner binding and provider-specific readiness/pinning. SPEC-277 can then implement the guarded first-class UI action without guessing identity or execution scope.
