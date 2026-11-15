# Focused test plan

- Authenticated App routing mounts the prototype only on permitted dev hosts and leaves `/chat` unchanged; non-dev host path falls back to Chat.
- Workspace/project, view tabs, Agent/Harness/Runner/status filters, sorting, execution selection and `?execution=` restore all update visible fixture rows without calling fetch.
- Mission Detail shows one Mission with multiple canonical Job IDs, distinguishes Jobs from Runs, and completed fixture links artifact IDs.
- Execution with `agentId: null` and `runId: null` renders “Not reported”; unavailable terminal/diff/browser/usage/receipt/verification panels remain explicitly unavailable.
- All inspector tabs and local Chat/Task Control preview/return controls work.
- Theme (Light/Dark/Balance), Simple/Developer disclosure and loading/error/empty/offline/failed states are interactive.
- Keyboard can reach primary navigation, filters, execution list, inspector tabs, drawers, and close buttons; accessible labels/expanded state are present.
- CSS supports 1440×900, 820×1180 and 390×844 with no document-level horizontal overflow. Browser screenshots provide visual proof.
