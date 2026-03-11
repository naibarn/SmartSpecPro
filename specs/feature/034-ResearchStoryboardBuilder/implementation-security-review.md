# Implementation Security Review

## medium

- file/path: `python-backend/app/services/agency_service.py`, `apps/web/server/services/agencyExperienceTemplateService.ts`, `apps/web/server/routers/agency.ts`
  risk: Retrieval scope now filters direct external retrieval tools during Python tool resolution for `library_only` runs, but enforcement is still incomplete for indirect external access paths. Tool-capable runs could still bypass the intended boundary through future tool additions or tool types that are not yet mapped into the retrieval-scope policy.
  recommended_fix_direction: Expand retrieval-scope policy from the current direct tool filter into a centralized backend execution policy that covers every external-access tool path, including future additions.

## low

- file/path: `apps/web/server/services/agencyPreviewLifecycleService.ts`, `apps/web/server/routers/agency.ts`
  risk: Preview expiration is opportunistic on preview read/commit rather than scheduler-driven. Expired artifacts are blocked when touched, but long-idle previews can persist beyond the nominal retention window until another access occurs.
  recommended_fix_direction: Add a scheduled cleanup sweep or background job that enforces the retention window independent of user traffic.

- file/path: `apps/web/server/services/agencyExperienceTemplateService.ts`, `python-backend/app/services/agency_service.py`
  risk: Built-in experience provenance is inferred from cloned agency slug prefixes instead of a dedicated immutable provenance field. Incorrect or manually altered slugs could weaken the reliability of template-derived retrieval-scope decisions.
  recommended_fix_direction: Persist explicit template provenance on cloned agencies or runs and resolve retrieval scope from that durable identifier instead of slug conventions.
