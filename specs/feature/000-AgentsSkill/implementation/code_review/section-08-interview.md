# Code Review Interview: Section 08

## Review Verdict: APPROVE_WITH_FIXES

## Interview Question

**H2 — Should missing-report CONDITIONAL PASS be auto-approvable in auto_by_default mode?**

Decision: **Always require user approval** — a missing specialist report means the audit is incomplete, and an incomplete gate should never auto-approve regardless of decision mode.

---

## Fixes Applied

### H1 — Quality Checklist self-reference (security-review.md) — AUTO-FIX
Replaced `- [ ] Workflow section begins with "Receive pre-collected findings from..."` with the runtime-verifiable: `- [ ] No Task tool calls were dispatched during this run — all findings were received via Task Packet CONTEXT`

### H2 — Missing specialist report not auto-approvable (security-review.md) — USER DECISION: Always require user approval
Added to Constraints: "A CONDITIONAL PASS caused by a missing specialist report is **never eligible for auto-approval** in `auto_by_default` mode — it must always escalate to explicit user review regardless of decision mode."
Added same note to Error Handling section.

### M1 — README Output Format standardization (README.md) — AUTO-FIX
Already correct in the file (`PASS/CONDITIONAL PASS/FAIL verdict + risk_register.md`). No change needed.

### M2 — security-trpc.md Quality Checklist partial-status item — VERIFIED PRESENT
The item `- [ ] Result Report is status: partial if any file in scope could not be read` was already present at line 211. No change needed.

### M3/M4 — AP-T04 and AP-T05 code examples (security-trpc.md) — AUTO-FIX
Added `// VIOLATION` + `// CORRECT` TypeScript code blocks for both AP-T04 (rate limiting) and AP-T05 (billing auth ownership check).

### M5 — MEDIUM findings have no gate effect (security-review.md) — AUTO-FIX
Added to threshold policy note: "MEDIUM findings are **informational only** — they are reported in the risk register but do not affect the verdict."

### N2 — README maintenance notes missing decisions.md (README.md) — AUTO-FIX
Updated the Maintenance Notes exception clause to include `orchestra/decisions.md` as a valid write target for security-review.md.

---

## Items Let Go

- **L2:** README `infrastructure` row `Explore / general-purpose` slash — matches the plan, accepted.
- **N1:** security-trpc.md workflow has 5 steps vs 7–8 — "check all 6 anti-patterns" implies the same coverage, accepted.
- **L3:** AP-FE03 severity in security-frontend.md already resolves the ambiguity correctly in Section 4.
