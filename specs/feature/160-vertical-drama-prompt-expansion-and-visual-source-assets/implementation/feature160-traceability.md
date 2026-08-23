# Feature 160 traceability

| Requirement | Contract/code | Focused proof | Status |
|---|---|---|---|
| Optional dialog preview and editable apply | `promptExpansion.ts`, `verticalDramaPromptExpansionService.ts`, `VerticalDramaPromptExpansionDialog.tsx` | prompt expansion tests | Implemented |
| Skill-first and bounded web-search attempt | `previewPromptExpansion` uses `executeUnified` with `auto_web_search`; deterministic warning fallback | service parser tests | Implemented with provider fallback |
| Location/shop as scene; product/software as reference | `deriveVisualSlots`, role picker | prompt expansion tests | Implemented |
| AI/upload image and creator footage | source pack managed-media path, source-media segment table/procedures | schema + B-roll tests | Implemented |
| Prompt per source slot | `buildSlotPrompt`, `generateSourceSlotPrompt` | slot prompt test | Implemented |
| News report separation | `newsReport.ts`, news service/panel/procedures | news integration tests | Implemented |
| Evidence/as-of/freshness/correction | news service + revision tables | correction/freshness tests | Implemented |
| Snapshot consistency into story admission | visual snapshot service + optional runtime input | stale fence test | Implemented at admission boundary; all callers must pass the snapshot |
| Shot binding without reference-table overload | `verticalDramaShotBrollBindings`, `bindShotBroll` | B-roll integration test | Implemented |
| Exact footage timing/audio/order | B-roll service + segment editor/timeline validation | exact 5-second projection test | Implemented |
| Browser visual/keyboard proof | `ui-browser-evidence.md` | no browser connector/fixture | Skipped, not claimed |
| Production DB/deployment proof | migrations only | no approved mutation/deploy | Skipped, not claimed |
