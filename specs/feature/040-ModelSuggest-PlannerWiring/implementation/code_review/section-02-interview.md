# Section 02 Code Review Interview

## Auto-fixes Applied

### Fix 1: Split missing-header test into two cases
**Finding:** "missing header" test used empty string, not truly absent header.
**Action:** Renamed test to "empty string", added separate "absent (undefined)" test.
**Rationale:** Both code paths (!token guard catches both) but semantics differ — now both explicitly tested.

## Let Go

### Finding: ENV mock mutation fragility
**Decision:** vi.mock creates mutable objects by design. The mutation is captured at call time by `ENV.webGatewayToken`. Working correctly.

### Finding: Length-oracle test doesn't structurally prove absence of try-catch
**Decision:** Plan-acknowledged gap. Observable behavior test is sufficient for this MVP.

### Finding: ENV import only used for one test
**Decision:** No lint errors; import is necessary for the test.
