# Code Review Triage - Section 02

## Discussed with User

- No blocking tradeoff items required user decision for this section.

## Auto-Fixes Applied

1. Added reserved-name-safe Python mapping (`metadata_json` alias for DB `metadata`).
2. Added uniqueness + query indexes for source links, chunks, ACL, and indexing jobs.
3. Added compatibility notes documenting Drizzle/Python schema contract.

## Deferred Follow-ups

1. Validate migration on shared Postgres environment with rollback rehearsal.
2. Add integration tests through domain services and API routes in Section 03.
