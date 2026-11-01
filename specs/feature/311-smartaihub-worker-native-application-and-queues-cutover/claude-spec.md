# SPEC-311 implementation brief

Normative authority: [spec.md](spec.md), revision R1.1. The owner requests a complete development spec before implementation/cutover; this deliverable is planning, not permission to change production traffic.

Build Worker-native API/auth/data access and Cloudflare Queue job execution on existing platform resources. Preserve PostgreSQL smartspec, separate development tenant/runtime, session/2FA identities, active features and canonical worker_jobs/outbox. Ordinary browser operations and job control must work with application Containers and Debian application egress unavailable. Unknown active routes/job types and unaccepted native-compute dependencies block cutover.

The plan is scoped to the unsatisfied REQ-311-01 through REQ-311-20 requirements. Existing Worker/Queue/Hyperdrive source is reused only after capability and live-scope verification; tests or past proxy deployment receipts do not prove native parity. No runtime implementation or live acceptance is claimed in this planning checkpoint.

Operational update: live migration resources were decommissioned by explicit owner direction on 2026-11-01. Continue development locally; provider reprovision/deployment and traffic changes remain disabled until the owner resumes the relevant live phase. Historical provider receipts are not current readiness evidence. See spec.md and cloudflare-decommission-20261101.md.
