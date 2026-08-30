# Decision log

- Chosen architecture: central skill settlement service with explicit integrations (approved approach B).
- Pricing model: two integer columns, tenant share and skill-owner share; user charge is their sum.
- Default: 2 tenant / 0 skill owner.
- Owner resolution: tenant `ownerId` and skill `createdBy`; no invented fallback.
- Same-recipient split: one credit grant transaction.
- Refund: idempotent reverse settlement; recipient balances may become negative during reversal.
- Planning depth: standard; schema, billing, router, UI, and tests cross multiple domains.
- SocratiCode fallback recorded because MCP tools were unavailable.
