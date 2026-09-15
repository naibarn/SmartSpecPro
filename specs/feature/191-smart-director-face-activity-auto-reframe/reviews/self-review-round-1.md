# Deep-plan self-review round 1

## Findings

1. The existing local renderer is Rust and the existing detector is MediaPipe;
   the plan must explicitly avoid assuming an object model is bundled.
2. A Full Scan result must be fenced against source, Mark, policy, and
   capability revisions, otherwise a late scan could overwrite newer edits.
3. The user requires both immediate and whole-video choices, so Quick cannot be
   silently presented as authoritative.
4. Feature 186 owns lifecycle only; Feature 191 must not add a second job
   ledger or move tenant authorization into the media payload.

## Integrated fixes

The plan now names the capability-gated Python adapter, explicit evidence
fingerprints/checkpoint promotion, Quick provisional versus Full Scan approved
states, and the existing Feature 186 gateway/registry as the only canonical
job boundary. No implementation section relies on a new generic jobs table.
