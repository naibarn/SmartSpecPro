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

`SAH_RUNNER_PROFILE=local_device` uses browser approval by default. Run
`smartaihub-runner connect`; the Runner generates its device proof locally,
opens the authenticated SmartAIHub approval page, polls until the user clicks
Allow, and stores the resulting credential bundle under the configured data
root with local-only permissions. No key or token needs to be entered into or
copied from the browser. `reconnect` starts the same flow again.

The older `SAH_RUNNER_DEVICE_PUBLIC_KEY`, `SAH_RUNNER_DEVICE_PRIVATE_KEY`,
`SAH_RUNNER_MACHINE_FINGERPRINT`, and `SAH_RUNNER_ACCESS_TOKEN` environment
variables remain supported for existing managed deployments. A local Runner
that has completed browser approval does not need them. The Runner signs the
request proof required by the control gateway for both the WSS handshake and
HTTPS fallback; private material never enters protocol payloads or diagnostics.

`SAH_RUNNER_PROFILE=shared_container` requires a Job/attempt/lease scope and
cannot persist a user-device identity. The local control URL defaults to
`https://smartaihub.app` and may be overridden with `SAH_RUNNER_CONTROL_URL`.
After approval, `connect`, `rescan`, and `run` scan the bounded known-tool
catalog and run bounded adapter probes before sending one sequenced capability
snapshot plus reconciliation event over authenticated WSS. A network failure
keeps the events queued for the authenticated HTTPS durable endpoint. For
`browser.v1`, readiness additionally requires the current authorized Runner
session, a tenant/session-bound grant, an isolated Chromium remote-debugging
context, CDP transport, structured DOM/accessibility observation, screenshot
evidence, and successful cleanup. Evidence is published as immutable hash
references only; a version probe never implies account authentication.

The browser probe uses `SAH_RUNNER_BROWSER_CERTIFICATION_FIXTURE_URL` when set,
and otherwise the controlled SmartAIHub `/healthz` fixture. The URL must remain
under `https://smartaihub.app/`. Browser readiness is fail-closed when the
grant is missing, expired, revoked, stale, cross-tenant, or bound to another
Runner session.

Browser executable discovery is deterministic and does not require adding a
directory to `PATH`. The order is: `SAH_RUNNER_BROWSER_EXECUTABLE` (absolute
path only), Playwright-managed browsers (`PLAYWRIGHT_BROWSERS_PATH` or the
standard user cache), Runner/browser-managed cache, compatible OS-installed
locations, and finally `PATH`. An invalid explicit path fails closed rather
than silently falling back. Capability and probe evidence records the selected
discovery source and Chromium version; the executable path itself is kept
inside the Runner process and is never serialized into a capability snapshot.

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
