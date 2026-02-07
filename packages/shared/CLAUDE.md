# @smartspec/shared

Shared constants, types, and utilities used across all packages and apps in the monorepo.

## Structure

```
packages/shared/
├── src/
│   ├── index.ts              # Package entry point
│   └── constants/
│       └── menu.ts           # Navigation menu definitions
└── package.json
```

## Usage

```typescript
import { MENU_ITEMS } from "@smartspec/shared";
```

## Guidelines

- This package must have **zero runtime dependencies** (only `typescript` as devDep)
- Only export pure types, constants, and utility functions
- Changes here affect all consumers — test thoroughly
- Keep the API surface small and well-documented
