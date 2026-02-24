# Section 02 Code Review Interview

## Findings Triage

### Auto-fixed (no user input needed)

| Finding | Action |
|---------|--------|
| HIGH: `PresentationEditor.test.tsx` stale string exportIds (`"exp-1"`, `"exp-warning-1"`) | Fixed: changed to `1` and `2` |
| HIGH: Comment on exportId saying "DB primary key" is wrong (it's a stub counter) | Fixed: added `TODO(section-03)` comment explaining stub |
| MEDIUM: `resolvedAudioTrackSchema` not `.strict()` — test was testing wrong thing | Fixed: added `.strict()`, split test into two (missing url test + strict rejection test) |
| MEDIUM: `resolvedProjectAudioTrackSchema` not `.strict()` | Fixed: added `.strict()` |
| LOW: `fps` no upper bound | Fixed: added `.max(120)` |
| MEDIUM: `downloadUrl` accepts any URL scheme (SSRF risk) | Fixed: added `.startsWith("https://")` |

### Let go (not actionable at this section)

| Finding | Reason |
|---------|--------|
| HIGH: ExportDialog.tsx breaking change not in diff | File doesn't exist yet — created in section-08 |
| MEDIUM: `TriggerPresentationExportInput.format` not extended to jpg/pdf | Intentional deferral — section-04 extends the router input |
| MEDIUM: `message` removed from status result schema | Intentional per plan — `errorMessage` replaces it |
| LOW: `presentationPlayDeckPayloadSchema` alias placement | Minor ordering issue, no semantic impact |
| LOW: Test describe block naming drift | Minor, doesn't affect test behaviour |
| MEDIUM: No tests for `processing`/`done`/`error` statuses | Pre-existing coverage; section-15 handles comprehensive coverage |

## User Interview

**Q: Should input schemas (audioTrackInputSchema, projectAudioTrackInputSchema) also use .strict()?**
**A: Yes, add .strict() to input schemas too.** (User selected this option)

→ Applied: added `.strict()` to both input audio schemas.

## Final State After Fixes

- `contracts.ts`: 4 audio schemas all strict, fps capped at 120, downloadUrl https-only
- `contracts.test.ts`: 19 tests passing (was 12 new, now 13 new + 1 split into 2)
- `presentationPlaybackExport.ts`: TODO comment added, counter stub documented
- `PresentationEditor.test.tsx`: exportId fixtures updated to numeric values
