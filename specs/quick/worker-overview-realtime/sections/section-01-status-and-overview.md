# Section 01 — status and overview

Ownership: Worker App React shell, top bar, canonical route screen, and existing health polling in `apps/worker-app/src/main.tsx`.

Implement structured connection presentation, five-second health refresh, all-job Overview aggregation, localized copy, and focused tests. Do not change server schemas or destructive queue actions.

Acceptance: header has truthful status/expiry/reconnect guidance; Overview shows live active/queued/failed/stalled information and navigates to Queue; all existing checks pass.

UI/UX Contract: target user is a Worker operator who needs to know whether this machine can accept work without opening multiple screens. The active shell, header, and Overview are the primary surfaces. States include loading, connected, pending, disconnected, reconnect-required, transient outage, stale data, idle, processing, queued, failed, and empty. English/Thai copy must be parallel. Use existing panel/status tokens. Browser evidence is recommended for packaged UI but is not available in this local pass.
