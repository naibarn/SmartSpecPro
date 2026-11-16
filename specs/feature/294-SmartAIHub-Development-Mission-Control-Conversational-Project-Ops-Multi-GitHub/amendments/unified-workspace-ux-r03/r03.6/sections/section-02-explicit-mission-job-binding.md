# Section 02 — Explicit Mission/Job Binding

Add a narrow append-only Mission-to-Job association. Accept a Mission only as an explicit admission input; atomically validate actor, environment tenant, workspace, conversation, Mission and canonical Job. Preserve Mission-less Jobs as null. Update the existing Mission and Harness execution read projections to use only the association; do not rewrite migration 0442 or infer old relationships. Cover mismatches, idempotency, authorization and projection behavior.
