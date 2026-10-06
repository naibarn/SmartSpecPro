# Section 04: Dialog and Wizard UX

## Objective

Make the distinction and failure states understandable, editable, cancel-safe,
responsive, and accessible.

## Owned paths

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaPromptExpansionDialog.tsx`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- existing UI primitives and focused component tests

## UI/UX contract

The dialog shows three labelled regions: original premise, editable AI
treatment, and a concise Draft handoff. It must explicitly say the treatment is
not the Draft. Story fields render as sections for leads/meeting/relationship,
conflict/cost, central question, turning point/climax, ending/hooks, tone,
assumptions, exclusions, and verification. Non-story profiles render their own
fields only.

State matrix: idle, loading, structured success, rejected/failed,
stale, and applied. Loading keeps the original visible and permits cancel.
Success permits edit/retry/apply/cancel. Rejected shows no expansion text,
displays the exact sanitized reason and trace ID, and offers retry/cancel.
Stale preserves edits and asks for a fresh preview. Applied confirms approval
and points toward Draft.

Keep the existing 2,000-character counter and over-limit CTA lock. Apply must
be disabled for rejected results and explain why. Applying stores a separate
lineage object; editing generated content marks user provenance. Retry/cancel
must never overwrite the original premise.

Preflight/provider/parse/quality errors must render the concrete error message
and never render deterministic fallback content or an Apply button.

Responsive acceptance at 390x844, 768x1024, and 1440x900: readable wrapping,
reachable actions, no horizontal overflow, no clipped Thai/English text, and
scrollable long treatment content. Keyboard focus is trapped, Escape cancels,
labels are associated, and status/warnings expose correct status/alert semantics.

## TDD stubs

Extend jsdom tests for every state, original/generated distinction, treatment-
not-Draft copy, edit provenance, retry/cancel/apply guards, over-limit lock,
long-text wrapping, labels, focus, and status announcements.

## Completion gate

A component test can drive the full state matrix without relying on timing
accidents, and browser proof confirms the modal remains usable at all three
sizes with keyboard-only interaction.
