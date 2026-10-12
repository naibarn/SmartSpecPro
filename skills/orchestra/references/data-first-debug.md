# Evidence-Based Debugging

Debug from the most direct evidence available: failing command, stack trace, server/browser console, logs, SQL schema, runtime request or affected source. For a purely visual UI defect, screenshots and component code are valid evidence; do not demand unrelated database/trace IDs.

1. Reproduce or inspect the reported symptom and current code.
2. Identify a concrete hypothesis from available evidence and apply a targeted fix.
3. Run the smallest useful check or actual development preview.
4. If it fails again, inspect the new evidence and change strategy. Continue until repaired or a true external authority boundary is reached.

A missing trace ID, unavailable log provider, absent database access or lack of a specialist subagent is not itself a stop condition. Use available evidence and another authorized approach. Record unresolved limitations and pending checks in HandOff, never as passing verification.
