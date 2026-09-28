# Gap review round 2 — ownership, CAS, and stale fences

Scope checked: prompt apply, snapshot persistence, story admission, episode B-roll mutations, and tenant/user predicates.

Closed gaps:

- Prompt apply rejects a changed original hash or preview revision.
- Snapshot identity is immutable and run validation rejects a changed revision/fingerprint.
- Source-pack and episode procedures load owner-scoped rows before writing.
- B-roll bindings use a dedicated table and never write the image-only shot-reference table.
- Repeated preview/bind requests are idempotent where the owning ledger has an identity key.

Evidence: integration tests cover stale snapshot, correction, exact footage, and ownership boundaries; router code uses `requireTenantId` plus owner loaders.

Result: PASS — no cross-tenant or stale-write gap found in this round.
