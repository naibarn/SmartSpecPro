# Design Tokens

Prefer shadcn-compatible semantic tokens in component code:

- `bg-background`
- `text-foreground`
- `bg-card`
- `text-card-foreground`
- `text-muted-foreground`
- `border-border`
- `bg-primary`
- `text-primary-foreground`
- `bg-secondary`
- `bg-accent`
- `text-destructive`
- `ring-ring`

Avoid raw color classes in component implementations unless explicitly designing theme primitives.

## Radius

Use a small set of radii consistently:

- `rounded-lg` for compact controls.
- `rounded-xl` for grouped panels.
- `rounded-2xl` for premium cards and feature panels.

## Elevation

Use restrained shadows:

- `shadow-sm` for subtle card separation.
- `shadow-md` only for floating or interactive surfaces.
- Prefer borders and surface contrast over heavy shadows.
