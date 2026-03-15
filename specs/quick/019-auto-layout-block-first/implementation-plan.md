# Implementation Plan

## Objective
Turn Auto Layout into a block-first system with hidden legacy template UX.

## Approach
1. Client:
   - change Auto Layout dialog from template chooser to block-layout chooser
   - remove user-facing access to legacy template options
   - update copy to reflect block-first behavior
2. Server:
   - make relayout recipe selection canvas-aware
   - prefer built-in block candidates first
   - route legacy template fallbacks through mapped block layouts before internal plain-template fallback
3. Tests:
   - update Auto Layout UI tests
   - update relayout fallback tests
   - add regression coverage for hidden legacy templates and block-first fallback

## Acceptance Criteria
- Auto Layout dialog no longer exposes legacy template choices
- Auto Layout payload prefers `componentRecipeId` and does not expose plain-template choice in UX
- Relayout server chooses a built-in block when a suitable one exists, including mapped legacy fallbacks
- Warnings/user-facing copy avoid `plain template` phrasing in the main UX
