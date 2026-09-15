# Decision Log

| Decision | Reason |
|---|---|
| HyperFrames first | It is the existing Worker App transcription authority and already returns canonical timing metadata. |
| Server-side fixed vision-skill adapter | The Worker App has no registered local image skill command; server scope and provider policy must remain authoritative. |
| Original order as baseline | Prevents visually confident but narratively wrong automatic reordering. |
| High-confidence reorder + preview gate | Matches the approved user policy and creates a human review point before mutation. |
| Pure deterministic matcher | Makes timing/order decisions testable and reproducible without paid model calls. |
| Additive project metadata and undo snapshot | Keeps old projects compatible and makes the change reversible. |
