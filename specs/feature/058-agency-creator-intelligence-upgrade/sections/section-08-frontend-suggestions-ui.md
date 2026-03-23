# Section 08: Frontend Suggestions UI

## Goal
Show post-creation improvement suggestions in AutoCreateAgencyModal + Save as Template button.

## Actual Implementation

### Files Modified
- `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` — Main UI changes
- `apps/web/server/routers/agency.ts` — Extended `autoCreateStatus` return type with suggestions
- `python-backend/app/api/agency_creator.py` — Merge suggestions into status response, strip `change` field

### Changes Made

1. **Suggestions state**: Added `suggestions`, `dismissedSuggestions`, `showTemplateDialog`, `templateName`, `templateDesc`, `createdAgencyId` state variables.

2. **Polling integration**: On `status === "completed"`, suggestions are parsed from the response and stored in state. The Python endpoint now merges suggestions from the separate Redis key into the status response, with the `change` field stripped for F03 security.

3. **Suggestion cards**: Rendered in the completion view with category/impact badges. Currently read-only (informational) — Skip/Dismiss flow only. The `applySuggestion` tRPC procedure is deferred (requires whitelisted backend mutations per F03).

4. **Save as Template dialog**: Inline form with name + description fields, calls `trpc.agency.saveAsTemplate.mutate()`.

5. **Phase stepper**: Updated to `discover → plan → review_plan → design → review_design → validate → implement → suggest → document → done`. Removed "interview" phase (no longer shown to users).

6. **Navigation flow**: `onCreated` is now user-triggered (via "Open in Agency Editor" button) instead of automatic, so users can review suggestions before navigating.

7. **tRPC type**: Added `hasSuggestions`, `suggestions` to `autoCreateStatus` return type.

### Deviations from Plan
1. **No `Apply` button**: Spec §4 described `handleApplySuggestion` calling `trpc.agency.applySuggestion.mutate()`. This requires a backend tRPC procedure with whitelisted mutations that doesn't exist yet. Suggestions are read-only/informational, which is the safer default per F03.
2. **`change` stripped server-side**: Instead of a Zod parse in the tRPC layer, the `change` field is stripped in the Python endpoint before it reaches the Node.js layer.
3. **`onCreated` deferred**: Modal stays open after completion to show suggestions, user clicks to navigate.

## Tests
File: `apps/web/client/src/components/agency/__tests__/AutoCreateSuggestions.test.tsx` (5 tests)

- Component renders in idle state with input and create button
- Suggestion data structure validation
- dismissedSuggestions Set tracking
- Template UI hidden in idle state
- Phase stepper presence
