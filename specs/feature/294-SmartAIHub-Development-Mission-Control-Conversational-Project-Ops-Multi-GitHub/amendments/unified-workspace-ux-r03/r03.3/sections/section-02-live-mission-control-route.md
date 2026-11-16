# Section 02 — Separate live Mission Control route

Deliverable: authenticated `/dev/mission-control-live`, explicit LIVE read-only mode, workspace selector, canonical Mission/Job selection, exact Task deep link and safe context return. Keep R03.2 routes and UI fixtures unchanged. Show data provenance and unavailable Harness/runtime evidence; no demo fallback.

Scope: `smartaihub-platform/apps/saas-shell/src/App.tsx`, new shell page/client module, page tests; reuse R03.2 visual system/layout. No mutation calls.

Prerequisite: Section 01 Core route. Live API request must send the workspace header and rely on server reauthorization. Browser storage may carry selection context only.

Known gap: current Core Task projection leaves Harness/Run unavailable. Do not claim genuine Harness acceptance without a canonical record.
