# Local Debian Runner readiness observation

Observed: 2026-10-29 23:22 Asia/Bangkok from the existing Debian host.

## Evidence

- The existing user-level `smartaihub-runner.service` is enabled and active;
  its MainPID is `927063`. There is no corresponding system-level unit, so
  `systemctl is-active smartaihub-runner.service` without `--user` is not the
  correct service check on this host.
- The service's configured data root resolves the persisted Runner identity to
  `runner-f1328901deec1b147d200a818e12e4be`; the running CLI version is
  `0.2.53-spec224-refresh-6b339c0232`.
- Running `smartaihub-runner status` with the service's configured data root
  reported `state=ready`, one authorized-execution-ready tool, and Codex
  `codex-cli 0.165.0` with authentication, version probe, and task probe
  passed. The task probe was observed at `2026-10-29T16:06:51Z` and expires at
  `2026-10-29T17:06:51Z` (about 16 and 44 minutes old/remain at observation).
- No Run, Goal, Grant, Job, or execution was created by this check.

## Important limit

This is local Runner process/configuration evidence. It does not independently
prove a fresh server heartbeat, server-applied capability ACK, account-bound
Model Catalog delivery to Task Control, or the actual development website's
serving revision. The CLI uses a data-root-relative identity store: invoking it
outside the service configuration can display a placeholder/generated local
identity and degraded readiness. Do not use that alternate invocation as
evidence for the registered Runner.

The live SPEC-224 Goal still needs to be started through authenticated Task
Control and its real Goal Grant approved through the existing Approval
Authority. No synthetic approval or receipt was created.
