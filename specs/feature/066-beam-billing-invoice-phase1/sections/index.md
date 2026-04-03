<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-and-auth-foundation
section-02-billing-profiles-and-admin-settings
section-03-invoice-domain-tax-and-numbering
section-04-beam-adapter-webhook-and-payment-attempts
section-05-document-rendering-versioning-and-access
section-06-topup-renewal-and-business-effects
section-07-reconciliation-recovery-and-admin-console
section-08-notifications-tests-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-schema-and-auth-foundation | - | all later sections | No |
| section-02-billing-profiles-and-admin-settings | section-01-schema-and-auth-foundation | section-03, section-05, section-08 | Yes |
| section-03-invoice-domain-tax-and-numbering | section-01-schema-and-auth-foundation, section-02-billing-profiles-and-admin-settings | section-04, section-05, section-06, section-07, section-08 | No |
| section-04-beam-adapter-webhook-and-payment-attempts | section-01-schema-and-auth-foundation, section-03-invoice-domain-tax-and-numbering | section-06, section-07, section-08 | Yes |
| section-05-document-rendering-versioning-and-access | section-01-schema-and-auth-foundation, section-02-billing-profiles-and-admin-settings, section-03-invoice-domain-tax-and-numbering | section-07, section-08 | Yes |
| section-06-topup-renewal-and-business-effects | section-03-invoice-domain-tax-and-numbering, section-04-beam-adapter-webhook-and-payment-attempts | section-07, section-08 | No |
| section-07-reconciliation-recovery-and-admin-console | section-04-beam-adapter-webhook-and-payment-attempts, section-05-document-rendering-versioning-and-access, section-06-topup-renewal-and-business-effects | section-08 | No |
| section-08-notifications-tests-and-rollout | section-02-billing-profiles-and-admin-settings, section-03-invoice-domain-tax-and-numbering, section-04-beam-adapter-webhook-and-payment-attempts, section-05-document-rendering-versioning-and-access, section-06-topup-renewal-and-business-effects, section-07-reconciliation-recovery-and-admin-console | - | No |

## Execution order

1. section-01-schema-and-auth-foundation
2. section-02-billing-profiles-and-admin-settings
3. section-03-invoice-domain-tax-and-numbering
4. section-04-beam-adapter-webhook-and-payment-attempts and section-05-document-rendering-versioning-and-access
5. section-06-topup-renewal-and-business-effects
6. section-07-reconciliation-recovery-and-admin-console
7. section-08-notifications-tests-and-rollout

## Section summaries

### section-01-schema-and-auth-foundation

Create the schema, indexes, and centralized billing authorization foundation.

### section-02-billing-profiles-and-admin-settings

Implement buyer/seller profile management and tax/numbering admin settings.

### section-03-invoice-domain-tax-and-numbering

Implement invoice state, stream classification, totals, numbering, and replace/reissue relations.

### section-04-beam-adapter-webhook-and-payment-attempts

Implement Beam adapter, webhook verification, dedupe, and payment-attempt state normalization.

### section-05-document-rendering-versioning-and-access

Implement PDF renditions, versioning, sync-header behavior, and secure document/evidence access.

### section-06-topup-renewal-and-business-effects

Implement top-up and renewal orchestration plus exactly-once credits/plan effects.

### section-07-reconciliation-recovery-and-admin-console

Implement reconciliation jobs, overdue downgrade safety, and admin recovery tooling.

### section-08-notifications-tests-and-rollout

Implement billing notification dedupe/history, broaden automated coverage, and define rollout gates.
