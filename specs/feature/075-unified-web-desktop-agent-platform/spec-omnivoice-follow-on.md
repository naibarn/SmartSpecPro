# 075A - OmniVoice Follow-on for Unified Web + Desktop Agent Platform

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 075-unified-web-desktop-agent-platform, 070-local-client-llm-mode
Audience: Product, Web Control Plane, Desktop/Tauri, Runtime, Media, Security, QA, Admin

---

## 1. Executive summary

Feature 075 establishes SmartAIHub as one governed web + desktop agent platform.

This follow-on spec defines where `k2-fsa/OmniVoice` should be introduced so the platform gains:

- higher-quality multilingual text-to-speech
- optional voice cloning for narration and branded voices
- richer desktop spoken readback on capable managed devices
- a self-hosted or enterprise-controlled alternative to current cloud TTS providers

The key decision is deliberately narrow:

- use OmniVoice as a **TTS and voice-asset capability**
- do not use OmniVoice as the primary STT stack
- do not use OmniVoice as an agent runtime
- do not let OmniVoice bypass the existing trust, package, policy, or rollout controls introduced by Feature 075

---

## 2. Why this follows Feature 075

Feature 075 already gives the product the contracts needed to add a new voice capability safely:

- web remains the control plane
- desktop remains the local execution-rich surface
- runtime routing, trust classes, and package materialization already exist
- local voice input and native readback already exist in limited form
- internal TTS and media generation abstractions already exist

That means OmniVoice should be added as a governed platform capability, not as an isolated experiment.

---

## 3. Product goals

1. Add OmniVoice as an optional first-class TTS provider behind the existing internal gateway.
2. Expose OmniVoice where it creates unique value over current providers:
   - multilingual narration
   - branded voice readout
   - voice cloning from approved reference audio
   - richer voice assets for presentations and media workflows
3. Preserve existing STT and voice-command routing.
4. Preserve current native TTS/browser speech-synthesis fallbacks.
5. Allow managed desktop-local OmniVoice only on explicitly capable and policy-approved devices.
6. Keep all OmniVoice usage truthful in UI, billing, trust labels, and locality labels.

---

## 4. Non-goals

1. Replacing Gemma 4 local transcription or cloud STT routes.
2. Replacing Pi, Agency Swarm, or any desktop agent runtime.
3. Making voice cloning universally available without governance.
4. Bundling a heavyweight OmniVoice runtime into every desktop build by default.
5. Promoting local-only OmniVoice output into trusted shared surfaces without provenance metadata.

---

## 5. Current-codebase fit

### 5.1 Internal TTS gateway already exists

Current files:

- `apps/web/server/services/ttsService.ts`
- `python-backend/app/api/stt.py`
- `python-backend/app/llm_proxy/unified_client.py`

Fit:

- SmartAIHub already routes TTS through a backend abstraction
- OmniVoice can be added as another provider without changing the high-level product contract

### 5.2 Media/audio model registry already exists

Current files:

- `python-backend/app/core/media_models.py`
- `python-backend/app/services/generation/models.py`
- `apps/web/server/services/mediaGenerationService.ts`

Fit:

- the media stack already understands audio models, providers, and voice-oriented UX
- OmniVoice should be represented as a new audio provider/model family, not a hidden ad hoc path

### 5.3 Desktop voice support already exists, but is basic

Current files:

- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/web/client/src/features/local-ai/voice/localVoiceReadback.ts`
- `apps/web/docs/help/th/local-ai.md`

Fit:

- desktop already supports STT and spoken readback
- current desktop TTS is native-OS oriented, which is a good fallback but not a premium multilingual voice layer
- OmniVoice should augment this path selectively

---

## 6. Locked architecture decisions

### 6.1 OmniVoice role

OmniVoice is a:

- TTS provider
- voice-cloning engine
- voice-design engine
- premium voice-asset runtime

OmniVoice is not a:

- speech-to-text provider
- wake-word engine
- command router
- replacement for Pi or Agency Swarm

### 6.2 First integration point

The first integration point must be the existing internal TTS gateway so web, desktop, and backend workflows can reuse one contract.

### 6.3 Delivery order

The implementation order must be:

1. provider and contract integration
2. media/narration productization
3. optional desktop-local premium readback
4. governance, packaging, rollout, and regression closure

### 6.4 Desktop posture

Desktop-local OmniVoice is:

- optional
- capability-gated
- policy-gated
- package-trust-gated
- not the default fallback path

Current native TTS remains the safety net when OmniVoice is unavailable or disallowed.

---

## 7. Recommended implementation slices

### Slice 1: OmniVoice provider contract and gateway

Focus:

- add `omnivoice` as a supported TTS provider
- define request/response contract for plain TTS, voice design, and optional voice cloning inputs
- integrate provider selection into existing internal TTS routes and shared runtime config

Primary outputs:

- provider registry changes
- gateway adapter/service
- validation and error taxonomy
- availability/status reporting

### Slice 2: Media narration and voice assets

Focus:

- presentation narration
- multilingual audio asset generation
- optional reference-audio-based voice cloning with explicit approval and provenance
- admin and user model selection UX

Primary outputs:

- media model registry updates
- narration-specific UX and workflow hooks
- voice-cloning provenance and restrictions

### Slice 3: Desktop optional premium readback

Focus:

- add a managed Desktop Host OmniVoice runtime path
- preserve native TTS fallback
- keep local-vs-hybrid truthfulness
- gate install and execution by device capability and package trust

Primary outputs:

- desktop runtime adapter
- managed package/runtime contract
- desktop settings and capability UX

### Slice 4: Governance, rollout, and regression

Focus:

- trust labels
- output provenance
- rollout gates
- observability
- regression coverage
- enterprise restrictions around voice cloning and local model execution

Primary outputs:

- policy rules
- audit and run metadata
- rollout phases
- test matrix

---

## 8. Detailed requirements

### 8.1 Gateway requirements

- `omnivoice` must be selectable through the same internal TTS service contract used by existing providers
- failures must return actionable provider-specific errors without leaking raw backend internals
- long-running or heavy OmniVoice generation must support async or worker-backed execution if sync latency becomes user-visible
- the gateway must separate:
  - plain TTS
  - voice design
  - voice cloning

### 8.2 Media requirements

- narration flows must allow choosing OmniVoice when the selected tenant/provider/model supports it
- voice-cloning flows must require an approved reference-audio asset and explicit provenance metadata
- generated audio assets must carry provider/runtime metadata so later UI can tell whether output came from cloud OmniVoice or desktop-local OmniVoice

### 8.3 Desktop requirements

- desktop local readback must still work when OmniVoice is absent by using the current native TTS route
- managed local OmniVoice must not start when:
  - required package trust is missing
  - policy forbids local premium voice synthesis
  - device capability is insufficient
  - model/runtime freshness or revocation state is stale

### 8.4 Governance requirements

- voice cloning must be policy-addressable independently from plain TTS
- runs and assets must record:
  - provider
  - runtime locality
  - whether cloning was used
  - reference asset provenance
  - trust class
- enterprise rollout must be able to enable:
  - server-only OmniVoice first
  - narration-only second
  - desktop-local premium readback last

---

## 9. Success criteria

- OmniVoice can be selected as a first-class TTS provider through the existing internal gateway
- media and narration flows can use OmniVoice without bypassing current model/provider abstractions
- desktop readback can use OmniVoice only when the runtime is prepared, trusted, and policy-approved
- native TTS and existing provider fallbacks continue to work
- UI stays truthful about local vs hybrid vs server execution
- voice cloning remains governed, auditable, and explicitly opt-in

---

## 10. Deliverables

- one follow-on planning spec
- four implementation sections
- updated section manifest and dependency graph
- updated roadmap references so OmniVoice work is sequenced after Feature 075 foundations

---

## 11. Final takeaway

OmniVoice should be adopted as a high-value voice capability layered on top of Feature 075, not as a new platform center of gravity.

The practical rollout path is:

- start with gateway/provider integration
- ship narration and premium voice assets
- add optional desktop-local readback only where governance and capability allow
- keep all labels, trust boundaries, and fallbacks truthful
