# Code Review Interview: section-02-task-analysis-routing

## Triage Summary

| Finding | Severity | Action |
|---------|----------|--------|
| `small` scope permits medium-risk tasks (plan says low only) | HIGH | Auto-fix: change to "low risk" only |
| `bug_route` field missing from format template | HIGH | Auto-fix: add to template block |
| direct-edit example reuses Login.tsx (same as trivial example) | MEDIUM | Auto-fix: change to apps/web/README.md |
| Decision-mode artifact example has hardcoded values | MEDIUM | Auto-fix: replace with placeholders |
| Quick-ref table 3-file medium example contradicts scope table | MEDIUM | Auto-fix: annotate two-domain override |
| No explicit Node.js traceback branch | LOW | Let go |
| Forward ref to task-packet-format.md (section 01 file, not 03) | LOW | Not an issue — file exists |

## Auto-Fixes Applied (No User Interview Needed)

All findings are clear, low-risk corrections with no tradeoffs requiring user input.

### Fix 1: Change `small` scope rule to "low risk" only
**Rationale:** Matches the plan specification exactly. Medium-risk single-file changes should stay in `small` route per the risk escalation rules anyway; this tightens the scope table.

### Fix 2: Add `bug_route: [true|false]` to format template
**Rationale:** The format template is the canonical artifact; the filled example alone is insufficient.

### Fix 3: Change direct-edit route example to apps/web/README.md
**Rationale:** Avoids Login.tsx appearing as the canonical example for both `trivial` scope AND `direct-edit` route.

### Fix 4: Replace hardcoded decision-mode artifact example with placeholders
**Rationale:** Prevents conductor from copying a literal timestamp into the artifact.

### Fix 5: Annotate the quick-reference table medium example with the two-domain trigger note
**Rationale:** Makes explicit that two-domain inter-dependency overrides file count for medium classification.
