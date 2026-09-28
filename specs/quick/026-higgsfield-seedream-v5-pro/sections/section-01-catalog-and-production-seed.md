# Section 01: Catalog and Production Seed

## Ownership

- `apps/web/scripts/seed-media-models-mcp-providers.ts`
- `apps/web/scripts/__tests__/seed-media-models-mcp-providers.test.ts`

## Work

- Add and export the Higgsfield catalog inventory.
- Define the Seedream 5.0 Pro MCP image row using native id `seedream_v5_pro`.
- Add a regression assertion for identity, image type, and routing metadata.
- Execute the seed explicitly against production and verify the saved row.

## Checks

- Focused Vitest test passes.
- TypeScript check passes.
- Dry run lists the new model.
- Production query returns the enabled row.
