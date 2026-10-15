# ONNX / WSL2 compatibility plan for `sprintf-js`

Status: `WAITING_APPROVAL`. This plan does not change the native runtime or enable production features.

## Current reachability evidence

- The production dependency lock contains `apps/web > hyperframes@0.7.109 > onnxruntime-node@1.21.1 > global-agent@3.0.0 > roarr@2.15.4 > sprintf-js@1.1.3`.
- The application has no direct `sprintf-js` import. HyperFrames is used through the existing runtime adapter, which dynamically imports `@hyperframes/producer`; its runtime readiness requires explicit `HYPERFRAMES_OFFICIAL_RUNTIME_READY=1` and the required renderer/browser binaries.
- Tenant HyperFrames access flags default to false in `readHyperframesFeatureFlags`; therefore the feature is gated by tenant configuration. The app dependency is still shipped, and other configured tenants/runtime images may expose it.
- No source-level evidence proves attacker-controlled format strings reach the vulnerable `sprintf-js` functions, and no evidence proves the call path unreachable. Reachability is therefore **unknown**, not dismissed.
- Current documented app default render engine is Remotion, but that is not proof that the HyperFrames dependency is absent from production artifacts. Keep the full audit red.

## Authorized test sequence, only after Security + media/runtime owner approval

1. Record the named approver, target non-production runtime, approved ONNX target `1.30.0`, WSL2 image/manifest baseline, rollback image, and artifact retention window. Do not use production secrets or production hosts.
2. Create an isolated non-production candidate; leave the current native runtime and feature flags unchanged.
3. Build/package ONNX Runtime `1.30.0` in the approved WSL2 environment. Record source revision, toolchain, OS/architecture, package/artifact SHA-256, and manifest binding.
4. Verify package resolution removes `global-agent@3` → `roarr@2.15.4` → `sprintf-js@1.1.3`, without adding a replacement advisory.
5. Run deterministic model inference fixtures (CPU and configured execution provider), startup/shutdown, cancellation, memory bound, and missing-model failure behavior.
6. Run HyperFrames CLI and producer readiness/render tests, FFmpeg/FFprobe compatibility, representative render fixtures, and Remotion fallback/regression suite on the exact WSL2 artifact.
7. Verify the worker reports the exact artifact digest and runtime version; test rollback to the captured prior image. Do not promote or enable production behavior.
8. Security owner reviews the reachability/advisory result and media/runtime owner accepts compatibility evidence. Only then decide whether the dependency patch is eligible for the normal integration gates.

If approval is not granted, the only alternative is a named Security + media/runtime owner accepting scoped, expiring residual risk. No suppression or audit-policy change is allowed; the full audit remains failing.
