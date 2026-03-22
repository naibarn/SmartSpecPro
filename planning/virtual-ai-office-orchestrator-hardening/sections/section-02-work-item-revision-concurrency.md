# Section 02: Work-Item Revision Concurrency

## Goal

Prevent silent overwrite or confused approval state when multiple team members critique and revise the same work.

## Deliverables

- optimistic concurrency model
- revision lineage model
- lock and supersession rules
- approval targeting rules

## Required Rules

- work items carry a revision/version field
- stale revision writes fail with conflict
- thread lineage is preserved through root/reply relationships
- approvals and rejections attach to a concrete revision
- superseded revisions cannot later become final accidentally
