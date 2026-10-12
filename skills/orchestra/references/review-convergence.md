# Review Convergence

Review is part of progressive debugging and final acceptance, **not an automatic merge gate for routine development UI/UX**.

Use review when a defect, changed public contract, complex dependency, security-sensitive change, or user-requested polish warrants it. Start from actual code, UI and logs. Fix concrete findings, test the affected behavior and merge the repair checkpoint. Repeat as many useful rounds as necessary; do not impose minimum clean-review rounds or arbitrary global review before development integration.

A reviewer finding is not proof of failure until supported by a specific affected behavior or applicable requirement. Record pending/uncertain findings in HandOff. A proven critical defect in the changed and immediately exposed functionality requires correction; unrelated or later-stage acceptance gaps do not strand independent code changes.

For final acceptance, reconcile applicable requirements with fresh evidence and report unresolved gaps accurately. Never represent a missing browser/session/tool as a passing test.
