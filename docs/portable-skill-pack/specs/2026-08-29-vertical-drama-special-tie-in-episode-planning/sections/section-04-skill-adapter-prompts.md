# Section 04 — Skill adapter and prompt ownership

## Goal

Run `idea-to-video-prompt` as the sole creative author for special start-frame and video
prompts.

## Owned files

- `apps/web/skills/idea-to-video-prompt/SKILL.md`
- its input/UI/output schemas and rules, only for additive special contract changes
- new special skill adapter/validator service and tests

## Implementation

- Add special-only 12-second support, max-5,000 idea, explicit 9:16, cast/lock/reference
  metadata, and exact one-to-five shot output constraints. Keep normal duration profiles
  unchanged.
- Load skill files in stable order and validate both input and structured output.
- Map managed references to stable skill IDs and execution-only authorized URLs.
- Pass selected episode-local model capabilities; never read/write normal model memory.
- Map each returned shot directly to one start-frame prompt and one video prompt, with
  exact duration and dialogue semantics. Do not pad to nine.
- On semantic violations retry the whole skill output at most twice with compact violation
  codes; fail terminally with typed error afterward. Do not append creative prose or
  marker blocks in server code.
- Persist assumptions, quality controls, skill version, provenance, output version, and
  model snapshot.

## TDD

Test file loading, schema validation, 12-second special-only behavior, URL separation,
locks, dialogue mapping, exact shot cardinality, retry cap, malformed output, prompt
equality, and absence of server creative suffixes.

## Acceptance

Provider-facing prompt text is exactly skill-authored output (after structural mapping
only), and special output is ready for existing start-frame/video controls.

## UI/UX Contract

### Target User / JTBD
N/A — skill/runtime boundary; prompt presentation is owned by sections 06–07.

### Existing Pattern Reference
N/A — no UI is authored here; shared prompt editor reuse is specified in section 07.

### Surface Inventory
N/A — no route or dialog changes.

### Component Map
N/A — adapter and validator are server-side.

### State Matrix
N/A — typed adapter failures are consumed by API/UI sections.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no controls are added.

### Copy Contract
N/A — skill output and error taxonomy are passed to the owning UI section.

### Browser Evidence Required
N/A — prompt display evidence is recorded by sections 06–08.
