# Implementation Security Review

## medium

- file/path: `python-backend/app/services/agency_service.py`, `apps/web/server/services/agencyExperienceTemplateService.ts`, `apps/web/server/routers/agency.ts`
  risk: Retrieval scope now filters direct external retrieval tools during Python tool resolution for both agent-only and orchestrator-backed agent nodes in `library_only` runs, but enforcement is still incomplete for indirect external access paths. Tool-capable runs could still bypass the intended boundary through future tool additions or tool types that are not yet mapped into the retrieval-scope policy.
  recommended_fix_direction: Expand retrieval-scope policy from the current direct tool filter into a centralized backend execution policy that covers every external-access tool path, including future additions.

## low

- file/path: `apps/web/server/services/agencyPreviewLifecycleService.ts`, `apps/web/server/routers/agency.ts`
  risk: Preview expiration is opportunistic on preview read/commit rather than scheduler-driven. Expired artifacts are blocked when touched, but long-idle previews can persist beyond the nominal retention window until another access occurs.
  recommended_fix_direction: Add a scheduled cleanup sweep or background job that enforces the retention window independent of user traffic.

- file/path: `python-backend/app/services/agency_service.py`, `python-backend/app/services/agency_audit.py`
  risk: Agency audit now records reconciliation as pending when totals are unavailable, which avoids false confidence, but billing integrity is still incomplete until gateway totals and run totals are wired into the reconciliation call. Mismatches cannot be detected yet for production runs.
  recommended_fix_direction: Surface run-level gateway totals from the billing path and store the comparable run totals so reconciliation can transition from pending to enforced match/mismatch checks.
