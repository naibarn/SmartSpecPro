# Synthesized specification

The system adds a pre-create Draft Quality Control gate to Vertical Drama
creation. A synthesized draft remains transient until the user applies it, but
it cannot be applied or advanced without a server-computed QC result that passes
9.0/10 and has no hard structural contradiction. A bounded explicit override is
available only after the selected improvement budget is exhausted, and only when
the result has no critical fail.

The judge evaluates premise-level quality only: hook, premise/conflict,
repeatable vertical engine, escalation/twist potential, character/emotional
engine, market fit, originality, and season sustainability. It does not judge
shots, dialogue line quality, face continuity, or final video output.

The workflow is skill-first. The new controller skill has separate evaluate and
revise modes, strict JSON schemas, preservation constraints, and prompts that
receive the UI narrative locale separately from the spoken-language profile.
The server normalizes/validates output, computes weighted scores, applies hard
gates, and chooses the best candidate. Model-provided totals are ignored.

Pre-create jobs are owner-scoped, Redis-backed, TTL-bounded, and keyed by a
draft session/request. The job reserves a conservative credit maximum, draws
actual call usage, and refunds unused budget. A create receipt is accepted only
after server-side revalidation against the job owner, expiry, candidate
fingerprint, and pass/override policy. Final audit data is additive under the
existing JSONB bible.

The Create Series wizard shows score, rubric breakdown, round history, current
best candidate, credit estimate/actual, and recovery states. The existing
explicit Apply action remains required after QC. Existing series and old bible
objects without the field remain valid.
