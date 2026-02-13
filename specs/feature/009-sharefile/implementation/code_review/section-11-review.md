# Code Review: Section 11 - Security Tests

## HIGH Severity Issues

### H1: Missing tenant isolation tests (2 of 5)
- Missing: "user from tenant A cannot add user from tenant B to their group" (explicit cross-tenant member add)
- Missing: "public group search only returns groups from user's tenant"

### H2: Missing permission hierarchy merge test
Plan requires testing multi-source permission merge (direct: read + group: write → effective: write). Not tested.

### H3: Missing "members can leave" and "owner cannot leave" authorization tests

### H4: No audit logging tests (only todo stubs)

### H5: Integration tests all todo stubs (require real DB — not available in project)

## MEDIUM Severity Issues

### M1: Weak error assertions — `.rejects.toThrow(TRPCError)` without checking error code
### M2: Tests in services/ not routers/ — but project has no tRPC createCaller test infrastructure
### M3: No permission expiration placeholder test

## ASSESSMENT

35 passing tests cover service-layer security logic well. Integration tests and audit logging require infrastructure not present in the project (no test DB, no createCaller setup). These should be deferred or implemented when infrastructure is available.
