# Implementation Plan

## Objective

Publish Seedream 5.0 Pro as a Higgsfield MCP image model in the configured production catalog.

## Changes

1. Expose the Higgsfield catalog builder for a focused inventory regression test.
2. Add the Pro row after the existing Lite row with model id `higgsfield/seedream_v5_pro` and provider model id `seedream_v5_pro`.
3. Reuse the existing MCP image tool and argument shape; retain Lite unchanged.
4. Run the explicit seed script against production and query the exact row.

## Risks and mitigation

- Incorrect provider metadata: use the established Higgsfield MCP route and avoid optional defaults not verified by a live schema.
- Production visibility: query the same `media_models` row the admin page reads after the upsert.
- Rollback: disable `higgsfield/seedream_v5_pro`; never delete historical model records.

## Acceptance criteria

- The catalog builder includes one enabled image model named Seedream 5.0 Pro.
- Its route is Higgsfield MCP `generate_image` with native id `seedream_v5_pro`.
- Production has the matching enabled `media_models` row.
