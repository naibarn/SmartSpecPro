# Section 02: Normal Candidate Flow

## Goal

Prevent age drift in the existing Visual Bible candidate-batch path while preserving
candidate diversity, lead-quality checks, credits, and downstream selection behavior.

## Implementation scope

- Resolve the age profile once before building the 1–5 candidate prompt.
- Include a server-authoritative shared age directive in the Visual Bible input/prompt.
- Require all candidate DNA and portrait prompts to remain within that same range and
  explicitly forbid age-up/age-down by candidate index.
- Validate candidate `age_range` values against the shared profile before provider task
  submission; use existing bounded retry/fail-closed behavior on drift.
- Preserve age evidence when legacy approved DNA is stripped only to unlock a new face
  for no-primary recasting.
- Store the normalized profile/range in candidate metadata/snapshots and preserve it
  on primary selection.

## Files

Primary files are `verticalDramaCharacterImageGeneration.ts`, existing character profile
and candidate metadata contracts, `verticalDramaCharacters.ts` only where the normal
preview/submission branch needs the profile, and focused service/router tests.

## Tests before implementation

- Shared age directive appears for counts 1, 3, and 5.
- Five candidates with compatible ranges pass.
- One candidate with material age drift is rejected/retried.
- Existing lead/anti-clone/role-tier validation remains active.
- Legacy DNA recast preserves age but unlocks face identity.
- Candidate selection persists age range and leaves siblings non-primary.

## Completion proof

Focused image-generation and router Vitest suites pass without changing no-reference
candidate count, image-task, polling, or selection semantics.

## UI/UX Contract

### Target User / JTBD
N/A — this section owns server candidate prompting and validation.

### Existing Pattern Reference
N/A — client reuse and visual behavior are defined in section 04.

### Surface Inventory
N/A — no direct browser markup.

### Component Map
N/A — service/router boundary only.

### State Matrix
N/A — server validation outcomes are covered by service/router tests.

### Responsive Matrix
N/A — no layout change.

### Accessibility Acceptance
N/A — no new control; client contract is covered in section 04.

### Copy Contract
N/A — server returns bounded diagnostics; localized copy is defined in section 04.

### Browser Evidence Required
N/A — provider/browser evidence is tracked in section 04.
