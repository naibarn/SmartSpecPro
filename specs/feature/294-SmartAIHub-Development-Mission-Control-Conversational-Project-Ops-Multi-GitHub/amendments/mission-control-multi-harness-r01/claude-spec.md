# Implementation spec — Mission Control multi-Harness workbench

Implement SPEC-294 R1.8 §61 using the existing canonical Task Control, worker_jobs/outbox, Runner, and durable execution-event authorities. Mission Control is a multi-session operations workbench with stable per-execution tabs, honest fleet state, live event replay and an obvious path to start another task through Task Control. Never add another scheduler, job store, approval path, or simulated event. Current start/stop/retry support is only exposed when the relevant canonical APIs actually support it.

Acceptance: select and revisit multiple real Jobs by tabs; preserve selection on reload/deep link; show latest observed activity, verified Runner/Harness/Model identities and freshness; replay durable output while a tab is selected; distinguish online/trusted/dispatchable; navigate to exact Chat/Task Control; ten-or-more entries are searchable/navigable and mobile-accessible; existing authorization and job identity remain unchanged.

Known boundary: arbitrary Harness dispatch from Mission Control is not yet demonstrated in runtime. Until a canonical generic start authority exists, “New task” opens the existing Task Control flow; do not claim inline dispatch or multi-harness live acceptance.
