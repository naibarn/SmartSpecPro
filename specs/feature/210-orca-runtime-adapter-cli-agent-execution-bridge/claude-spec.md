# Spec 210 Synthesized Specification

Implement the Orca runtime adapter as a governed capability provider. It must
probe installation/readiness, create authenticated route attempts, supervise
CLI/TUI sessions through Runner, normalize output/receipts, support cancellation
and recovery, and map all state into canonical Jobs without exposing secrets or
creating a second queue.

Current source has no `orca.v1` implementation, so the first slice is a safe
adapter contract and disabled-by-default integration path, followed by
certification gates.

