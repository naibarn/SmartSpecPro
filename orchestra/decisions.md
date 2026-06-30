# Orchestra Decisions

[2026-06-30T17:00:00Z] DECISION: Use direct-standard-light visual UI flow.
  Context: The active platform is standard, the task is scoped to dashboard UI/test files, and no explicit sub-agent delegation was requested.
  Alternatives considered: multi-agent visual UI wave; rejected as unnecessary overhead for the two-file direct fix.

[2026-06-30T17:00:00Z] DECISION: Keep content visibility independent from the desktop sidebar media query.
  Context: Tablet completeness requires dashboard sections to render below 1280px.
  Alternatives considered: lowering the desktop breakpoint; rejected because it would force the fixed sidebar onto tablet instead of improving tablet usability.
