# Section 04: Agent Skill Memory Picker and Citations

## Objective

Let skill owners explicitly attach approved Library context packs to agent skills, preview runtime context impact, and preserve citations through execution.

## Scope

- skill configuration contract for context packs
- UI picker for approved packs
- runtime request builder integration
- token/citation preview
- delegated worker grant creation
- execution trace and artifact citation display

## Likely Files and Modules

- `apps/web/client/src/components/chat/settings/SkillSettings.tsx`
- `apps/web/client/src/components/chat/skill/SkillSelector.tsx`
- `apps/web/client/src/components/agency/agencySkillExport.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/services/workerDelegationService.ts`

## Implementation Guidance

### 1. Add explicit skill memory config

- Add optional skill setting:
  - `libraryContextPackIds`
  - `requiredLibraryContextPackIds`
  - `optionalLibraryContextPackIds`
  - per-pack runtime tier override only if product needs it
- Validate only active, trusted, approved-for-agents packs can be selected for agent runtime by default.
- Preserve pack order for runtime assembly.

### 2. Add pack picker UI

- Show approved packs with:
  - title
  - slug
  - readiness status
  - approved-for-agents state
  - estimated token hint
  - source mode
  - freshness/stale warnings
- Hide or disable unapproved packs with clear reason.
- Allow skill owner to require or optionally include a pack.

### 3. Add runtime preview

- Preview should show:
  - selected packs
  - expected runtime tier
  - estimated tokens
  - max items
  - citations available
  - diagnostics
  - required pack failure behavior
- Preview must not fetch raw markdown beyond what the actor is allowed to see.

### 4. Wire runtime builder

- Convert skill config into explicit `libraryContextPacks` input for `build_context_pack`.
- Required pack failure aborts request construction.
- Optional pack failure surfaces diagnostics.
- Keep navigation-first semantics: do not auto-expand graph or backlinks.

### 5. Preserve citations through execution

- Runtime slots should retain:
  - context pack ref
  - library item ref
  - citation excerpt/source ref
  - freshness
  - trust tier
- Execution UI or artifacts should show "used memory" citations when available.

### 6. Delegated worker grants

- When skill execution is delegated, derive `library_context_pack` grants from selected pack ids.
- Do not grant raw `library_item` access unless explicitly requested separately.

## Test-First Checklist

- Test: skill config accepts explicit approved context pack ids.
- Test: untrusted or unapproved packs cannot be selected for runtime.
- Test: runtime request builder maps skill pack ids into `libraryContextPacks`.
- Test: required pack failure aborts request.
- Test: optional pack failure becomes diagnostics.
- Test: citations survive into context slots.
- Test: delegated worker manifest includes pack grants but not raw-note grants.

## Acceptance Checkpoints

- Skill owners can intentionally choose business memory.
- Runtime context remains explainable and citation-backed.
- Delegated executions remain least-privilege.
