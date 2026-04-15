# Follow-on Roadmap

## Purpose

Feature 075 is intentionally the architectural umbrella for SmartAIHub's unified web + desktop platform.

This note decomposes it into follow-on execution slices that are small enough to plan, staff, and deliver without reopening the core architecture.

## Recommended follow-on feature slices

### Slice 1: Desktop Device Identity and Policy Bootstrap

Focus:

- device registry
- enrollment bootstrap
- token classes and rotation
- policy snapshot caching and freshness
- admin disable / re-auth posture

Why first:

- later package sync, runtime execution, and offboarding all depend on authoritative device identity

Key outputs:

- device schema + services
- desktop enrollment bridge
- feature flags and policy snapshot contract

### Slice 2: Desktop Package Registry, Signing, and Revocation

Focus:

- package manifest format
- signature verification
- revocation feed
- compatibility range checks
- built-in vs org-verified vs local-unverified trust classes

Why next:

- Pi and Agency Swarm integration should not land on top of an undefined package trust model

Key outputs:

- registry/download endpoints
- signing service
- materializer inputs/outputs
- provenance and trust-taint rules

### Slice 3: Local File Intelligence and Managed Workspace Profiles

Focus:

- managed local roots
- metadata/full-text/preview indexing
- staged attachments
- workspace profile generation
- writeback and egress policy

Why next:

- this turns the current raw Tauri primitives into a governed local substrate

Key outputs:

- local file service/indexer
- workspace manager
- approval matrix for mounts/writes/escalation

### Slice 4: Pi Runtime Host and Desktop Run Router

Focus:

- Pi integration mode
- tool adapter layer
- gateway-only provider injection
- runtime selection rules
- truthful run labels

Why next:

- this is the first feature slice that makes the desktop-host product feel materially different to users

Key outputs:

- Pi runtime host
- router service
- run-label matrix

### Slice 5: Agency Swarm Desktop Runtime and Connector Runtime

Focus:

- agency pack materialization
- desktop-local swarm runtime
- connector runtime adapters
- hybrid Pi-to-Agency flows

Why next:

- this completes the multi-agent local execution story after the Pi foundation is stable

Key outputs:

- agency runtime host
- connector runtime
- connector secret scoping

### Slice 6: Unified UX, Offboarding, and Enterprise Hardening

Focus:

- first-run bootstrap
- Open in Desktop / View on Web
- signed updater chain
- audit and DLP hooks
- device cleanup and offboarding

Why last:

- these are cross-cutting hardening and polish layers that benefit from the earlier contracts being stable

Key outputs:

- cross-surface handoff UX
- update trust chain
- offboarding automation
- rollout gates and regression suite

### Slice 7: OmniVoice Provider Contract and Gateway

Focus:

- internal TTS provider support for OmniVoice
- provider capability and validation contracts
- stable backend error handling
- compatibility with existing TTS providers

Why here:

- Feature 075 foundations should land first so OmniVoice inherits the correct trust and rollout posture instead of creating a parallel voice path

Key outputs:

- `omnivoice` provider support in internal TTS routes
- shared capability metadata
- validation for plain TTS vs cloning inputs

### Slice 8: OmniVoice Media Narration and Voice Assets

Focus:

- presentation narration
- multilingual voice assets
- approved reference-audio cloning flows
- media model registry and UI exposure

Why next:

- this is the highest-value product use case and avoids making desktop packaging the first blocker

Key outputs:

- OmniVoice-backed audio models
- narration workflow support
- cloning provenance metadata

### Slice 9: OmniVoice Desktop Premium Readback

Focus:

- optional desktop-local OmniVoice runtime
- capability-gated premium spoken readback
- native TTS fallback preservation

Why after server/media:

- local packaging, model/runtime prep, and device capability checks are more operationally complex than server-side provider work

Key outputs:

- Desktop Host runtime adapter
- capability and policy surfaces
- trusted package/materialization path

### Slice 10: OmniVoice Governance and Rollout Closure

Focus:

- rollout flags
- cloning policy controls
- audit/provenance
- regression and truthfulness coverage

Why last:

- this slice closes the loop across backend, media, and desktop once all concrete execution paths are known

Key outputs:

- phase gates
- audit and provenance rules
- regression matrix

## Suggested sequencing rules

1. Do not start Pi runtime integration before device identity and package trust are settled.
2. Do not make managed local file discovery widely available before root governance and parser isolation are in place.
3. Do not enable org rollout before signed updater and revocation freshness rules are implemented.
4. Do not let Agency Swarm desktop work invent a second package lifecycle separate from Slice 2.

## Suggested ownership map

| Slice | Primary teams |
|---|---|
| Slice 1 | Web control plane, auth, desktop platform |
| Slice 2 | Web platform, skills/runtime, security |
| Slice 3 | Desktop platform, security, infra |
| Slice 4 | Desktop platform, runtime, gateway |
| Slice 5 | Runtime, agency, connectors, desktop platform |
| Slice 6 | Product UX, security, admin/platform, QA |
| Slice 7 | Web platform, backend/runtime, security |
| Slice 8 | Media, presentation UX, backend/runtime |
| Slice 9 | Desktop platform, runtime, security |
| Slice 10 | Product UX, security, QA, admin/platform |

## Suggested planning mode for each slice

- Slice 1: standard deep-plan
- Slice 2: standard deep-plan
- Slice 3: standard or promoted deep-plan depending on parser/indexer scope
- Slice 4: standard deep-plan
- Slice 5: promoted deep-plan if Agency Swarm packaging is still unclear
- Slice 6: standard deep-plan with rollout and QA emphasis
- Slice 7: standard deep-plan
- Slice 8: standard deep-plan
- Slice 9: promoted deep-plan if local runtime packaging or model distribution is still unsettled
- Slice 10: standard deep-plan with rollout and QA emphasis

## Recommended next action

If the team wants to move immediately, start with:

1. Slice 1: Desktop Device Identity and Policy Bootstrap
2. Slice 2: Desktop Package Registry, Signing, and Revocation
3. Slice 3: Local File Intelligence and Managed Workspace Profiles

That order gives the rest of the platform a secure substrate instead of building runtimes first and retrofitting governance later.

For OmniVoice specifically, start only after the above substrate slices are stable:

1. Slice 7: OmniVoice Provider Contract and Gateway
2. Slice 8: OmniVoice Media Narration and Voice Assets
3. Slice 9: OmniVoice Desktop Premium Readback
4. Slice 10: OmniVoice Governance and Rollout Closure
