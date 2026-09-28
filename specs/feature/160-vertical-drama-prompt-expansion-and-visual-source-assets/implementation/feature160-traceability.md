# Feature 160 traceability

| Requirement | Contract/code | Focused proof | Status |
|---|---|---|---|
| Optional dialog preview and editable apply | `promptExpansion.ts`, `verticalDramaPromptExpansionService.ts`, `VerticalDramaPromptExpansionDialog.tsx`, `applyPromptExpansion` slot persistence | prompt expansion tests | Implemented and source-pack wired |
| Prompt-first source planning and approval gate | `CreateSeriesWizard.tsx`, `StorySourcesHub.tsx`, `verticalDramaSourcePackService.ts`, `sourcePack.ts`, round-8 five-pass audit | source readiness + prompt expansion tests | Implemented: no pre-approval slot/media controls; approved prompt is the slot/readiness/downstream source of truth |
| Skill-first and bounded web-search attempt | `previewPromptExpansion` uses `executeUnified` with `auto_web_search`; deterministic warning fallback | service parser tests | Implemented with provider fallback |
| Location/shop as scene; product/software as reference | `deriveVisualSlots`, role picker | prompt expansion tests | Implemented |
| AI/upload image and creator footage | `createGeneratedSourceAsset`, `registerUploadedSourceMedia`, source pack managed-media path, source-media segment table/procedures | schema + B-roll + assembly tests | Implemented with R2-only hard gate |
| Prompt per source slot | `buildSlotPrompt`, `generateSourceSlotPrompt` | slot prompt test | Implemented |
| News report separation | `newsReport.ts`, profile/format registry, wizard mode selector, persisted claim/evidence service, planning panel/procedures | news integration + profile tests | Implemented and persisted |
| Evidence/as-of/freshness/correction | news service + revision tables | correction/freshness tests | Implemented |
| Snapshot consistency into story admission/worker | visual snapshot capture/persistence + runtime input + plan/deep/extend/improve callers + worker final stale fence | stale fence + focused integration tests | Implemented with fail-closed worker gate |
| Shot binding without reference-table overload | `verticalDramaShotBrollBindings`, owner-scoped canonical resolver, `bindShotBroll` | B-roll integration test | Implemented with server ownership/storage fence |
| Exact footage timing/audio/order/assembly | B-roll service + segment editor/timeline validation + persisted assembly `brollPlan` projection | exact timeline + assembly tests | Implemented with R2/rights/overflow gate |
| Browser visual/keyboard proof | `ui-browser-evidence.md` | no browser connector/fixture | Skipped, not claimed |
| Production DB/deployment proof | migrations only | no approved mutation/deploy | Skipped, not claimed |
