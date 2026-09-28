# Interview Transcript

## Product scope

**Question:** Should existing provider-only results also be migrated to R2?

**Answer:** Yes. Historical Media Studio results must be backfilled into R2.

## Media History contract

Media History must retain two URL sets:

1. The original provider URL for audit and fallback while it still works.
2. The R2 URL for normal viewing, with R2 as the primary because it does not expire.

If the provider URL expires before R2 is available, Media History must show an explicit expired/unviewable state.

## Operating constraints

- No further confirmation is required before implementation.
- Tenant ID and user ID must be verified for storage and history access.
- Browser cache should be used without sacrificing tenant isolation or video seeking.
