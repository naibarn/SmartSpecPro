# Request

## Original user request

สร้าง spec ต่อจาก spec เดิมใน `specs/feature`

## Normalized brief

Create the next feature package in `specs/feature` that turns the current mix of:

- web control-plane features
- Tauri desktop shell capabilities
- local AI / local skill execution
- external Claw worker runtime support

into one coherent **SmartAIHub unified web + desktop agent platform** plan.

The new feature should use the provided "SmartAIHub Master Spec v10" as the primary product and security direction, but it must stay grounded in the current repository:

- continue the existing feature lineage instead of rewriting the whole roadmap from scratch
- treat the existing Tauri shell as the desktop foundation
- preserve the current worker-runtime family from Features 071-074
- define how Pi, Agency Swarm, local file intelligence, package trust, device governance, and gateway-only routing fit together
- be implementation-ready enough that engineering can decompose it into follow-on work without reopening the core architecture

## Repository-informed assumptions

- `apps/tauri-shell` already exists and exposes local Docker, PTY, file, and local skill runtime commands, so the desktop plan should evolve this surface rather than invent a second desktop app
- Features 071-074 already establish a real external worker control plane and delegated platform access, so the new feature should integrate with that runtime family rather than replace it
- local skill review and compatibility contracts already exist in `apps/web/server/services/localAiSkillPolicy.ts` and `apps/web/server/services/skillCompatibilityGate.ts`
- the current desktop shell still exposes raw absolute-path file commands and permissive Docker sandbox creation, which is useful baseline functionality but not yet the governed enterprise desktop-host model requested here
- no canonical device registry, signed skill/agency package registry, desktop materializer, or managed local file intelligence subsystem exists yet

## Constraints

- continue the numbering and folder structure style already used in `specs/feature`
- keep web as the control plane and universal surface
- keep the desktop experience aligned to the existing Tauri shell path
- keep managed LLM execution gateway-only
- keep OpenClaw as an external runtime family, not the replacement for the desktop-local runtime plan
- allow local-unverified packages only on desktop-local execution paths, never as implicit server-executable packages

## Explicit non-goals for this planning package

- implementing the feature
- replacing the current OpenClaw / worker control-plane work
- redefining the entire Local AI feature from Feature 070
- promising that the current desktop shell is already enterprise-ready as-is
- forcing raw whole-disk access or unrestricted network egress into managed enterprise mode
