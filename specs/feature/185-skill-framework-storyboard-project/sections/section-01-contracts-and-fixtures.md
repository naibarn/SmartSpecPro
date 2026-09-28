# Section 01 — Contracts and fixtures

## Goal

Create the shared, provider-free contract boundary for the Skill Framework storyboard flow. Every later section consumes these types; this section must not perform database or provider work.

## Files and ownership

- Add `apps/web/server/services/storyboardSkillFrameworkContracts.ts`.
- Add `apps/web/server/services/__tests__/storyboardSkillFrameworkContracts.test.ts`.
- Keep all user-provided JSON behind Zod parsing and redaction helpers.

## Required contracts

Export schemas/types for `storyType` (`mime`, `dialogue`, `hybrid`), `runStatus`, `shotStatus`, `projectStatus`, global draft, model selection, managed reference, skill snapshot, planned shot, canonical skill response, generation request, video prompt, retry request, character binding, library revision, interop manifest, and safe error envelope.

`totalShots` is an integer in `[2, 12]`, default `9`; `shotDurationSec` is `10`; `outputAspectRatio` is `9:16`. The idea is required and trimmed. Mime requests have no dialogue lines. Dialogue and hybrid lines validate speaker, text, and language. Reference asset IDs are unique and contain `0..5` items.

## Determinism and safety

Normalize aliases, ordering, defaults, and model options before hashing. A confirmation fingerprint is derived from the normalized snapshot, never raw client ordering. Redaction must remove provider URLs, access tokens, and unbounded prompt-debug data while retaining the canonical prompt and request for audit. Helpers are pure and deterministic.

## Tests first

Cover defaults, 2/9/12 boundaries, invalid 1/13/fractional counts, fixed duration, story/dialogue rules, duplicate references, bounded title/context, fingerprint stability, and redaction. Fixtures must include Cute Child v3 canonical response with both `generation_prompt` and the complete `generation_request`.

## Completion evidence

Run the focused Vitest file and record the command/result in this section file. Do not mark this section complete if later code needs `any` to cross this boundary.

## UI/UX Contract

### Target User / JTBD
Creator needs a predictable contract for turning an idea into a reusable storyboard.

### Surface Inventory
Wizard fields, validation, progress metadata, and project-character tabs consume these contracts.

### Component Map
This module owns data/state types; registry, wizard, and review own rendering.

### State Matrix
Fields support loading, empty, invalid, valid, dirty, submitting, and server-error states.

### Responsive Matrix
Consumers support 320px through wide desktop without hiding validation.

### Accessibility Acceptance
Every required field has a stable label/error key and non-color status.

### Copy Contract
Consumers localize stable validation error codes in Thai and English.

### Browser Evidence Required
Boundary tests prove the same invalid/valid states on mobile and desktop.
