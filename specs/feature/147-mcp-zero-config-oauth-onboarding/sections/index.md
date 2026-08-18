<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web run test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-crypto
section-02-discovery-and-registration
section-03-browser-authorization
section-04-token-verifier-and-revocation
section-05-user-control-plane
section-06-client-compatibility
section-07-rollout-and-evidence
END_MANIFEST -->

# Feature 147 plan sections

- [Spec](../spec.md)
- [Research](../claude-research.md)
- [Implementation plan](../claude-plan.md)
- [TDD and verification](../claude-plan-tdd.md)
- [Self-review 1](../reviews/self-review-01.md)
- [Self-review 2](../reviews/self-review-02.md)

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts and crypto | Wave 0 decisions | 02, 03, 04 | No |
| 02 discovery and registration | 01 | 03, 06 | No |
| 03 browser authorization | 01, 02 | 04, 06 | No |
| 04 token verifier and revocation | 01, 03 | 05, 06, 07 | No |
| 05 user control plane | 04 | 07 | Yes after 04 |
| 06 client compatibility | 02, 03, 04 | 07 | Yes after 04 |
| 07 rollout and evidence | 04, 05, 06 | - | No |

## Execution order

1. Freeze Wave 0 identity, key, scope, and client decisions.
2. Implement section 01.
3. Implement section 02, then section 03.
4. Implement section 04.
5. Implement sections 05 and 06 in parallel where file ownership permits.
6. Implement section 07 and close all gates.

## Section summaries

## Implementation status

- section-01: implemented — four durable OAuth tables, additive migrations `0226`/`0227`, PKCE, hashed opaque credentials, asymmetric signing contract, refresh-family reuse revocation.
- section-02: implemented — authorization-server/OIDC/JWKS discovery, DCR endpoint, exact redirect validation, rate limits. CIMD remains explicitly disabled behind its flag.
- section-03: implemented — login continuation, server-rendered consent, tenant binding, approve/deny, one-time authorization code.
- section-04: implemented — token/refresh/revoke routes, local first-party JWKS verification, resource/audience/grant checks, connected-device revocation.
- section-05: implemented — existing owner-scoped Connected Devices API/UI now includes OAuth connections and safe client/redirect metadata.
- section-06: code-ready but live client evidence not run — Hermes/Claude/Codex account and host gates remain separate deployment evidence.
- section-07: pilot enabled — signing key, environment, migration, restart, health, metadata/JWKS, and tenant rollout verified; live client gates remain separate evidence work.

### section-01-contracts-and-crypto
Durable client/transaction/grant/key records, crypto, asymmetric signing, refresh rotation.

### section-02-discovery-and-registration
PRM, RFC 8414/OIDC metadata, JWKS, DCR, CIMD, redirect and SSRF policy.

### section-03-browser-authorization
Login continuation, tenant selection, real consent page, authorization code and PKCE.

### section-04-token-verifier-and-revocation
Token/revoke routes, first-party JWKS verification, scope mapping, grant/device revocation.

### section-05-user-control-plane
Owner-only Settings list/revoke UI/API and audit behavior.

### section-06-client-compatibility
Hermes secure-store/onboarding plus live Claude/Codex/Inspector compatibility evidence.

### section-07-rollout-and-evidence
Flags, service configuration, metrics, runbooks, CI/live gates, and tenant rollout.
