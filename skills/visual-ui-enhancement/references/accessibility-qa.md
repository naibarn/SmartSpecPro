# Accessibility QA

## Minimum standard

- Use semantic landmarks: `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`.
- Maintain heading order.
- Ensure all controls are keyboard reachable.
- Provide visible `focus-visible` states.
- Use labels for every form field.
- Add accessible names to icon-only buttons.
- Avoid color-only status communication.
- Respect reduced motion for decorative animations.
- Keep contrast at least 4.5:1 for normal text and 3:1 for large text/UI components.

## shadcn/ui notes

- Prefer native semantics already provided by shadcn/Radix components.
- Use `aria-label` only when visible text is absent.
- Do not add ARIA that conflicts with native semantics.
- Confirm dialogs and sheets trap focus and restore focus when closed.
