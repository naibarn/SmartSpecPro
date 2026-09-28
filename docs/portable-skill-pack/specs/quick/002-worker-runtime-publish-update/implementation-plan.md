# Implementation plan

## Objective

Make the published HyperFrames runtime contract truthful and give operators a
single visible Runtime & agents repair action.

## Affected areas

- `apps/web/server/routes/workerRuntime.ts`: complete archive admission.
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`: release fixtures
  and rejection regressions.
- `apps/worker-app/src-tauri/src/commands.rs`: managed WSL readiness.
- `apps/worker-app/src-tauri/tests/runtime_manifest_tests.rs`: platform fixture
  correction.
- `apps/worker-app/src/main.tsx`: force-capable repair action and status UI.
- `apps/worker-app/scripts/package-runtime-release.mjs`: fail closed on
  placeholder signature input.

## Acceptance criteria

1. A HyperFrames pack is not served unless it declares and contains the
   platform-correct Whisper executable, large-v3 model, and non-placeholder
   `SHA256SUMS.sig`.
2. Managed WSL reports incomplete when those files or manifest fields are
   absent.
3. Runtime & agents exposes checks and Update / repair Worker runtime.
4. Same-version repair runs the existing installer and rechecks readiness.
5. No unsigned/fake archive is published.

## Rollout

Build and verify a signed current archive, promote archive plus sidecar
manifest atomically, deploy, then verify the public manifest and download
responses. Until signing input is provided, keep the existing production
release untouched.
