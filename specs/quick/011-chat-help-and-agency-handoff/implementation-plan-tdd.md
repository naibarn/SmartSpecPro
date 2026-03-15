# TDD Plan

## Tests first

- Add a component test for the general Chat Help dialog:
  - opens from button click
  - shows sections for chat basics, skills, media generation, memory, Browser Session, Agency Swarm
- Update Chat page tests to confirm the Help entry is visible in page chrome.

## Regression checks

- Existing Browser Session Chat tests still pass.
- New Help button does not block existing Chat actions.
