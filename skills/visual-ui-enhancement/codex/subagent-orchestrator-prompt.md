# Codex Subagent Orchestrator Prompt

Use this prompt when the UI task is large enough to benefit from role-based review.

```text
$visual-ui-enhancement

Run this as a Codex subagent workflow.

Target files:
- app/dashboard/page.tsx
- components/dashboard/*

Before spawning subagents, expand globs to exact file paths and create a compact shared
brief: target surface, user task, constraints, exact read/write files, and verification
commands. Do not pass broad globs or raw full files as subagent context.

Goal:
Make the UI premium, modern, responsive, accessible, dark-mode friendly, and production-ready using Tailwind CSS + shadcn/ui.

Spawn subagents:
1. Requirement Analyzer — inspect requirements, target files, constraints, existing conventions, and risks.
2. Visual Direction Agent — choose aesthetic direction, hierarchy, typography, color/token strategy, surface treatment, spacing rhythm, and premium signature.
3. shadcn/Tailwind Builder — propose a safe patch using existing project components, shadcn/ui primitives, semantic tokens, responsive classes, and component states.
4. UX Reviewer — review flow, primary action clarity, information hierarchy, form friction, copy, loading/empty/error states, and recovery paths.
5. Accessibility Reviewer — review semantic HTML, labels, keyboard behavior, focus states, contrast, ARIA, reduced motion, and non-color-only feedback.
6. Responsive Reviewer — review mobile/tablet/desktop behavior, navigation, tables, forms, touch targets, typography scaling, and overflow risks.
7. Final Refactor Agent — synthesize all findings, simplify code, preserve project conventions, and produce the final patch.

Context budget:
- Each read-only agent returns a compact brief: max 600 words, max 6 findings, file:line
  evidence only.
- The builder receives exact files and the compact briefs, not raw full reports.
- The final refactor receives summarized findings and artifact paths, not full transcripts.
- No subagent may paste full diffs, full files, screenshots, traces, logs, or test output.

Wait for the subagent findings before making final edits.
Before editing, summarize the plan.
After editing, run available lint/typecheck/test commands and report results.
```
