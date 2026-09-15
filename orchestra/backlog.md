# Orchestra Backlog

## Blocked external gates

- Target-account Cloudflare binding and capability probes.
- Hyperdrive connectivity, cache behavior, ACL/TLS, and pool-capacity proof.
- Deployment restart and rollback evidence.
- Provider restart/lost-response recovery and PostgreSQL backup/PITR rehearsal.
- Vectorize target index schema, negative tenant tests, mutation recovery, and rebuild/checkpoint evidence.
- Legacy queue drain and domain projection/checkpoint acceptance.

These are explicitly blocked by external account/deployment state and are not
safe to replace with local mocks.
