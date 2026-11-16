# Section 02 — Core APIs/contracts

## Deliverable

After an authenticated producer/read source exists, add versioned authenticated reads for workspace Harness catalog, Harness executions, Mission executions, exact Job/Run/Attempt execution, and ordered events/freshness. Keep DTO identity fields nullable where canonical sources do not supply them. Do not return a hardcoded empty list as a functioning catalog, and do not ship an API that has no authenticated backing registration source.

## Scope

`packages/saas-contracts`, `apps/saas-core/src/chat`, `apps/saas-core/src/identity/authRoutes.ts`, and focused tests. No unauthenticated endpoint and no API-triggered mutation.

## Prerequisites / checks

Every route authenticates the current Core session and workspace membership. Every Harness/Job/Run/Attempt/Mission relationship is checked by the DB projection and revalidated before response. Pagination/cursors are bounded and ordered. Cross-workspace IDs fail closed without revealing existence.

## Known gap

No current source supplies validated Harness registration identities or exact external Job-to-Mission bindings. Runtime discovery and owner browser UAT are independent from mocked route contract tests. See `../traceability.md` for the producer contract needed to resume implementation.
