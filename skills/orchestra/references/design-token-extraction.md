# Design Token Extraction

Use this reference before changing visual UI in an existing product surface. The goal is to
preserve the product's visual vocabulary before adding polish.

## Source Priority

1. Existing code tokens and components
2. Existing product pages or screenshots supplied by the user
3. Figma/design-system docs if explicitly provided
4. Industry defaults only when no local reference exists

## Extraction Checklist

Record findings in the UI Enhancement Brief or section file:

| Token area | What to capture |
|---|---|
| Color | semantic tokens, neutral scale, accent usage, status colors, dark-mode mappings |
| Typography | font family, heading/body/label/caption scale, line height, weight |
| Spacing | section padding, component padding, grid gaps, control height |
| Radius | button/input/card/modal radius patterns |
| Elevation | border strategy, shadows, overlays, focus rings |
| Motion | duration, easing, interaction triggers, reduced-motion behavior |
| Components | existing shadcn/Radix/local primitives and variants |
| Density | sparse, balanced, or dense operational layout expectations |

## Output Format

```markdown
## Design Token Extraction

Sources:
- /absolute/path/to/component.tsx
- /absolute/path/to/theme.css

Token summary:
- Color:
- Typography:
- Spacing:
- Radius:
- Elevation:
- Motion:
- Component primitives:
- Density:

Do not change:
- [patterns that must remain stable]
```

## Rule

Prefer semantic tokens and existing primitives. If a new token or variant is needed, explain
why the existing system cannot represent the intended UI.
