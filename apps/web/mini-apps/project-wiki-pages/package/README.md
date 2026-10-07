# Project Wiki Pages Mini App

Project Wiki Pages is the second Mini App Factory reference app. It provides project-scoped page listing, reading, creation, editing, and archiving through the host's authenticated App route and tRPC API.

The host checks tenant identity, active project membership, the project's App binding, and the caller's role on every operation. Viewers can read; editors and owners can write. Page paths are normalized and unique among active pages in a project. Content is limited to 256 KiB and stored with a SHA-256 digest.

## Runtime implementation

- UI: `apps/web/client/src/pages/ProjectWikiPagesPage.tsx`
- Authenticated route selection: `apps/web/client/src/pages/MiniAppRoute.tsx`
- API: `apps/web/server/routers/projectWikiPages.ts`
- Authorization and persistence: `apps/web/server/services/projectWikiPagesService.ts`
- Required schema migration: `apps/web/drizzle/0394_project_wiki_pages_mini_app.sql`

The Mini App does not introduce a separate tenant, project, queue, or authorization authority. It does not include search, RAG, sync, import/export, AI, or provider integration.

## Package build

Build with the shared app-neutral SPAAS package builder:

```sh
pnpm --filter @smartspec/web exec tsx scripts/build-mini-app-package.ts \
  --package-root apps/web/mini-apps/project-wiki-pages/package \
  --output-dir apps/web/.artifacts/project-wiki-pages
```

The package contains the manifest, UI binding, action schemas, and this README. A successful package build proves packaging only; it does not prove deployment, runtime readiness, or UAT.

## Focused validation

```sh
pnpm --filter @smartspec/web exec vitest run \
  server/services/projectWikiPagesService.test.ts \
  server/routers/projectWikiPages.test.ts \
  client/src/pages/__tests__/ProjectWikiPagesPage.test.tsx
```

The migration was also applied to a disposable PostgreSQL 17 database using a synthetic prerequisite baseline, and its page constraints were checked. This is not evidence that the complete historical migration chain or a deployed runtime is ready.

Deployment and authenticated UAT remain separate Factory stages.
