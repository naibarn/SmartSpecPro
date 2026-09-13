# Orchestra Backlog

- Live Kie/provider verification is deferred until an explicitly authorized,
  non-production test with safe credentials and no paid generation is available.
- Production deployment/restart/browser proof is outside this local repair wave.
- Existing baseline failures remain separately tracked: `apps/web/server/services/mediaGenerationService.test.ts` reports 7/52 failures, repository-wide `npm run check` reports unrelated TypeScript errors, and full legacy Ruff is noisy. These are not justification to weaken Kie attachment validation or tenant-scoped media access.
- Follow-up owner: run the exact media-service baseline suite and repository typecheck in the normal project CI/runtime, then triage those unrelated failures independently from the Kie attachment boundary.
