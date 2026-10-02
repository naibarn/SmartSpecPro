<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/cloudflare-runtime test && cd apps/web && npm test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-spec-cloudflare-no-legacy
section-02-shared-route-contract
section-03-emergency-domain-safety-contracts
section-04-citizen-intake-and-payment-reliability
section-05-case-needs-tasks-facilities-and-messages
section-06-geospatial-map-and-public-projections
section-07-deterministic-triage-and-safety-protocols
section-08-mutual-aid-and-federation
section-09-evidence-intelligence-and-forecasting
section-10-sponsorship-marketplace-and-thai-finance
section-11-privacy-resilience-and-operations
section-12-integrated-local-release-candidate
section-13-final-cloudflare-staging-verification
END_MANIFEST -->

# Spec 260 Implementation Sections

The implementation follows `../development-plan.md`. Real Cloudflare provider/environment verification is deferred until the final integrated release gate. Tests are to be authored with each section and run together at the user's requested end-of-implementation test stage; do not deploy or probe a real Cloudflare account during implementation.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-spec-cloudflare-no-legacy | - | all implementation sections | No |
| section-02-shared-route-contract | section-01 | Worker/API and browser route integration | No |
| section-03-emergency-domain-safety-contracts | section-02 | persistence, privacy, case, operations, finance | No |
| section-04-citizen-intake-and-payment-reliability | section-03 | public intake, anonymous continuity, settlement | No |
| section-05-case-needs-tasks-facilities-and-messages | section-04 | response operations, communication | No |
| section-06-geospatial-map-and-public-projections | section-04 | map experience, nearby information | No |
| section-07-deterministic-triage-and-safety-protocols | section-04, section-05 | assignment safety, command workflow | No |
| section-08-mutual-aid-and-federation | section-05, section-07 | helper discovery and external authority access | No |
| section-09-evidence-intelligence-and-forecasting | section-03, section-07 | verified public claims and anticipatory operations | No |
| section-10-sponsorship-marketplace-and-thai-finance | section-04, section-05 | restricted funds, marketplace, finance close | No |
| section-11-privacy-resilience-and-operations | all product sections | integrated release gate | No |
| section-12-integrated-local-release-candidate | section-04 through section-11 | final external verification | No |
| section-13-final-cloudflare-staging-verification | section-12 | launch decision | No |

## Execution Order

1. section-01-spec-cloudflare-no-legacy
2. section-02-shared-route-contract
3. section-03-emergency-domain-safety-contracts
4. Execute sections 04–11 in dependency order; author focused regression coverage but defer execution to section 12.
5. Freeze the release candidate and perform one integrated local/CI test and build pass in section 12.
6. Only after section 12 passes, perform one integrated real Cloudflare staging verification in section 13.

## Section Summaries

### section-01-spec-cloudflare-no-legacy

Add an authoritative Spec 260 precedence clause for Cloudflare-first delivery without legacy runtime/client compatibility, while retaining the canonical platform authorities and deferring real Cloudflare verification to the final integrated phase.

### section-02-shared-route-contract

Add a dependency-light shared contract for Spec 260 page routes, Worker API paths, and authorization classes. This is the single input for browser route registration and Cloudflare Worker registration/tests.

### section-03-emergency-domain-safety-contracts

Define the runtime-neutral emergency domain entities, versioned hazard/provenance types, state-transition rules with append-audit envelopes, and explicit public situation projection while retaining platform identity, ledger, job, and media authorities.


### section-04-citizen-intake-and-payment-reliability

Deliver durable anonymous report acceptance and continuation, safe public projections, support contribution wiring, and replayable verified payment webhooks.

### section-05-case-needs-tasks-facilities-and-messages

Build auditable case needs, partial fulfillment, response task and assignment lifecycles, verified facility status, responder UI, and scoped case messages.

### section-06-geospatial-map-and-public-projections

Add bounded PostGIS map queries, generalized public geometry, freshness/source state, MapLibre rendering, and list/accessibility parity.

### section-07-deterministic-triage-and-safety-protocols

Implement hazard protocol packs, deterministic triage/reassessment, case brief and verification queues; AI remains advisory.

### section-08-mutual-aid-and-federation

Add opted-in helper discovery, minimum-disclosure grants, trusted federation contracts and revocation/jurisdiction boundaries.

### section-09-evidence-intelligence-and-forecasting

Add source-grounded feed ingestion, claim verification/corrections, forecast briefs and cost-bounded canonical jobs.

### section-10-sponsorship-marketplace-and-thai-finance

Add restricted sponsor allocations, marketplace workflows and financial/tax controls on the existing canonical ledger.

### section-11-privacy-resilience-and-operations

Close cross-module security, privacy, retention, surge, recovery, observability, runbook and accessibility requirements.

### section-12-integrated-local-release-candidate

Run the single full local/CI gate after implementation completion and freeze the evidence-backed release candidate.

### section-13-final-cloudflare-staging-verification

Perform the one integrated real Cloudflare staging verification after the local release candidate passes.
