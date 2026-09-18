# Section 03 review

## Findings and disposition

1. The provider contract has independent image/video/audio methods, so an
   image path cannot silently invoke a video or visible-overlay fallback.
2. Production configuration is fail-closed: `videoseal` and `pixelseal` are
   adapter names only until a native implementation is available, and missing
   or unimplemented providers return `PROVIDER_UNAVAILABLE`.
3. The service computes the source hash from final input bytes, binds the
   request to tenant and owner IDs, rejects stale compound envelopes, and
   returns an existing record only when idempotency inputs match.
4. `PROTECTED` is reachable only after the provider output channel matches the
   requested modality and the provider detects the watermark with confidence at
   least 0.5. Detection failures remain `INCONCLUSIVE`.
5. Output-hash mismatch, provider mismatch, unavailable provider, and other
   failures are sanitized before persistence. Redaction removes codewords,
   private keys, credentials, tokens, and raw-byte fields.

## Review result

APPROVED for Section 03. The actual provider implementation and worker
capability admission remain owned by Sections 05 and 10; this section does not
claim production watermarking from the deterministic test provider.
