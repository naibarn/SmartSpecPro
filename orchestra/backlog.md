# Orchestra Backlog

## Safely Deferred

- Authenticated dashboard screenshot pass: skipped because this session did not have a reusable login cookie/credential. Residual risk: medium for purely visual overlap issues that only a real authenticated browser can catch.
- Repository-wide web typecheck cleanup: `npm run check` currently fails on unrelated pre-existing files:
  - `client/src/components/presentation/PresentationArticleGeneratorDialog.tsx(8533,30): Cannot find name 'CSSProperties'.`
  - `server/test_db.ts(1,23): Cannot find module './db/index.js' or its corresponding type declarations.`
