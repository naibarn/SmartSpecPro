# SmartAIHub Runner

`smartaihub-runner` is the headless execution gateway for local Windows, macOS
and Linux devices and for the managed Cloudflare Container profile. It is a
separate package from `apps/worker-app`; it does not use the Worker App token,
configuration, registration or claim routes.

The binary has one lifecycle implementation behind these commands:

```text
smartaihub-runner doctor|status|capabilities|connect|reconnect|drain|shutdown
smartaihub-runner rescan # one explicit local discovery and capability refresh
smartaihub-runner run    # local refresh loop or shared_container /health/runner
```

`SAH_RUNNER_PROFILE=local_device` requires a device identity and control URL.
`SAH_RUNNER_PROFILE=shared_container` requires a Job/attempt/lease scope and
cannot persist a user-device identity. Credentials are injected by the host
runtime and are never serialized into the local journal or diagnostics.

For an enrolled local device, provide `SAH_RUNNER_DEVICE_PUBLIC_KEY`,
`SAH_RUNNER_DEVICE_PRIVATE_KEY` (PKCS#8 or PKCS#1 PEM) and
`SAH_RUNNER_MACHINE_FINGERPRINT`. The Runner signs the request proof required
by the control gateway for both the WSS handshake and HTTPS fallback. These
values are environment-only and are never included in protocol payloads.

The local control URL must use `https://`; `connect`/`reconnect` reads the
short-lived `SAH_RUNNER_ACCESS_TOKEN` from the environment, scans the bounded
known-tool catalog, runs approved `--version` probes with a timeout, and sends
one sequenced capability snapshot plus reconciliation event over authenticated
WSS. A network failure keeps the events queued for the authenticated HTTPS
durable endpoint. A version probe never implies account authentication, so a
tool remains `auth_required` until the adapter-specific auth gate succeeds.

`run` on a local device repeats that authenticated scan/reconciliation cycle
every five minutes by default. Set `SAH_RUNNER_REFRESH_INTERVAL_SECONDS` to a
bounded value from 15 to 86400 seconds. `rescan` performs one explicit cycle;
both commands use the same WSS/HTTPS fallback and never expose credentials.

The process host invokes an approved absolute executable directly (never via a
shell), confines the working directory to the assignment scope, and supports
bounded status/cancellation. Shared-container assignments create a fresh
`jobs/<job>/<attempt>/<lease>` scope and remove it during release.

The GitHub workflow at `.github/workflows/runner-release.yml` is deliberately
manual (`workflow_dispatch` only). It produces native artifacts for Windows
x86_64, macOS Intel (x64), macOS arm64 (Apple Silicon) and Linux x86_64.

## Release portal setup

Before enabling production downloads or updates:

1. Apply Runner release migrations `0336`–`0339` in the Web app.
2. Configure the existing Desktop Release settings with the GitHub repository
   and token, or set `SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY` and
   `SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN`. The workflow defaults to
   `runner-release.yml` and is dispatched only by an admin action.
3. Add the GitHub Actions secret `RUNNER_SIGNING_KEY`. Publishing is fail
   closed unless the workflow uses `required-secret` signing.
4. Configure durable R2/S3-compatible storage for the Web release catalog.
   The Dashboard serves only SmartAIHub same-origin download URLs.
5. Configure each local Runner with the matching
   `SAH_RUNNER_RELEASE_PUBLIC_KEY`; never place the private signing key in a
   Runner or browser environment.

An administrator starts the build from the Runner Release Control panel. After
the workflow completes, the server imports and validates the signed assets.
Users then use Dashboard → Runner Releases to check the version, download the
native package, or request an authenticated update for a connected local
Runner. Normal users never need to know the GitHub repository or workflow.

Local updates download a bounded, signed sibling artifact and verify its hash
and signature before replacement. The Runner copies itself to a temporary
post-exit helper before replacing the live binary; this is required for
Windows executable locks and keeps the same update state machine on macOS and
Linux. The helper confirms an authenticated Runner connection with the new
binary before reporting `completed`; failed confirmation restores the backup
and reports `rolled_back`.
