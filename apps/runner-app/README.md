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
x86_64, macOS Intel/Apple Silicon and Linux x86_64.
