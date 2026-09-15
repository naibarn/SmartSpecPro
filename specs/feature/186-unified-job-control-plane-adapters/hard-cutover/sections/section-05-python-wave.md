# Section 05 — Python/Celery Bridge

## Objective

Provide the same canonical ingress and generic consumer behavior to Python
without allowing Celery task IDs or broker retries to become business state.

## Scope

Begin with low-risk indexing/sync/maintenance producers whose domain rows and
tenant context are already explicit. Keep media/provider tasks gated until
operation-key and settlement evidence is complete.

## Requirements

- Python gateway port accepts server context and canonical definition
- Celery wrapper receives canonical `job_id` envelope
- task retry is transport-only and bounded
- duplicate delivery and stale completion converge safely

## Done when

Focused pytest coverage passes and migrated Python producer calls are removed
from the direct inventory.
