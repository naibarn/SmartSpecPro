# Claude Code UI Guidance

For UI redesign, Tailwind CSS, shadcn/ui, dashboard, form, landing page, accessibility, responsive QA, or visual polish tasks, use:

```text
/visual-ui-enhancement
```

## UI rules

- Prefer existing `components/ui` shadcn primitives.
- Use semantic design tokens instead of raw color classes.
- Keep dark mode, responsive behavior, and accessibility in scope.
- Include loading, empty, error, disabled, hover, active, selected, and focus states where relevant.
- Preserve existing behavior unless the task explicitly asks for changes.
- Run available lint/typecheck/test commands after edits when practical.

## Optional subagents

For large UI work, use the installed visual UI subagents if available:

- `visual-ui-requirement-analyzer`
- `visual-ui-direction-agent`
- `shadcn-tailwind-builder`
- `visual-ux-reviewer`
- `visual-accessibility-reviewer`
- `visual-responsive-reviewer`
- `visual-final-refactor-agent`
