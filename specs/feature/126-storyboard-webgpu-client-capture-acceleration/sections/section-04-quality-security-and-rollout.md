# Section 04: Quality, Security, And Rollout

## Objective

Keep WebGPU acceleration safe, measurable, and removable until production value
is proven.

## Scope

- Quality gates and telemetry.
- Privacy and fingerprinting constraints.
- Rollout phases.
- Promotion/removal criteria.
- Manual QA fixture list.

## Quality Gates

- Unsupported browsers must fall back cleanly.
- Thai overlay/subtitle text must pass the same parity checks as Feature 125.
- Audio/subtitle drift must fail candidate verification.
- High-quality capture must not regress text sharpness.
- Client acceleration must not increase final output failure rate.

## Security Gates

- No high-entropy GPU identifiers in normal telemetry.
- No signed URL leakage.
- Strict upload size/duration/codec limits.
- Tenant/job ownership required for candidate uploads.
- Audit opt-in, fallback, upload, verify, and promote events.

## Acceptance Criteria

- WebGPU can stay disabled in production without dead UI.
- Test tenants can enable it without affecting other tenants.
- Rollout metrics are sufficient to decide promote, keep experimental, or remove.
