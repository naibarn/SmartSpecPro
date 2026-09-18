# Self-review round 1

- The plan uses the existing canonical worker monitor and does not add a
  ledger, workflow engine, Agency path or retired runtime.
- Authorization remains server-derived from tenant/requesting user context;
  client grouping is never trusted.
- Dependency inclusion is bounded and only uses persisted job IDs.
- UI work is after the API contract and retains the single global entry point.

Open implementation checks: exact database row typing, status normalization,
and pagination behavior must be verified while coding.
