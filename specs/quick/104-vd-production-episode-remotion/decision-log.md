# Decision Log

## 2026-08-10

- Planning depth: standard quick-plan initially; promote to full deep-plan only if implementation reveals a new cross-service contract that cannot be safely captured here.
- Renderer: reuse `remotion_render_video` and segmented GenericTemplate instead of adding a job type.
- Source semantics: auto may mix compiled and raw-shot segments; explicit modes fail closed when their source is unavailable.
- Group semantics: the selected range is partitioned by a user-selected count, minimum 3; a short remainder requires explicit user choice.
- Persistence: extend existing `productionEpisodesManifest`; no table/migration in this increment.
- UI: reuse current panel/player and existing Radix/Tailwind vocabulary; add explicit async/partial/error states.
