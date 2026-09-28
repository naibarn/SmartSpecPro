# Feature 186 JSON Payload Normalization Design

## Problem

The Vertical Drama `Generate prompt + image` flow can enqueue a valid job while
the optional `publicUrl` field is absent. The prompt-job record retains that
absence as an object property whose value is `undefined`. Feature 186 currently
passes the record directly to canonical job validation, which rejects the
transport-incompatible value as `JOB_DEFINITION_INVALID`.

## Decision

Normalize only the adapter payload boundary before constructing the canonical
job definition. Recursively omit object properties whose value is
`undefined`; preserve explicit `null`, arrays, primitives, and object values.
The existing canonicalizer remains strict for unsupported values, circular
references, non-finite numbers, oversized strings, and oversized payloads.

This keeps optional TypeScript fields equivalent to omitted JSON fields without
weakening the canonical contract or changing domain/job call sites.

## Regression proof

- A Feature 186 job with an optional undefined payload property reaches the
  canonical create boundary with that property omitted.
- The normalized payload still rejects unsupported non-JSON values.
- Existing canonicalization tests remain unchanged and passing.

## Scope and non-goals

This change is limited to the Feature 186 Node adapter boundary. It does not
change image URLs, provider admission, credit charging, job status semantics,
Redis compatibility behavior, or production rollout flags.
