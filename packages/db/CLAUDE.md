# @smartspec/db

Database schema types and adapter layer shared across the monorepo.

## Structure

```
packages/db/
├── src/
│   └── index.ts       # Package entry point (schema re-exports, adapters)
└── package.json
```

## Usage

```typescript
import { PostgresAdapter } from "@smartspec/db";
```

## Notes

- The actual Drizzle schema definitions live in `apps/web/drizzle/schema.ts`
- This package provides **shared types and adapters** consumed by other packages
- Depends on `@smartspec/shared` for shared type definitions
- Changes to DB types may require updates in both Node.js and Python backends
