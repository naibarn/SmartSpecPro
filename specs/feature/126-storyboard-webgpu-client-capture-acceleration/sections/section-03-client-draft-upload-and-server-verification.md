# Section 03: Client Draft Upload And Server Verification

## Objective

Define the future client-generated candidate path without allowing untrusted
browser output to bypass server verification.

## Scope

- Optional draft upload endpoint.
- Candidate artifact state.
- Verification reuse from Feature 125.
- Promotion to Library only after server pass.
- Server capture fallback when candidate fails or upload is interrupted.

## Trust Boundary

Client-generated video is untrusted. The server must verify identity, hashes,
duration, resolution, fps, codec, audio, subtitle timing, and visual parity
before promotion.

## Tests

- Upload rejects wrong tenant/user/job.
- Upload rejects stale or mismatched preview/timeline hash.
- Upload rejects invalid content type, duration, resolution, or codec.
- Candidate remains unpublished until verification passes.
- Failed verification falls back to server capture where possible.

## Acceptance Criteria

- Client candidates cannot directly create Media Library items.
- Verification output records pass/fail and reason.
- Failed candidates are quarantined or deleted according to retention policy.
