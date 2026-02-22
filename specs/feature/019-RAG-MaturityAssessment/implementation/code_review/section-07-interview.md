# Section 07 Code Review Interview

## Triage Decisions

| ID | Severity | Decision | Rationale |
|----|----------|----------|-----------|
| H1 | HIGH | Auto-fix | Sanitize error — return generic message, keep details in log only |
| H2 | HIGH | Auto-fix | Add enterprise plan → strict default per section plan spec |
| H3 | HIGH | Auto-fix | Remove unused `import time` |
| M1 | MEDIUM | Auto-fix | Include citations list in response dict |
| M2 | MEDIUM | Let go | Currently safe — guardrails don't need DB access |
| M3 | MEDIUM | Auto-fix | Add max query length validation (10000 chars) |
| M4 | MEDIUM | Auto-fix | Add configurable chunk limit (default 10000) |
| M5 | MEDIUM | Let go | Works for current tests, refactoring is out of scope |
| M6 | MEDIUM | Let go | False positive — scope_engine.py not in our staged files |
| L1-L6 | LOW | Let go | Minor, not blocking |

## Applied Fixes

### H1: Sanitize error response
- Replace `_failed_response(error=str(exc))` with generic message
- Keep `str(exc)` only in the structured log

### H2: Enterprise default strict
- Check `tenant_row.plan.value == "enterprise"` → default to "strict"
- Otherwise default to "permissive"

### H3: Remove dead import
- Remove `import time`

### M1: Include citations in response
- Add `citations` to the response dict

### M3: Query length validation
- Reject empty queries and queries > 10000 chars

### M4: Chunk loading limit
- Add MAX_CHUNKS = 10000 constant
- Limit query with `.limit(MAX_CHUNKS)`
- Log warning when limit is hit
