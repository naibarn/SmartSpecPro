# Decision log

## Planning depth

**Standard quick-plan.** The task spans shared naming, media task metadata, Gallery publication, client download behavior, and public streaming, but it does not require a new domain, destructive migration, or a new service. Four execution sections are sufficient.

## Options considered

- **UI-only fallback:** minimal change, but misses Library/public downloads and loses structured source context.
- **Source metadata plus shared resolver (chosen):** carries trusted series/episode/shot context from generation callers, centralizes precedence/sanitization, and keeps compatibility boundaries stable.
- **New database filename column/migration:** can persist a separate immutable filename, but adds schema and migration cost that is not needed when the download name can be derived from the current title.

## Key decisions

- Keep `remotion_render_mp4`, worker job types, render IDs, and managed storage keys unchanged.
- Add a small shared resolver with explicit metadata precedence and generic fallbacks.
- Store/forward app-only naming metadata through the existing persisted task metadata mechanism, filtered from provider-facing fields.
- Use the resolved title for new Gallery publication and a sanitized title-derived filename for explicit downloads.
- Preserve full prompts in descriptions for search and provenance.

## Promotion check

No promotion to full deep-plan is required: no new schema, external service, auth model, or irreversible data transform is needed. Promote only if implementation reveals that a provider/backend contract must be changed across another repository or that a schema field is required for stable download names.
