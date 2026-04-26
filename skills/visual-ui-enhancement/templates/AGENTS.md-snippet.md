# UI Agent Guidance

For UI redesign, Tailwind CSS, shadcn/ui, dashboard, form, landing page, or accessibility tasks, use the `visual-ui-enhancement` skill.

## UI rules

- Prefer existing `components/ui` shadcn primitives before creating custom controls.
- Use semantic tokens such as `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, and `bg-primary`.
- Avoid raw one-off colors in component code unless editing theme tokens.
- Support dark mode where the project supports it.
- Include loading, empty, error, disabled, hover, active, selected, and focus states where relevant.
- Make layouts responsive for mobile, tablet, and desktop.
- Preserve existing route behavior and public component APIs unless explicitly asked to change them.
- Run available lint/typecheck/test commands after edits when practical.

## Codex invocation

```text
$visual-ui-enhancement
```
