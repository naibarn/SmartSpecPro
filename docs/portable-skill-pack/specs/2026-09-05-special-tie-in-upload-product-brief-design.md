# Special Tie-in: uploaded product brief and background idea generation

## Goal

Support Marketplace tie-in idea generation from either a Marketplace Capture
product or user-uploaded product images. Uploaded images do not carry a trusted
catalog description, so the user must provide a product brief before idea
generation. Both paths must use the same background job and polling flow.

## Design

The client sends an explicit `productSource`:

- `marketplace_capture`: requires `productId`; product facts come from the
  owned Marketplace record. The idea field remains optional story direction.
- `upload`: requires at least one uploaded reference image and a non-empty idea
  field. The idea field is persisted into the normalized product description
  and also sent as story direction, so the skill receives the user's exact
  product facts without inventing catalog facts.

For the upload path the UI explains that the user should provide the product
name/type, verifiable features or materials, intended use, target audience,
and claims to avoid. It blocks the action while the brief is empty and shows a
clear inline warning plus an actionable toast if the action is attempted.

The router validates the source-specific contract, builds the normalized
Marketplace review input, and enqueues the existing owner-scoped
`vertical_drama_interactive_jobs` job. The worker performs LLM calls, bounded
repair/validation, billing, and durable run persistence. The dialog polls the
same status endpoint for either source and only displays a complete 3-idea
result.

## Failure and safety rules

- Missing upload brief is a client and server validation error; no LLM call or
  credit charge is made.
- Marketplace source without a valid product is rejected server-side.
- Uploaded source never calls Marketplace product lookup.
- Existing nine-shot dialogue, adult-speaker, child-silence, and advertising
  claim validation remain unchanged.
- A queue failure is surfaced as a terminal error; partial LLM output is not
  shown or persisted as a successful run.

## Verification

- Focused assertions cover source-specific request normalization and unit tests
  cover missing-brief/selected-product rejection before any database or LLM
  call.
- Existing interactive-job queue tests remain green.
- Focused TypeScript/TSX parse, diff check, and relevant Vitest tests are run;
  repository typecheck is intentionally skipped because of the user's RAM
  constraint.
