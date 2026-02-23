# Risk Register

**Managed by:** `ssp-security-review` (aggregator agent)
**Written during:** Pre-merge security gate

---

## Format

```
| ID   | Severity | Source Agent          | File:Line | Anti-Pattern | Description | Recommended Fix | Status |
|------|----------|-----------------------|-----------|--------------|-------------|-----------------|--------|
| T001 | HIGH     | ssp-security-trpc     | ...       | ...          | ...         | ...             | OPEN   |
| F001 | CRITICAL | ssp-security-fastapi  | ...       | ...          | ...         | ...             | OPEN   |
| FE01 | HIGH     | ssp-security-frontend | ...       | ...          | ...         | ...             | OPEN   |
```

**Severity:** CRITICAL / HIGH / MEDIUM / LOW
**Status:** OPEN | ACKNOWLEDGED | FIXED | WONT-FIX

---

## Gate Threshold

| Result | Condition |
|--------|-----------|
| PASS | 0 CRITICAL + 0 HIGH findings |
| CONDITIONAL PASS | 0 CRITICAL + N HIGH findings (requires user approval) |
| FAIL | Any CRITICAL finding (blocks merge) |

---

_This file is overwritten on each security gate run. See `decisions.md` for historical gate verdicts._
