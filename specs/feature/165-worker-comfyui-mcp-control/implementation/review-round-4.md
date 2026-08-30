# Implementation review round 4 — Worker UI and observability

Scope: navigation, Comfy profile UI, bilingual copy, and Overview/Queue job
visibility.

Findings and closure:

- Added a dedicated Sidebar ComfyUI route with list/detail profile actions:
  add, edit, activate, disable, probe, set secret, and delete secret.
- Transport, credential type, endpoint, revision, probe, expiry, and workflow
  discovery states are represented without rendering secret values.
- Overview now polls the authoritative Server job projection every three
  seconds and places active jobs above the dashboard cards. It shows job ID,
  type, phase, progress, created time, Series, workflow, and waiting count.
- Queue retains Series-specific mutation actions while the authoritative
  projection covers Comfy, Remotion, media, Hermes, and future worker lanes.
- Thai/English Worker route copy and new Comfy controls are provided; the
  connection error state remains explicit when the token lacks the read scope.

Proof: `npm --workspace apps/worker-app run typecheck` passed. Browser/WebView
interaction and real server polling still require an environment run.
