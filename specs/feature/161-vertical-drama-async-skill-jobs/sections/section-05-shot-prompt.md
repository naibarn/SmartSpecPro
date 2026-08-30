# Section 05 — Reference-frame prompt job

Move `generateShotReferenceFramePrompt` to the existing shot prompt job family. Store the request snapshot, skill/model metadata and generated prompt before success. Reuse the existing prompt polling contract and ensure failed jobs expose trace IDs without creating a fake prompt.

Tests cover submit/poll/persist, selected-model propagation, retry idempotency and ownership.
