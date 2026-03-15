# Decision Log

- Planning depth: `micro`
- Keep relayout API shape unchanged
- Implement block-first behavior by:
  - removing legacy template options from the main Auto Layout dialog
  - making relayout recipe selection canvas-aware
  - adding legacy-template-to-block fallback routing before internal plain-template fallback
- Retain internal plain-template generation only as a last-resort safety path
