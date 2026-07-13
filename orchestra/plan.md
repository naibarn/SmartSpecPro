## Task Classification
- Scope: medium
- Risk: high
- Affected domains: host infrastructure, Docker, systemd, production observability
- Estimated file count: TBD
- Chosen route: incident data-first diagnosis and prevention hardening
- Bug route: true
- Classification notes: SSH to the production host was unavailable until a reboot, so kernel/resource evidence and non-destructive safeguards are required before determining remediation.

## Evidence Ledger

- 2026-07-12: current public homepage and /healthz return HTTP 200 (rescue diagnostic).

- Prior incident: Postgres port was lost through wrong compose wiring; current request describes host-level unreachability and requires separate evidence.
