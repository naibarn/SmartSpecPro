# Section 02 review

- Inventory sync is tenant/worker authenticated, idempotent, revision-checked,
  and tombstones removed entries.
- ACL requires owner-created same-tenant Groups and protects server-owned policy
  from heartbeat overwrite.
- Migration SQL and journal entry are present; live DB execution remains unverified.
