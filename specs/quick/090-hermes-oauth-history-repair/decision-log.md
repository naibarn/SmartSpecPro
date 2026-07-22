# Decision log

- Depth: standard, three implementation sections.
- Keep `env_clear()` and allow-list only non-secret OS path variables.
- Preserve `HERMES_HOME` isolation; do not inherit the complete Worker App
  environment.
- Use client-side five-row progressive disclosure because connection volumes
  are small and the existing list contract is shared by media pickers.
- Filter the admin presentation to `server_shared`; do not change admin API
  authorization in this repair.
- Release as Worker App 0.1.132 and raise only the desktop protocol gate.

Five review rounds checked completeness, contradictions, security, obvious
improvements, and test coverage. Rounds four and five produced no meaningful
auto-fix items.

