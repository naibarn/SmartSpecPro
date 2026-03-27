# Decision Log

## Decision 1: Add a dedicated article composer panel inside Media Studio

- Reason: The current workflow is split across multiple pages and does not provide a single "topic to publish" path.
- Outcome: The new spec centers on one panel that handles article generation, media selection, and destination routing.

## Decision 2: Reuse existing publish surfaces instead of inventing a new publish backend

- Reason: The repo already has blog/page attach routes, Social Publishing, Social Channels, and Upload-Post gateway support.
- Outcome: The spec should define a router and adapter layer that feeds those existing destinations.

## Decision 3: Treat library assets as the only publishable media source

- Reason: Temporary generation URLs are not stable enough for blog/docs/social publication.
- Outcome: Generated images/videos must be uploaded to the library before article publish, and the article stores stable library references.

## Decision 4: Hide Docs and Blog for general users

- Reason: The request explicitly requires general users to see only Social post.
- Outcome: Role-based UI gating is part of the spec, not an implementation detail.

## Decision 5: Social publishing must support platform-first routing

- Reason: The user wants platform selection first, then account/page/channel selection.
- Outcome: Social post destination flow should be `platform -> account/page/channel -> publish target`.
