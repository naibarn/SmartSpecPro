# Planning interview

## User intent captured

The user confirmed that Task Control should be the monitoring surface for
multi-step work. When several tasks are pending, every pending task should be
visible. A task with multiple steps must be expandable so each step shows how
far it has progressed and its current status. Implementation should proceed
without another confirmation.

## Decisions

1. Keep one access point: the existing global AI Chat & Feedback button.
2. Keep one view model: inline Task Control and `/chat` side-panel Task Control
   consume the same protected projection.
3. Group by persisted orchestration `planId`, then `workflowRunId`, then a
   stable single-job fallback.
4. Show open jobs as the primary list and include completed predecessors when
   canonical dependency IDs point to them.
5. Use bounded group pagination/load-more for large queues.
6. Preserve the existing Chat composer handoff; this panel observes and
   cancels permitted work but does not introduce direct execution.
