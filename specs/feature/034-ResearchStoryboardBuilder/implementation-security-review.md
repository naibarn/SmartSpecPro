# Implementation Security Review

## medium

- file/path: `python-backend/app/services/agency_service.py`, `apps/web/server/services/agencyExperienceTemplateService.ts`, `apps/web/server/routers/agency.ts`
  risk: Retrieval scope is persisted and transmitted correctly, but enforcement is still prompt-level runtime guidance. A tool-capable agency run could still violate the intended `library_only` boundary if a downstream tool path ignores prompt instructions.
  recommended_fix_direction: Promote retrieval scope into explicit backend/tool execution policy checks so library-only and fallback modes are enforced below the prompt layer.

## low

- file/path: `apps/web/server/services/agencyPreviewLifecycleService.ts`, `apps/web/server/routers/agency.ts`
  risk: Preview expiration is opportunistic on preview read/commit rather than scheduler-driven. Expired artifacts are blocked when touched, but long-idle previews can persist beyond the nominal retention window until another access occurs.
  recommended_fix_direction: Add a scheduled cleanup sweep or background job that enforces the retention window independent of user traffic.

- file/path: `apps/web/server/services/agencyExperienceTemplateService.ts`, `python-backend/app/services/agency_service.py`
  risk: Built-in experience provenance is inferred from cloned agency slug prefixes instead of a dedicated immutable provenance field. Incorrect or manually altered slugs could weaken the reliability of template-derived retrieval-scope decisions.
  recommended_fix_direction: Persist explicit template provenance on cloned agencies or runs and resolve retrieval scope from that durable identifier instead of slug conventions.
