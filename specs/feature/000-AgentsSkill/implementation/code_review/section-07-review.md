# Code Review — Section 07: General Subagent Agents

**Verdict: REQUEST_CHANGES**

---

## HIGH Severity

None found.

---

## MEDIUM Severity

### 1. `research.md` — Missing `CONTRACT` field in Input Contract table

The spec's TDD validation requires every agent's Input Contract table to reference all 8 task-packet fields: TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, **CONTRACT**, OUTPUT, QUALITY GATE. `research.md` has only 7 rows — `CONTRACT` is absent. All other 12 agent files include it. Even though research is read-only and CONTRACT is logically N/A, the correct pattern (as used by `error-detective.md` and `debugger.md`) is to include the field with value "N/A".

**Fix:** Add `CONTRACT | N/A — research does not implement contracts, only analyzes them` row to the Input Contract table in research.md.

---

### 2. `error-detective.md` — Extra section breaks the 8-section template

The file has 9 numbered sections instead of the required 8. Section `## 6. Known SmartSpecPro Audit Log Schema` is inserted between Output Contract and Workflow, pushing: Workflow to ## 7, Quality Checklist to ## 8, Error Handling to ## 9. The spec TDD check explicitly validates "each file contains all 8 section headings." Any tooling parsing by section number will misread this file.

**Fix:** Merge the "Known Audit Log Schema" content into Section 2 (Capabilities) or Section 5 (Output Contract), then renumber 7→6, 8→7, 9→8.

---

### 3. `infrastructure.md` — Same section-numbering defect as error-detective.md

`infrastructure.md` inserts `## 3. SmartSpecPro Service Map` between Capabilities and Constraints, pushing Error Handling to `## 9` instead of `## 8`.

**Fix:** Move Service Map content into Section 2 (Capabilities) or Section 4 (Input Contract), then renumber sections 4→3 through 9→8.

---

## LOW Severity

### 4. `docs-release.md` — Secrets prohibition only in Quality Checklist, not as a hard Constraint

The Quality Checklist includes "No secrets or environment variable values appear in any documentation" but the Constraints section doesn't include a `**Must NOT**` rule for this. Other agents (e.g., python.md) encode sensitive-data rules as hard Constraints, not just checklist items.

### 5. `debugger.md` — Full test suite constraint only mentions `pnpm test`, not `pytest`

The Constraints section hard rules cite only `cd apps/web && pnpm test`. For Python-side bugs the `cd python-backend && pytest` command applies. The Workflow section does mention both, but the Constraints section is the canonical enforcement point.

### 6. `test-qa.md` — Constraint narrower than spec intent

Spec says "Must not mock network calls in integration tests" (broader). Implementation says "Must NOT mock the database in integration tests" (narrower, missing external HTTP call mocking restriction).

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | MEDIUM | research.md | Missing CONTRACT row in Input Contract (7 of 8 fields) |
| 2 | MEDIUM | error-detective.md | 9 sections instead of 8; structural template violation |
| 3 | MEDIUM | infrastructure.md | 9 sections instead of 8; structural template violation |
| 4 | LOW | docs-release.md | Secrets prohibition only in checklist, not Constraints |
| 5 | LOW | debugger.md | `pytest` missing from Constraints hard rule for test suite |
| 6 | LOW | test-qa.md | "Mock database" narrower than spec's "mock network calls" |
