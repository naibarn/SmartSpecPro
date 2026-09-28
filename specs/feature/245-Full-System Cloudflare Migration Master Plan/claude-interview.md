# Deep Plan Interview — Spec 245

No new interview question is needed. The product owner has already clarified the material business constraints in this conversation.

## Q1 — Migration goal and deadline

**Question:** What outcome and deadline define success?

**Answer:** Move all systems to Cloudflare completely, targeting 2026-09-30. Prioritize urgent execution and real-platform testing; do not stop after producing a document.

## Q2 — Beta availability and workload pause

**Question:** Can service/task processing pause during migration?

**Answer:** There are two real beta users, and work can stop during the migration. There is no business-critical backlog requiring zero-downtime operation.

## Q3 — Redis observation wait

**Question:** Must Redis retirement wait 14–30 days after migration?

**Answer:** No. Remove that calendar wait. Move to the new platform first, then fix ordinary bugs found there.

## Auto-decisions

- Use controlled maintenance windows; preserve canonical records and never blindly replay provider operations with unknown outcomes.
- Remove only the fixed Redis retirement timer. Keep fast acceptance checks for tenant isolation, auth, financial effects, job ownership, bindings, and recovery.
- Use KV for disposable/read-heavy cache. Do not use it as session revocation authority, exact global counter, or lock.
- Use DO only where an inventoried workload needs serialized per-entity coordination or realtime connection state.
- Continue independent local work while target-account evidence is pending. Do not fabricate target proof or call local readiness production readiness.
