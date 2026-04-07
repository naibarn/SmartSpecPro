# Diff Notes: Section 03 - HTTP Gateway Compatibility and Docs

- Normalized `/v1/responses` tenant derivation so authenticated external callers no longer collapse into the `"default"` tenant.
- Extended bearer/session auth normalization to surface tenant/user context for gateway-facing routes.
- Published the truthful Claw-compatible HTTP gateway contract in the public docs surface.
- Locked docs parity by keeping `/v1/embeddings` absent and explicitly documenting that embeddings are unsupported.
