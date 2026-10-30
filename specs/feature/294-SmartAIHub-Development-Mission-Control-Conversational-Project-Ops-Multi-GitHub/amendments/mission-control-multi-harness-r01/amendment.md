# Mission Control Multi-Harness Workbench — R1

This plan implements the normative [SPEC-294 section 61](../../spec.md#61-r18--mission-control-multi-harness-operations-workbench). Mission Control must be an operational workbench over canonical Goal/Job/Runner authorities, not a Runner inventory page. It must support per-execution tabs, actual event output, honest readiness, and a clear path to start another canonical task.

## Accepted product behavior

- One tab maps to one real canonical Job/Run/Attempt/Session; tabs are selected by stable execution identity and closing a tab never stops work.
- Fleet inventory is sorted by latest observed activity and presents online, trust, snapshot freshness and dispatch readiness as distinct facts.
- Selecting a run streams/replays actual durable output; no generated progress is shown as execution output.
- “New task” enters the existing Task Control Start/Goal Admission flow; the exact selected Runner/Harness/Model must remain pinned when that flow supports the corresponding verified capability. No second queue or dispatch path is introduced.
- Existing supported Job controls remain the only state mutations. Read-only/missing capability is explained, not disguised as a working control.
- At least ten visible executions remain navigable by tabs with overflow, filter and selected-session URL persistence; mobile uses a session picker.

## Implementation sections

1. Fleet state and selection — make accurate readiness counts, recent activity ordering, stable selected Job query state and “New task” navigation using the current authorized read-model.
2. Multi-session workbench — add tab/overflow navigation for canonical Jobs, retain exact session selection and show live durable events for the selected execution in Developer mode.
3. Safe canonical controls and verification — wire only already-supported actions, prove cross-session separation and readiness copy with focused UI/API tests, update canonical handoff with what works and what remains.

## Boundaries and non-goals

No new scheduler, event store, Job schema, approval authority, Runner protocol, provider/model catalog, production deployment, or simulated output. Server support for starting arbitrary harness jobs is not assumed; this amendment exposes the existing authorized Task Control flow until that authority is verified. A real multi-harness concurrent end-to-end acceptance remains open unless live authorized executions and Runner receipts exist.
