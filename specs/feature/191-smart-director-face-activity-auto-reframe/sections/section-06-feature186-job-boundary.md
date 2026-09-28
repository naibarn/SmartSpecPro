# Section 06 — Feature 186 boundary

Bind Full Scan to the existing Feature 186 canonical job/outbox/lease APIs.
Persist source fingerprint, Mark revision, policy fingerprint, capability
profile, checkpoint cursor, evidence reference, and approved plan reference.
Promotion uses guarded compare-and-swap. Duplicate delivery is idempotent;
late results become observations and cannot overwrite a newer plan. Do not add
a generic jobs table or bypass tenant/actor authorization.

Proof: integration/service tests cover duplicate publication, cancellation,
resume, stale-result races, and settlement/projection evidence.

Status: IMPLEMENTED at the canonical gateway/registry/enqueue boundary with
idempotency and promotion helpers; production worker deployment evidence is
still required.
