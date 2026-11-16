# Implementation Spec — Unified Workspace UX R03

Build isolated, authenticated DEV preview surfaces using the existing React shell and canonical contracts. Shared shell provides a concise SmartSIHub header, DEV/DEMO disclosure, workspace/project context, mode/theme controls, navigation between previews, and responsive navigation/inspector controls. Do not intercept `/chat` or any query variant; actual Chat remains owned by `ChatPage` and preserves all existing runtime behavior.

Task Control uses an actual project-first hierarchy (projects, goals, tasks, runs/attempts), a center execution work area with selectable evidence tabs, and a contextual inspector. Local synthetic fixtures add realistic work plan, transcript, tool call, terminal stdout/stderr, tree/diff, tests, artifacts, decision, verification and runtime diagnostics without implying live state. Expandable evidence uses a wide center/dock treatment.

Mission Control uses a different fleet-oriented information architecture: fleet counts, Harness and Agent groupings, Runner readiness/freshness, concurrent session tabs, waiting/attention queue, Mission→Jobs→Runs hierarchy, history and shared execution inspector. Switching sessions preserves the selected execution. All actions are local presentation interactions; no dispatch/mutation.

Support explicit routes `/dev/mission-control-prototype` and `/dev/task-control-prototype` only on the approved DEV host. Keep links/query identity stable across area navigation. Use shared Astryx shell/components/tokens where applicable, existing design conventions, semantic landmarks, keyboard focus, and a responsive contract for desktop/tablet/mobile.

Definition of Done: separate recognizable views; each documented demo workflow works; `/chat?view=missions|tasks` still renders Chat; screenshots at required viewports or a precisely recorded browser blocker; task/mission requirement mapping and Codex evidence parity/integration plan documented; focused tests and production bundle build pass; deployment limited to `modular-debian-dev`; no SPEC is marked complete.
