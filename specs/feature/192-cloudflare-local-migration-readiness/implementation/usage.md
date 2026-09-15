# Feature 192 Implementation Usage

## Local verification

```bash
npm --workspace @smartspec/web run verify:feature-192
npm --workspace @smartspec/web run verify:feature-192:focused
npm --workspace @smartspec/cloudflare-runtime test
npm --workspace @smartspec/web run verify:cloudflare-runtime-target
npm --workspace @smartspec/web run verify:cloudflare-local-readiness
npm --workspace @smartspec/web run verify:cloudflare-target-readiness -- --mode local
```

The focused command uses the repository Python environment and a narrow test
selection. It is local contract evidence only. It does not run Wrangler,
production migrations, paid provider calls, or target-account probes.

## Expected handoff

- `state: LOCAL_CONTRACT_READY`
- `activation: disabled`
- `productionProof: false`
- `targetAccountProof: false`
- Google Cloud Tasks/Run/OIDC runtime: retired/fail-closed
- Google OAuth/Drive: retained product integrations only

The target-account binding, Hyperdrive, deployment rollback, provider recovery
and PITR, Vectorize rebuild, and legacy-drain gates remain external evidence
requirements owned by the Feature 187/188 release process.
