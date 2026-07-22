# Orchestra Backlog

- [IN SCOPE] Implement every acceptance criterion in the approved SocratiCode lifecycle hardening design.
- [IN SCOPE] Preserve a timestamped runtime backup and exact restore commands.
- [IN SCOPE] Add focused cleanup/watchdog tests and post-rollout stability evidence.
- [EXTERNAL OPTIONAL] Configure an external alert webhook after an endpoint is supplied; lifecycle prevention must not depend on this credential.
- [COMPLETE PLAN] Produce the Windows Docker Desktop SocratiCode migration
  runbook, evidence manifest, handoff, and execution sections.
- [DEFERRED EXECUTION] Windows Codex performs the migration only after explicit
  user authorization and passes G0-G11.
- [DEFERRED DESTRUCTIVE] Delete retained server/Windows artifacts only in a new
  explicitly approved cleanup task after the 7-14 day retention window.
- [COMPLETE] Repair Hermes claim selection and both central/desktop control-job
  event state machines.
- [COMPLETE] Publish and verify Worker App 0.1.131.
- [EXTERNAL USER STEP] Install Worker App 0.1.131, approve xAI OAuth in the
  browser, then run the Hermes capability probe.
