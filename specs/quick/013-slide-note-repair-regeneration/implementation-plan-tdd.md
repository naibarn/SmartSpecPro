## Tests First

1. Server service test:
   - repairs one slide from saved note
   - updates title/body from note
   - generates image media and AI design metadata
2. Router test:
   - `presentation.ai.repairSlideFromNote` loads the slide, updates it, and returns warnings
3. Editor test:
   - Slide Note dialog exposes repair action
   - dirty note is saved first
   - repair mutation is called
   - undo restores the pre-repair canvas state

## Regression Focus

- Existing auto-layout undo behavior must not regress.
- Slide-note save flow must remain intact.
- Missing saved note should keep the repair action disabled or guarded.
