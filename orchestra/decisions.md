# Orchestra Decisions — Feature 201 Audit

[2026-09-18T02:13:42+07:00] DECISION: Start a fresh audit session and archive the existing orchestra directory.
  Context: The repository already contained an orchestra state for other audit work; the workflow requires preserving it before starting a new session.
  Alternatives considered: Reuse the old state would mix Feature 201 findings with unrelated Feature 202/203 records.

[2026-09-18T02:14:00+07:00] DECISION: Use direct inline review waves in standard light mode.
  Context: The task has multiple independent read-only boundaries, but sub-agent dispatch is not necessary and the current platform policy favors conductor-owned review.
  Alternatives considered: Fan out reviewers; rejected because ownership and critical-path integration are clearer in one conductor pass.
# Decisions — Feature 201 convergence audit

- Keep protection fail-closed at final artifact consumption: ON never exposes the raw artifact while protection is pending or failed.
- Treat OFF as an explicit persisted user decision (`UNPROTECTED_BY_USER_CHOICE`), not as absence of a record.
- Resolve absent per-export intent from the user's persisted default in Vertical Drama and Video Studio; Media Studio exposes the choice directly in the generation surface.
- Keep verification claims honest: exact SHA-256 and image dHash are implemented; unavailable video/audio/C2PA/TSA detectors are represented as unavailable rather than inferred.
- Store evidence as an immutable hash-addressed ZIP and expose it only through a case-scoped reviewer token.
- Do not create a new incompatible per-user RBAC registry during this audit; preserve the existing tenant/owner/admin boundary and record the spec-role mapping as a release-gated authorization follow-up.
- Treat verification as a first-class canonical job: `content_protection.verify` is admitted through the existing gateway/outbox and consumed by the PostgreSQL pull worker. The tRPC mutation only creates/reuses the run and returns `QUEUED`.
- Keep Verify candidate scope server-derived. User requests are `owner` scoped; admin requests are `tenant` scoped. The worker contract carries that bounded decision so retries cannot widen access.
- Include persisted signed certificate documents in evidence ZIPs when available. Never manufacture a trusted timestamp, transparency proof, or advanced detector output merely to fill the evidence layout.
- Preserve failed verification runs as immutable history but permit a later request to create a new idempotent run for the same input hash; otherwise a transient or repaired runtime failure would permanently block user recovery.
