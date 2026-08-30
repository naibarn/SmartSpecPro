# Deep-implement closeout — Feature 162 (implementation wave 2)

> Audit status (2026-08-25): the previously identified static gaps were closed
> in the second implementation wave. Runtime proof still requires a real local
> FFmpeg/FFprobe fixture, configured ComfyUI MCP server, R2 credentials,
> Vector provider and database migration execution; those are verify-only gates,
> not claims made by local typechecks.

Implementation followed the file-based deep-implement workflow after the
six-section deep-plan. Source footage remains native-local; server publication
accepts only verified derived artifacts.

## Implemented foundations (not full section acceptance)

1. Shared media contracts: bounded strict schemas for manifests, probe,
   dead-air/reframe/still-motion/budget plans, QC, start/reference frames,
   workflow resolution, H3 route selection, jobs, progress, and errors.
2. Server persistence/services: additive media asset/index ledger, job
   admission, workflow resolver, publication checksum/QC/ownership gate, and
   tenant/Series-filtered index projection.
3. Native pipeline: FFprobe metadata, bounded dead-air/audio filter, focus-point
   9:16 crop, still-motion filter, output probe/QC, derived-only staging and
   atomic job checkpoints are executable in the native worker.
4. Comfy MCP: a strict stdio JSON-RPC client is now the shot-video execution
   boundary. It accepts typed workflow/start-frame/reference-frame intent and
   requires a local derived output before upload/publication.
5. Integration: ingest emits a bounded local inventory; the server persists
   metadata/index rows without raw bytes, and publication verifies job,
   binding, worker-artifact storage prefix, content type, size and checksum.
   Vector indexing has a durable processing/failed/attempt lifecycle.
6. Worker UI: the Series workspace has intent controls for dead-air, focus
   point, 9:16, still motion, duration, inventory analysis and queue dispatch;
   the nine-shot browser-side B-roll attachment surface remains compatible with
   the new derived asset ledger.

## Proof

- `npm --workspace apps/web test -- --run shared/verticalDramaMedia/__tests__/contracts.test.ts server/services/__tests__/verticalDramaMediaServices.test.ts server/services/__tests__/comfyMcpAdapter.test.ts`
- `npm --workspace apps/web run typecheck`
- `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml` — 164
  library tests passed.
- Live local FFmpeg/FFprobe fixture passed: subject-focused 9:16 output was
  1080x1920 with audio after dead-air processing.

R2 upload, vector provider, GPU, configured Comfy MCP/MiniMax execution,
database migration execution, packaged Tauri/browser and production proof
remain environment gates; the implementation fails closed when those
capabilities are unavailable or the binding revision is stale.
