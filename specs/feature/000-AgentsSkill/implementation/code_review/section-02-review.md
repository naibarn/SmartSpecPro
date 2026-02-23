# Code Review: section-02-task-analysis-routing

## Summary

Solid implementation with all 5 scope levels, 4 risk levels, 5 routes, and 3 decision modes. Several concrete gaps need fixing.

## Findings

### HIGH — `small` scope rule permits medium-risk tasks (plan says low risk only)

`task-analysis.md` line 64: "File count 1–3 AND single domain AND **low-or-medium risk**"

Section plan specifies: "File count 1–3 AND single domain AND **low risk**". Allowing medium-risk items as `small` means a medium-risk single-file change could be dispatched as `single-agent` without the deeper scrutiny warranted. **Auto-fix: change to "low risk" only.**

### HIGH — `bug_route` field missing from classification output format template

The format template block is missing `- Bug route: [true|false]`. The filled example shows it, but not the canonical template conductors will copy. **Auto-fix: add to template.**

### MEDIUM — direct-edit example reuses Login.tsx (same file as trivial scope example)

`routing-decision.md` line 41 uses Login.tsx for direct-edit. task-analysis.md also uses Login.tsx as the canonical trivial scope example. The plan's direct-edit example explicitly uses `apps/web/README.md` to avoid this overlap. **Auto-fix: change to README.md.**

### MEDIUM — Decision-mode artifact example has hardcoded values instead of placeholders

Lines 216-219 show a literal timestamp (`2026-02-22T19:30:00Z`) and literal mode (`smart_auto`) instead of `[chosen-mode]` / `[ISO timestamp]` placeholders. **Auto-fix: replace with placeholders.**

### MEDIUM — Quick reference table: 3-file example for medium scope contradicts scope table (4-10 files)

Line 247: "New tRPC router + React page + shared schema (3 files) | medium". But scope table says medium = file count 4–10. A 3-file scenario is `small` by count. The plan's intent was that two-domain inter-dependency is the actual trigger. **Auto-fix: annotate the example to note the inter-dependency override, or change to 5-file example.**

### LOW — No explicit Node.js/tRPC traceback branch in bug sub-tree

Only Python tracebacks are called out explicitly. Node.js errors fall through to the `file known` branch which dispatches ssp-debugger — correct but not explicit. **Let go** — plan doesn't carve this out either; implicit path is acceptable.

### LOW — Forward reference to task-packet-format.md

`routing-decision.md` line 54 references task-packet-format.md. This file was created in section 01 and already exists. **Not an issue** — reviewer incorrectly attributed it to section 03.

### LOW — task-analysis.md line count at 142 (spec: 150-250)

Symptom of the missing bug_route field. Will be addressed by HIGH fix #2. **Resolved by fix.**
