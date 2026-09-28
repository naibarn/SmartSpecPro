# Request

Ensure Media Studio keeps every aspect-ratio representation synchronized so a
visible `9:16` selection cannot be overridden by a hidden `16:9` skill default.

## Constraints

- Preserve Veo storyboard-specific ratio reconciliation.
- Cover initial generation and retry generation.
- Add no dependency or database migration.
- Keep Kie.ai routing, pricing, and supported ratio lists unchanged.
