# Orchestra Decision Log

**Managed by:** Orchestra conductor (SKILL.md) and `ssp-security-review`
**Purpose:** Historical record of security gate verdicts and conductor decisions

---

## Format

### Security Gate Decisions

```
## YYYY-MM-DD — Pre-merge gate for [feature/branch]

**Verdict:** PASS | CONDITIONAL PASS | FAIL
**Gate runner:** ssp-security-review
**Specialist reports received:** [T|F|FE] (3 = all, 2 = missing one, etc.)

### Findings Summary
- CRITICAL: N
- HIGH: N
- MEDIUM: N
- LOW: N

### Decision
[Why PASS/FAIL. For CONDITIONAL PASS: user approval note.]

### Risk Register snapshot
See `risk_register.md` at commit [sha]
```

### Conductor Decisions

```
## YYYY-MM-DD — [Decision topic]

**Context:** [what triggered this decision]
**Options considered:** [A / B / C]
**Decision:** [chosen option]
**Rationale:** [why]
```

---

_Entries are appended chronologically. Never delete entries — they serve as audit trail._
