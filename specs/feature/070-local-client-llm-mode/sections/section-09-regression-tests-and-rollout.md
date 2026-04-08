# Section 09: Regression Tests and Rollout

## Purpose

Close the Local / Client LLM Mode plan with the regression coverage, rollout sequencing, and operator-facing guardrails needed to prove unsupported devices and cloud-only tenants do not regress.

## Ownership

- cross-cutting regression suite
- rollout-safe defaults and enablement checks
- compatibility smoke coverage
- final operator verification checklist

## Target files

- `apps/web/server/**/*.test.ts` near updated preference, feature-flag, chat, and OCR services
- `apps/web/client/src/**/*.test.tsx` near Settings, Chat, and Local AI feature modules
- any integration-style tests that exercise `llmRoutes.ts` and chat persistence
- rollout notes or operator-facing implementation handoff in the planning directory if the team keeps one

## Implementation notes

1. Add regression coverage for the default-off posture.
   - tenant flag absent or `false` keeps the feature off
   - user with no `localAi` preference remains cloud-only
   - normal chat/settings page loads do not trigger browser runtime imports or downloads

2. Cover unsupported-device behavior explicitly.
   - missing WebGPU
   - `navigator.gpu` present but adapter acquisition fails
   - adapter present but device creation or profile WebGPU requirements fail
   - insecure context
   - insufficient storage
   - failed browser worker init
   - desktop install errors
   - microphone permission denied
   - browser-local voice unavailable while `auto` voice mode is selected
   These should all preserve the cloud path.
   Extend the same guarantee to `/teams`, including room creation, room switching, workflow panels, run monitor, and member-management flows.

3. Add persistence and reload coverage.
   - conversation override survives reload
   - runtime badges survive reload from `messages.runtimeMetadata`
   - legacy rows with `runtimeMetadata = null` remain readable
   - Team Room runtime/source disclosure survives reload from `metadataJson.runtimeDisclosure`

4. Add security regression coverage.
   - arbitrary external OCR/asset fetch targets are rejected
   - non-allowlisted asset origins are blocked
   - revoked profiles stop routing even when installed locally
   - client advisory metadata cannot persist `Local` as a durable v1 label
   - Local AI profiles do not silently appear inside team orchestration model selectors
   - Team Room clients cannot inject server-owned disclosure fields directly
   - voice commands cannot navigate to arbitrary external URLs or bypass privileged route controls
   - side-effectful voice commands still require the same server authorization path as typed commands
   - explicit `gemma4_local` mode does not silently downgrade to third-party STT

5. Add rollout/operator checks to the implementation handoff.
   Suggested operator checklist:
   - verify tenant flag defaults to off
   - verify force-cloud-only works
   - verify one supported browser local profile can install and answer
   - verify one unsupported browser remains cloud-stable
   - verify one desktop install/remove cycle in `apps/tauri-shell`
   - verify one browser mic flow still works in `legacy_stt` mode when local voice is unsupported
   - verify the chat mic in `legacy_stt` mode still uses the existing push-to-talk path rather than the separate realtime voice-session stack
   - verify one supported desktop mic flow can use local voice or cleanly fall back
   - verify a revoked profile is disabled without manual data cleanup
   - verify `/teams` list/detail, room send, room create, and run monitor remain usable on an unsupported browser

6. Keep rollout sequencing conservative.
   - merge Phase 0 safety rails before enabling any local runtime path
   - release browser text-first path before vision ambitions
   - add Tauri profile support only after shared routing and metadata rules are proven

## TDD expectations

- Write the default-off regression tests before enabling any runtime adapter in production code.
- Add at least one negative test for each security boundary:
  - arbitrary URL rejection
  - revoked profile routing block
  - invalid client runtime metadata
- Add a smoke-style integration test proving unsupported devices still complete a normal cloud chat request.
- Add a smoke-style integration test proving unsupported devices still complete normal `/teams` list/detail and room-message flows.

## Acceptance checks

- A tenant with Local AI disabled sees no broken Local AI path.
- A user who never enables Local AI never downloads model assets.
- Unsupported browsers and desktop failures still pass ordinary chat smoke tests.
- Unsupported browsers and desktop failures still pass `/teams` smoke flows, including room history and run-monitor rendering.
- Shared-browser sign-out does not leak cached-install visibility across accounts.
- Runtime badges and conversation overrides survive reload through server-owned persistence.
- Security regressions around asset origin, OCR ingress, and fake `Local` claims are covered by tests.

## Coordination notes

- This section does not own core feature code; it verifies the work from sections 01 through 08.
- Keep test names and fixtures aligned with the actual file/module names introduced earlier.
- If a regression test exposes an interface mismatch between sections, update the owning section file before implementation begins.
