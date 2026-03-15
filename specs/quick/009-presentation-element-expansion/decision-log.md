## Planning Depth

- Chosen depth: `standard`

## Why

- The request is architectural and cross-cutting, but still bounded to the Presentation editor domain.
- It needs codebase research and an execution-oriented recommendation, not a full deep-plan decomposition.

## Key Decisions

1. Treat the problem as “richer composition and editing capability” rather than “just add more primitive element types”.
2. Recommend preset composite blocks plus persistent grouping as the primary direction.
3. Defer specialized semantic widgets until after the composition model is strengthened.
