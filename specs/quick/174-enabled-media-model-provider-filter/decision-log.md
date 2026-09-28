# Decision log

## Planning depth

`standard` quick-plan. The change is cross-file but remains within the media
catalog/provider boundary, has no schema migration, and has a bounded focused
test surface. It does not require full deep-plan unless implementation reveals
additional provider-routing or tenant-boundary changes.

## Decisions

1. Filter disabled providers centrally in the DB-backed model registry and in
   `mediaModels.list`; do not patch selectors one by one.
2. Preserve the existing compatibility fallback only when provider rows are
   unavailable or the DB load fails. A successful DB load with provider rows
   and zero eligible models must remain an empty catalog.
3. Treat a missing provider row as compatible with the existing installation
   behavior unless provider rows are available and the existing endpoint
   explicitly requires configuration. The requested behavior is specifically
   the disabled-provider boundary.
4. Invalidate model registry cache on provider create/update/delete. No model
   rows are rewritten.
5. Cover all media types, including recommended audio, even though the initial
   report emphasized image and video.

## Promotion trigger

Promote to full deep-plan only if the implementation requires schema changes,
tenant-specific provider visibility, a new provider lifecycle contract, or
more than five independently owned sections.

## Plan self-review rounds

1. Coverage review: image, video, audio, Admin visibility, stale selections,
   cache invalidation, and static-fallback leakage are all represented.
2. Contradiction review: missing-provider compatibility is explicitly separated
   from a matching disabled provider; successful empty catalogs are distinct
   from load failures.
3. Security review: catalog filtering is not treated as authorization, and the
   existing generation-time DB gate remains authoritative; secrets stay out of
   responses.
4. Testability review: each new DB read has explicit provider fixtures, and
   existing Admin/readiness and direct-generation tests remain in scope.
5. Integration review: public catalog and registry share the normalized-name
   predicate, while provider mutations invalidate the registry before the next
   recommended-model read.

Result: no meaningful auto-fix items remain; plan stays standard quick-plan.
