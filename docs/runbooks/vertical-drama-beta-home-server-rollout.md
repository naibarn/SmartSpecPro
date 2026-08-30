# Vertical Drama beta rollout — Debian home server

This runbook replaces the Cloud Run/GCP rollout evidence for the current beta
deployment target. The target is one Debian home server using the repository's
`smartspec-backend.service` and `smartspec-web.service` units.

## What “canary” means on one home server

There is no independent revision or traffic-splitting layer on a single host.
The beta canary is therefore:

1. capture the current service, git, journal, and health state;
2. restart backend and web through systemd;
3. run the existing smoke test five times against the local/public URL;
4. capture the post-restart state and logs.

This is a real restart/readiness proof, but it must not be reported as a 10% or
50% traffic canary.

## Before changing the server

- Use a clean, reviewed release directory or immutable release archive. Do not
  run `git checkout`, `git reset`, or `git pull` over a dirty working tree.
- Take the normal database backup required by the host runbook before applying
  migration `0245`.
- Verify that migration `0245` is additive and that the application can run with
  both the old and new schema. Code rollback must not require deleting the new
  tables.
- Confirm the operator has SSH/console access to the host before restarting.

## Evidence commands

Run from the deployed repository checkout on Debian:

```bash
./scripts/vertical-drama-beta-rollout-evidence.sh preflight
```

The command is read-only and stores redacted operational evidence under
`.artifacts/vertical-drama-beta/` (the path can be overridden with
`VD_BETA_EVIDENCE_DIR`). It does not print environment files or secrets.

After the reviewed release is installed:

```bash
VD_BETA_ROLLOUT_CONFIRM=restart \
  ./scripts/vertical-drama-beta-rollout-evidence.sh restart-canary
```

The explicit confirmation variable is intentional: this command restarts the
real beta services. If any smoke attempt fails, it captures failure evidence and
stops without claiming success.

## Rollback

Rollback must restore a known-good immutable release, not mutate the database or
guess a git revision. Supply the reviewed host-specific release restore command:

```bash
VD_BETA_ROLLOUT_CONFIRM=rollback \
VD_BETA_ROLLBACK_COMMAND='/opt/smartaihub/releases/KNOWN_GOOD/activate.sh' \
  ./scripts/vertical-drama-beta-rollout-evidence.sh rollback
```

The command then verifies both systemd services and the application smoke test.
If the host does not yet have immutable release directories, rollback evidence
is not complete; establish that release mechanism before calling the beta
deployment production-grade.

## Current boundary

This runbook intentionally does not perform GCP authentication, Cloud Run
traffic shifting, or Cloud Run rollback. Those are not part of the beta target.
