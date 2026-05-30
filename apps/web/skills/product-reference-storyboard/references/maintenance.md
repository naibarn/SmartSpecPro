# Maintenance

Shared storyboard, cinematic, face, text, and product-reference rules live in `SKILL.md`.

Product-specific rules live in `references/product-categories/*.md`. Add new categories there and update `product_category` enum in `schemas/input.schema.json` plus client detection in `apps/web/client/src/lib/productionReferenceStoryboard.ts`.

Legacy category skills are intentionally disabled from Media Studio Production selection; keep them only for backwards compatibility unless a migration removes them.
