# Section 01 — Role-aware prompt contract

## Goal

Make the existing start prompt authoring produce an opening visual beat and add
an explicitly separate stop prompt authoring contract. Both roles must share
the same canonical shot/reference/composition facts and must not reinterpret
characters from synopsis prose.

## Owned files

- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- the two case variants of the start-frame prompt skill and the selected
  cinematic/policy-safe skill files under `apps/web/skills/`
- role-aware output schemas/fixtures adjacent to the existing skill assets
- focused service/schema tests

## Contract

## Implementation status

Complete. The existing skill invocation now receives an explicit `start` role;
the same executor supports an explicit `stop` role with start-prompt context.
Legacy Start output remains accepted, while Stop requires contract version 2.

Introduce one internal `FrameRole = "start" | "stop"` and a normalized
single-shot v2 result:

```ts
{
  contract_version: 2,
  frame_role: "start" | "stop",
  prompt: string,
  negative_prompt: string,
  semantic_handoff?: {
    opening_moment?: string,
    terminal_moment?: string,
    story_meaning?: string,
    continuity_locks: string[],
    source_revision: string,
  },
  analysis?: Record<string, unknown>,
}
```

Start legacy v1 output remains accepted only for existing start callers and the
nine-shot batch. New start single-shot calls stamp role `start`; stop calls
require v2 and role `stop`. The persisted prompt itself remains a complete
visual prompt, not a synopsis.

## Authoring rules

- Start: select the earliest useful frozen visual beat before the irreversible
  action/decision; exclude later actions that belong to Stop.
- Stop: select the terminal frozen beat or immediate aftermath, use the current
  start prompt and semantic handoff as continuity anchors, and do not invent a
  new location, cast, wardrobe, prop, or camera grammar.
- Thanwa fixture: Start ends at him moving through the dawn fish market while
  evading pursuers; Stop contains phone shutdown, hiding it in the empty ice
  crate, and temporarily abandoning CEO identity.
- `policy_safe_rewrite` remains synopsis-only. Its rewritten synopsis is never
  persisted as `imagePrompt`.
- Source precedence is canonical summary, persisted snapshot, then a marked
  legacy start prompt fallback. Do not silently truncate user/current prompts;
  fail explicitly if model context cannot fit the full stop handoff.
- Persist bounded handoff metadata and hashes, never raw prompt text in logs.

## Test-first stubs

- Thanwa start/stop semantic split.
- Role/version/malformed/truncated output validation.
- 6,000-character start prompt byte-preserving input.
- Legacy v1 start compatibility and stop v2 rejection of role mismatch.
- Safety rewrite event ordering.

## Dependencies and outputs

Exports normalized role/result and handoff helpers for Section 02. It must not
change start button behavior or the existing nine-shot response envelope.

## UI/UX Contract

### Target User / JTBD

No UI owned here; the creator's job is represented by the role contract
consumed by the storyboard.

### Surface Inventory

No surface changes. Section 04 owns the shot-card surfaces.

### Component Map

No components. Exported role/result helpers are consumed by server procedures.

### State Matrix

No client state. Invalid role/output becomes a server job error without partial
UI persistence.

### Responsive Matrix

Not applicable; no layout changes.

### Accessibility Acceptance

Not applicable; Section 04 owns accessible labels and focus behavior.

### Copy Contract

No user-facing copy is added here.

### Browser Evidence Required

No browser evidence owned here; verify through Section 04 integration.
