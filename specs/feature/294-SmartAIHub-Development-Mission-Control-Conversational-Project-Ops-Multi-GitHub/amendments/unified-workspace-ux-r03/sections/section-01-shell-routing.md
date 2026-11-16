# Section 01 — Shared Shell and Explicit Routes

- Requirement IDs: UXR03-01, UXR03-05.
- Objective: share DEV workspace chrome and remove Chat query interception.
- Owned Platform paths: `apps/saas-shell/src/App.tsx`, `apps/saas-shell/src/pages/MissionControlPrototypePage.tsx`, its CSS; route tests.
- Prerequisites: inspect current Router, Astryx shell/component API and Chat navigation contracts.
- Deliverable: shared shell with separate explicit DEV route entry; normal `/chat` remains Chat for every query string; selected demo identity retained on navigation.
- Completion predicate: focused route tests prove both preview paths and Chat query routes; shell uses accessible responsive landmarks and clear DEMO disclosure.
- Verification/evidence: saas-shell test; source SHA and route test output.
- Fallback/blocker: use shared existing shell React components if full AppShell integration conflicts with Chat; never intercept Chat.
- Deployment/acceptance: prototype only, no live view replacement.
