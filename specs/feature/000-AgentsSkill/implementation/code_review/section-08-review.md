# Code Review: Section 08 — Security Specialist Agents + README

**Verdict:** APPROVE_WITH_FIXES

## Summary

All critical architectural requirements are met: aggregator pattern correctly enforced in security-review.md, 3-tier threshold documented, auto-approve logging rule present, all 6 anti-patterns in each auditor, domain path isolation correct, README has exactly 17 rows with consistent subagent_type values.

Issues found are MEDIUM or below with one HIGH about an auto-approval edge case.

---

## HIGH Issues

### H1 — Quality Checklist Self-Reference Defect (security-review.md, Section 7)
The checklist item `- [ ] Workflow section begins with "Receive pre-collected findings..."` audits the document structure, not runtime behavior. Quality checklists should be runtime-verifiable.
**Fix:** Replace with `- [ ] No Task tool calls were dispatched during this run — all findings were received via Task Packet CONTEXT`

### H2 — Missing Specialist Report CONDITIONAL Is Auto-Approvable (security-review.md, Section 3)
A missing specialist report (incomplete audit) triggers CONDITIONAL PASS, which is auto-approvable in `auto_by_default` mode. An incomplete security audit should not be silently auto-approved — it means the gate is broken.
**Fix (needs design decision):** Should missing-report CONDITIONAL PASS be excluded from auto-approval?

---

## MEDIUM Issues

### M1 — README Output Format Inconsistency (README.md, registry row for security-review.md)
README shows `PASS/CONDITIONAL PASS/FAIL verdict + risk_register.md` but agent Identity section uses `PASS / CONDITIONAL PASS / FAIL`.
**Fix:** Standardize README to match agent file format.

### M2 — security-trpc.md Quality Checklist Missing Partial-Status Rule
`security-fastapi.md` and `security-frontend.md` both include `- [ ] Result Report is status: partial if any file could not be read`. `security-trpc.md` is missing this item.
**Fix:** Add the item to the security-trpc.md Quality Checklist.

### M3/M4 — AP-T04 and AP-T05 Have No Code Examples (security-trpc.md)
AP-T04 (rate limiting) and AP-T05 (billing auth) are prose-only. All other anti-patterns across all 3 auditors have violation/correct code blocks.
**Fix:** Add code pattern examples for both.

### M5 — MEDIUM Findings Have No Documented Gate Effect (security-review.md)
MEDIUM_COUNT is tracked and reported but never drives any verdict outcome. No explanation is given.
**Fix:** Add note: "MEDIUM findings are informational — they do not affect PASS/CONDITIONAL PASS/FAIL verdict."

---

## LOW / NITPICK

- **N2:** README Maintenance Notes miss `orchestra/decisions.md` as a write target for security-review.md in auto_by_default mode. Fix: expand the exception clause.
- **L2:** README `infrastructure` row uses `Explore / general-purpose` slash notation — ambiguous but matches the plan. Let go.
- **N1:** security-trpc.md workflow has 5 steps vs 7–8 in other auditors. Implied by "check all 6 anti-patterns." Let go.

---

## Verification Against Plan Requirements

| Requirement | Status |
|---|---|
| security-review.md workflow begins "Receive pre-collected findings..." | PASS |
| security-review.md has NO Task dispatch instructions | PASS |
| 3-tier threshold documented | PASS |
| CONDITIONAL auto-approve logging rule present | PASS |
| All auditors have exactly 6 anti-patterns | PASS |
| Domain path isolation in output examples | PASS |
| README has exactly 17 rows | PASS |
| README subagent_type matches agent Identity sections | PASS |
| All 4 agents explicitly state read-only | PASS |
| security-trpc.md Quality Checklist has partial-status item | FAIL (M2) |
| AP-T04 and AP-T05 have code examples | FAIL (M3/M4) |
