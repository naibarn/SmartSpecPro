# Review Round 02 — Queue Failure Semantics

Checks: parse validation, duplicate delivery, terminal late delivery, database
outage, quarantine, and acknowledgement ordering.

Finding: a generic handler failure was eligible for quarantine even when the
failure represented a transient database/Hyperdrive outage.

Fix: transient control-plane error classes now return Queue retry without
creating poison/operator-review evidence; invalid/unsupported input still
uses quarantine.

Remaining: target account Queue/DLQ behavior is external proof.
