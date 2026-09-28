# Decision Log

## Depth

Standard quick plan with five sections. The architecture and operational
runbook already exist; the task is completion, hardening, installation, and
verification rather than a new subsystem.

## Decisions

1. Use the dedicated host Feature 135 worker for both server scopes.
2. Enable shared and server-personal scopes only after the paired worker is
   online and advertises Hermes media capability.
3. Keep private-worker mode optional per user but publish everything required
   for Windows users to make it work.
4. Make UI readiness authoritative and scope-specific.
5. Store worker credentials only in `/etc/smartspec/hermes-worker.env` with
   root ownership and mode `0600`.
6. Do not attempt Grok authorization on behalf of an account owner; verify the
   device-code handoff.

## Stabilization Reviews

1. Completeness: added installer/runtime publication, not only server pairing.
2. Contradiction: separated the legacy gateway from Feature 135 media worker.
3. Security: retained admin/owner/tenant checks and secret-file isolation.
4. Failure modes: scope flags remain off until worker heartbeat/capability pass.
5. UX: added explicit central/server-personal/private distinctions and disabled
   states.
6. Operations: added service, manifest, artifact, health, and heartbeat proofs.

Rounds 5 and 6 found no further meaningful plan changes.
