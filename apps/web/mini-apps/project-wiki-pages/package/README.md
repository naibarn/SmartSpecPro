# Project Wiki Pages Mini App

This is the second app-neutral package input for the Mini App Factory. Its scoped product slice is project page CRUD with tenant, project membership, and App binding enforced by the host. It excludes search, RAG, sync, import/export, AI, and provider integration.

Build it with the same generic SPAAS package builder used by Research Notes:

```sh
pnpm --filter @smartspec/web exec tsx scripts/build-mini-app-package.ts \
  --package-root apps/web/mini-apps/project-wiki-pages/package \
  --output-dir apps/web/.artifacts/project-wiki-pages
```

The current checkpoint validates the app contract and deterministic package path. Runtime implementation, generated tests, deployment, and UAT remain separate Factory stages and are not claimed by this descriptor.
