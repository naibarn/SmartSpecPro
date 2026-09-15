# Review Contracts

This session has no parallel writers or new public API contract. The review
contract is frozen as follows:

- Canonical identity: `worker_jobs.id`.
- Canonical state/history: PostgreSQL `worker_jobs` and append-only
  `worker_job_events`.
- Production runtime target: Cloudflare only.
- Google exception: Google OAuth/Drive product integrations only; no Google
  Cloud Tasks, Cloud Run, OIDC task route, or Google runtime fallback.
- Local readiness may be `LOCAL_CONTRACT_READY` only and must never claim
  target-account or production proof.

Ownership: the conductor edits only files directly required by a finding and
preserves all unrelated dirty files. Verification owns the final gates.
