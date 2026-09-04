# Worker Media workspace review — 2026-09-05

Seven review rounds completed. Existing dirty work was preserved. No version changes,
installer, publish, database writes, or provider generation were performed by this review.

## Review rounds and fixes

| Round | Surface | Evidence and repair |
| --- | --- | --- |
| 1 | Project persistence / native IPC | Rust returns strings for Save/CapCut and expects `draftDir`, `draftJson`; corrected client contracts, native destination dialogs, project validation, visible import errors, and source-extension protection. |
| 2 | Timeline / CapCut structure | Five failing regressions reproduced overlapping/out-of-range silence, empty-timeline duration, material ID mismatch and aspect-ratio loss. Normalized silence, corrected material references and source speed, rejected unsupported/nonpersistent exports. |
| 3 | State / async boundaries | Isolated editor mounts by source path and project ID; prevented late project/directory reads from replacing newer choices; flushed pending autosave on switch/unmount/pagehide; report quota failures; preserve edited timeline duration. |
| 4 | Untrusted overlays / recording | Replaced direct project HTML/SVG injection with scriptless opaque iframe/passive images. Corrected recording duration/pause, late permission results, unmount cleanup, discarded takes, MIME selection and persisted audio instead of temporary blob URLs. |
| 5 | Editor correctness / feature honesty | Corrected speed-aware split, bounded trim, locked clips, original mute restoration after Solo, and compound duration. Native media imports retain filesystem paths. Removed fabricated AI/subtitle outputs and mislabeled stock catalog. Exposed source-only render limitations with native confirmation; reject unsupported CapCut layers. |
| 6 | Browser-driven repair / impact closure | Chromium detected an attempted external image request during HTML parsing; changed to inert template parsing and removed external resource attributes. Repaired code-editor preview too. Protected locked clips centrally and late Series errors; deferred imported-asset handling until project initialization. |
| 7 | Final verification / convergence | 43 focused tests passed; Chromium checks passed at 390/768/1440 widths using mocked native calls, including active editor mounting. Session-added whitespace clean; reviewed session-only diff. No new repair finding in this final bounded pass. |

## Changed code

Existing work refined under `src/screens/media-workspace/`:
- `MediaWorkspaceHost.tsx`, `MediaVideoEditorPlayer.tsx`: persistence, isolation, restore, playback rejection and honest render boundary.
- `MediaExplorerView.tsx`, `AssetDrawerPanel.tsx`: stale-request handling and removal of invalid stock examples.
- `MultiTrackTimeline.tsx`: trims/splits/locks/solo, compound duration and persistent native imports.
- `SandboxedOverlayViewer.tsx`, `CodeOverlayModal.tsx`: isolated static previews; truthful template/engine labels.
- `VoiceoverRecordModal.tsx`: recording lifecycle, timing and persistent embedded takes.
- `AiMediaStudioModal.tsx`, `AutoSubtitleModal.tsx`: unavailable status instead of fabricated success.
- `src/types/nleProject.ts`: normalized dead-air math and bounded CapCut export support.

New helpers: `projectPersistence.ts`, `useProjectAutosave.ts`, `overlayDocument.ts`,
`recordingClock.ts`, `timelineEdits.ts`. Added `vitest.config.ts`, nine focused test
files, and a browser fixture/smoke script here. No runtime dependency added.

## Verification

- `apps/web/node_modules/.bin/vitest run --config apps/worker-app/vitest.config.ts`
  — **43 tests / 9 files passed**, after the last production-code change.
- `node apps/worker-app/tests/media-workspace/browser-smoke.mjs`
  — **passed** with local Vite on port 1438; checks code/SVG sandbox isolation,
  blocked external overlay requests, code-editor preview, invalid project error,
  and active editor mount. Native calls are mocked, not desktop execution.
- Browser screenshots: `/tmp/media-workspace-browser-20260905/workspace-{390,768,1440}.png`.
  Error visibility inspected at 390 and 1440. This is not a full responsive-editor certification.
- Typecheck and Worker frontend production build passed earlier in the task.
  **No additional typecheck or build after the user's stop instruction.**
  The final lock-protection wrapper is covered by tests/browser transpilation, not a fresh full typecheck.
- Session-only added-line whitespace inspection passed. Whole Worker diff check
  reports pre-existing extra EOF blank lines in `commands.rs`, `media_pipeline.rs`,
  `WorkerAppShell.tsx`, and `styles.css`; these unrelated lines were preserved.
- Prior build emitted nonblocking large-chunk / mixed-dialog-import warnings.
- No Rust changes in this review; cargo tests, Windows installer/hardware execution,
  CapCut application import and live provider execution were not run.

## Remaining capability boundaries

- Full multitrack NLE playback/mixing/render is not connected to the current source
  processing command. The renderer still exports source Trim/Reframe/Dead Air only;
  the UI now says this explicitly and requires native confirmation before source-only
  render, including the fact that added privacy blur is omitted.
- AI generation and automatic transcription in these modals have no real provider/native
  bridge yet. They now report unavailable and never insert fabricated sample outputs.
  Wiring full implementations is separate backend/runtime integration work.
- CapCut export supports persistent local media clips; text/code overlays, compounds,
  remote URLs and embedded takes are rejected rather than silently lost. Actual CapCut
  compatibility still needs validation in CapCut. Full SmartSpec saves preserve draft content.
- Voice recordings are embedded data URLs for durability. Long recordings can exceed
  localStorage quota; the autosave error instructs users to save the project as a file.
- Source-backed preview still does not prove NLE final-output fidelity.

Discovery fallback: SocratiCode tools were not exposed. Astryx discovery command failed
because the configured CLI module was absent; existing components were preserved without
adding dependencies or redesigning the layout.

Stop reason: requested review count exceeded; focused repairs and fresh tests/browser
checks passed. Remaining full-feature/native integrations are explicitly bounded above.
No claim of production release readiness or fully implemented NLE rendering is made.
