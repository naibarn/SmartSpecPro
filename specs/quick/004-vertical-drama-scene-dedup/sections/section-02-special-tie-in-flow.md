# Section 02 — Special Tie-in flow

Ownership: Special Tie-in contract, marketplace idea selection/router, worker/recovery, and dialog.

Return candidates when an idea's scene label is near an existing roster row. Add an ownership-checked decision endpoint. Show the candidate choice in the dialog, allow explicit create-new, and persist the resolved canonical `sceneLocationKey` into the input. All worker and recovery paths read that key first.

UI/UX Contract:

- Target user: Vertical Drama creator selecting a Marketplace Tie-in idea.
- States: no candidate, candidates awaiting decision, existing scene selected, new scene selected, mutation error.
- Accessibility: named buttons, visible selected state, keyboard-operable choice, Thai/English copy.
- Browser evidence: focused component tests; authenticated browser replay remains optional after local proof.

Risk: do not block location/store reference workflows that already carry an explicit location provenance key.
