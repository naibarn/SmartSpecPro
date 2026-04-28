# shadcn/ui + Tailwind Guidelines

## Use shadcn primitives first

Prefer project-owned components in `components/ui` before building custom controls.

Common components:

- `Button`
- `Card`
- `Dialog`
- `Sheet`
- `Tabs`
- `Table`
- `Form`
- `Input`
- `Select`
- `Badge`
- `Avatar`
- `DropdownMenu`
- `Tooltip`
- `Alert`
- `Skeleton`

## Tailwind class quality

- Use semantic tokens.
- Avoid raw color classes in component code.
- Use responsive classes intentionally.
- Use `cn()` for conditionals.
- Extract repeated class patterns.
- Avoid huge unstructured class strings when a component should be split.

## Dependency rule

Do not add new UI libraries unless the repo already uses them or the user explicitly approves.
