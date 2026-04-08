# Section 05: Security, Regression, and Rollout

## Ownership

- rollout safety for unsupported devices
- artifact trust and revocation rules
- Tauri native-boundary security controls
- local-skill abuse and trust-boundary controls
- final regression coverage and staged rollout order

## Target files

- `apps/web/server/services/localAiCatalog.ts`
- `apps/web/server/services/localAiPolicy.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/localAiRuntimeMetadata.ts`
- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/client/src/features/local-ai/components/LocalAiSettingsSection.tsx`
- `apps/web/server/services/__tests__/localAiRuntimeMetadata.test.ts`
- `apps/web/server/services/__tests__/localAiPolicy.test.ts`
- `apps/web/server/services/__tests__/skillExecutionPolicy.test.ts`
- `apps/web/client/src/features/local-ai/components/LocalAiSettingsSection.test.tsx`

## Implementation approach

1. Prefer canonical artifact metadata from `litert-community`, not the duplicated Hugging Face repo.
2. Add artifact-kind distinction and profile maturity to the catalog.
3. Keep browser E4B behind explicit rollout controls.
4. Keep Tauri native commands scoped and deny broad external access.
5. Preserve fail-closed behavior when:
   - runtime dependency is missing
   - model manifest is revoked
   - voice capability is absent
   - device capability is insufficient
6. Preserve fail-closed behavior for local skills when:
   - the skill is not reviewed
   - the invocation is not user-present
   - the path originates from public API, scheduler, workflow background, or another cloud-required surface
   - schema validation fails
   - scripted runtime packaging or permission policy is missing
   - local-script manifest trust/provenance validation fails
7. Ship rollout in order:
   - browser E2B runtime
   - Tauri E4B runtime
   - Tauri E2B fallback
   - reviewed Tauri `local_safe` skills
   - browser E4B advanced profile

## TDD expectations

- Add tests for artifact revocation and maturity gating.
- Add tests for unsupported-device non-regression.
- Add tests proving explicit `gemma4_local` still fails closed.
- Add tests proving duplicate source metadata cannot override canonical shipped manifest decisions.
- Add tests proving `cloud_required` skills never route to the Tauri runtime.
- Add tests proving local-skill metadata cannot be spoofed by the client to bypass server policy.
- Add tests proving scripted local-safe skills cannot escalate to arbitrary shell, unrestricted network, or unrestricted filesystem access.
- Add tests proving JSX/TSX bundles cannot execute as raw source and must resolve to reviewed compiled entry artifacts.
- Add tests proving local scripts never receive reusable session/provider secrets.
- Add tests proving offline local-safe results sync through the app outbox path rather than direct script-controlled network calls.
- Add tests proving reviewed bundle digests can be revoked even when compiled artifacts remain installed locally.

## Acceptance checks

- no unsupported machine loses normal chat behavior
- revoked profiles are blocked even if files remain installed
- browser E4B cannot become routable by accident
- unsafe or non-reviewed skills cannot become locally executable by accident
- Tauri native runtime commands do not widen trust boundaries beyond the intended Local AI scope
- reviewed scripted skills remain bounded to packaged interpreters and app-owned permission scopes
- JSX/TSX source files do not become executable by themselves without a reviewed compiled artifact boundary
- reusable credentials do not cross into reviewed local-script execution
- revoked reviewed bundles cannot be executed after revocation metadata is applied

## Risks and coordination

- This section closes security gaps but does not own runtime implementation details.
- If native helper/sidecar work is used in section 02, this section must review its bind/address/auth story before rollout.
- Section 04 defines skill tiers; this section ensures those tiers cannot be bypassed.
