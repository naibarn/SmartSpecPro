# Section 01: Browser Gemma 4 Runtime

## Ownership

- browser Gemma 4 runtime dependency and worker bootstrap
- browser profile gating and capability rules
- E2B-first rollout with E4B advanced-profile follow-up
- browser `.web.task` artifact integration
- dynamic import of the official browser runtime dependency

## Target files

- `apps/web/package.json`
- `apps/web/client/src/features/local-ai/adapters/browserLocalRuntime.ts`
- `apps/web/client/src/features/local-ai/hooks/useLocalAiCapability.ts`
- `apps/web/client/src/features/local-ai/hooks/useModelDownload.ts`
- `apps/web/client/src/features/local-ai/workers/local-llm.worker.ts`
- `apps/web/client/src/features/local-ai/model-registry/models.ts`
- `apps/web/server/services/localAiCatalog.ts`

## Implementation approach

1. Replace the browser runtime stub with a real Gemma 4 browser integration.
   - Use `@mediapipe/tasks-genai` or the equivalent official browser LLM Inference Engine path already implied by the `mediapipe-webgpu` runtime family.
2. Keep the current runtime-family contract, but tie it to the actual browser-compatible Gemma 4 artifact.
3. Treat `gemma4-e2b-web-fast` as the first real browser profile.
4. Add `gemma4-e4b-web-balanced` as a second, explicitly advanced profile using the E4B `web.task` artifact.
5. Add capability checks for:
   - secure context
   - WebGPU presence
   - adapter/device creation
   - profile requirement match
   - runtime dependency presence
   - approved bundle availability
6. Keep browser voice bounded:
   - E2B/E4B only
   - short clips only
   - `legacy_stt` unchanged as fallback

## TDD expectations

- Add tests for missing runtime dependency or bundle manifest.
- Add tests proving the heavy browser runtime dependency is dynamically imported only after feature enablement and cheap capability success.
- Add tests proving E2B becomes eligible before E4B.
- Add tests proving E4B remains experimental until explicitly enabled.
- Add tests proving `.web.task` metadata is represented separately from desktop `.litertlm` metadata.

## Acceptance checks

- browser no longer reports `browser_runtime_adapter_not_implemented` when the approved runtime is present
- E2B browser path is usable on supported hardware
- E4B browser path is visible only when explicitly allowed
- unsupported browsers remain cloud-stable

## Risks and coordination

- Do not let this section widen voice, routing, or metadata behavior on its own.
- Section 03 owns chat integration and voice entry behavior.
