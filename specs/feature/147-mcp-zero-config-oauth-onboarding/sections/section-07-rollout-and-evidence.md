# Section 07 — Rollout and evidence

## Objective

Enable the feature safely only after implementation, security, deployment, and client gates close.

## Ownership

- new defaults-off tenant flags and global environment gates
- deployment secret/key configuration
- metrics, alerts, runbooks, CI/live evidence, rollback

## Gates

G0 canonical issuer/key ownership; G1 migration/crypto; G2 metadata; G3 DCR/CIMD; G4 browser consent; G5 token/JWKS/revoke; G6 owner UI; G7 Hermes hosts; G8 Claude live DCR; G9 Codex live; G10 security/load/rollback.

Roll out first to `tenant-ZCSKEM9s` only, read-only scopes first, while retaining Feature 146 API-key and Feature 145 pairing fallback. OAuth enablement must not implicitly enable Remotion, media generation, downloads, or write scopes.

Evidence must report PASS/FAIL/BLOCKED/NOT RUN separately for code, deployment, and each client. Full-repository typecheck baseline failures remain separate from focused Feature 147 proof.
