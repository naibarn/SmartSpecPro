# Claude Code Subagents

This package includes optional subagent templates in `claude-code/agents/`.

Install them into a project with:

```bash
mkdir -p .claude/agents
cp .claude/skills/visual-ui-enhancement/claude-code/agents/*.md .claude/agents/
```

Use them for large or subjective UI work. They are not required for the main `/visual-ui-enhancement` skill.

## Recommended workflow

```text
/visual-ui-enhancement app/dashboard/page.tsx

Use the installed visual UI subagents for requirement analysis, visual direction, shadcn/Tailwind building, UX review, accessibility review, responsive review, and final refactor.
```

## Agent responsibilities

1. `visual-ui-requirement-analyzer` — requirements, files, constraints, risks.
2. `visual-ui-direction-agent` — aesthetic direction, hierarchy, typography, colors, surfaces.
3. `shadcn-tailwind-builder` — implementation strategy and patch suggestions.
4. `visual-ux-reviewer` — usability, flow, states, copy, recovery.
5. `visual-accessibility-reviewer` — semantic HTML, focus, keyboard, labels, contrast, ARIA.
6. `visual-responsive-reviewer` — mobile/tablet/desktop, navigation, tables, forms, overflow.
7. `visual-final-refactor-agent` — consolidate and simplify final output.
