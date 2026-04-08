<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-payment-methods-and-consent
section-02-provider-setup-and-vault-references
section-03-auto-renew-orchestration
section-04-retry-dunning-and-manual-fallback
section-05-ui-security-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Execution order

1. section-01-payment-methods-and-consent
2. section-02-provider-setup-and-vault-references
3. section-03-auto-renew-orchestration
4. section-04-retry-dunning-and-manual-fallback
5. section-05-ui-security-and-rollout

## Cross-cutting checkpoints

- confirm Beam capability matrix before enabling section 02 beyond scaffolding
- lock consent snapshot shape before section 01 schema ships
- lock renewal-attempt state machine before section 03 implementation starts
- define cohort rollback policy before section 05 rollout code lands

## Section summaries

### section-01-payment-methods-and-consent

Add the core payment-method domain, consent, and audit model.

### section-02-provider-setup-and-vault-references

Implement provider tokenization/setup flows and masked payment-method persistence.

### section-03-auto-renew-orchestration

Implement automatic renewal attempts on top of the Phase 1 invoice and payment domain.

### section-04-retry-dunning-and-manual-fallback

Implement bounded retries, failure classification, dunning, and admin/manual fallback controls.

### section-05-ui-security-and-rollout

Add customer/admin UI, compliance constraints, and rollout controls for Phase 2.
