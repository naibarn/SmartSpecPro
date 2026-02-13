# Code Review Interview: Section 11 - Security Tests

## Triage Summary

| Finding | Severity | Decision | Rationale |
|---------|----------|----------|-----------|
| H1: Wrong file location (services/ vs routers/) | HIGH | Let go | Project has no tRPC createCaller test infrastructure; all existing tests use mocked DB pattern |
| H2: Missing integration test files | HIGH | Let go | Requires real DB test infrastructure not present in project; kept as todo stubs |
| H3: Missing permission hierarchy merge test | HIGH | **Auto-fix** | Added getUserEffectivePermission test with direct:read + group:write → effective:write |
| H4: Missing leave/owner-leave tests | HIGH | **Auto-fix** | Added member self-removal and owner-cannot-leave tests |
| H5: No audit logging tests | HIGH | Let go | Audit logging not implemented for ShareFile operations yet; deferred |
| M1: Weak error assertions | MEDIUM | Let go | TRPCError check is sufficient; code is tested |
| M2: Inconsistent tenant ID types | MEDIUM | Let go | normalizeLibraryTenantId handles both; matches production pattern |

## Auto-Fixes Applied

### H3: Permission hierarchy merge test
Added 2 tests to `getUserEffectivePermission`:
- Returns highest level ("write") when user has direct:read and group:write
- Returns null when item not found (cross-tenant defense-in-depth)

### H4: Leave group authorization tests
Added 2 tests to `removeGroupMember (self-removal / leave)`:
- Allows member to leave group voluntarily (self-removal skips admin check)
- Throws BAD_REQUEST when owner tries to leave

## Deferred Items
- Integration tests with real DB (11 todo stubs) — requires test DB infrastructure
- Audit logging tests — audit logging not implemented for ShareFile yet
- Router-level tests with createCaller — no existing pattern in project

## Interview Decisions (Auto-Approved)
User auto-approved all decisions: "auto approve ทุกคำถามไปจนจบ"
