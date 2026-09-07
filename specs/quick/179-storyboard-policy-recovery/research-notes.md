# Research Notes

- Local DB evidence: episode 258 has no storyboard; run 1233 failed at `storyboard_shotgrid`; runs 1229-1232 succeeded.
- Run artifact 992 contains only `{stage: storyboard_shotgrid}`, so the rejected candidate cannot be resumed.
- `generateStoryboardShotgrid` already performs one neutral rewrite and deducts credits only after final acceptance.
- The rewrite is generated from the original request, not from the rejected candidate.
- Safety currently scans the entire storyboard object, including duplicated handoff/metadata, under a 48,000-character cap.
- The async pipeline maps the rich safety error to a generic error and finalizes the stage-only payload.
- SocratiCode MCP transport was unavailable; targeted shell and read-only PostgreSQL queries were used.
