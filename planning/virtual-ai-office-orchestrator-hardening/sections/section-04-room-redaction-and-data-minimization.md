# Section 04: Room Redaction And Data Minimization

## Goal

Keep room-first collaboration transparent and inspectable without leaking raw sensitive payloads.

## Deliverables

- sanitization policy for room posts
- structured redaction audit model
- citation-preserving summary rules
- policy layering by team and risk class

## Required Rules

- meaningful work updates still appear in the room
- sensitive outputs are shown as sanitized summaries plus references
- raw secrets and private connector payloads are not posted directly to user-visible timelines by default
- redaction decisions are audit-logged
- summary mode must remain safe even when transparent mode contains richer context
