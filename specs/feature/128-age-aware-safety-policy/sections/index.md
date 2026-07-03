<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-policy-foundation
section-02-data-profile-service
section-03-security-pin-tokens
section-04-admin-policy-audit-flags
section-05-profile-completion-ux
section-06-chat-enforcement
section-07-media-async-enforcement
section-08-generated-asset-viewer-policy
section-09-external-actors-adapters
section-10-settings-admin-i18n
section-11-observability-compliance
section-12-rollout-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-policy-foundation | - | 02, 03, 04, 06, 07, 08, 09, 11, 12 | Yes |
| section-02-data-profile-service | 01 | 03, 05, 09, 11 | No |
| section-03-security-pin-tokens | 01, 02 | 05, 06, 07 | No |
| section-04-admin-policy-audit-flags | 01 | 05, 06, 07, 10, 11, 12 | Yes after 01 |
| section-05-profile-completion-ux | 02, 03, 04 | 10, 12 | No |
| section-06-chat-enforcement | 01, 03, 04 | 12 | Yes after 03/04 |
| section-07-media-async-enforcement | 01, 03, 04 | 08, 12 | Yes after 03/04 |
| section-08-generated-asset-viewer-policy | 01, 07 | 12 | No |
| section-09-external-actors-adapters | 01, 02, 04 | 12 | Yes after 04 |
| section-10-settings-admin-i18n | 04, 05 | 12 | Yes after 05 |
| section-11-observability-compliance | 02, 04 | 12 | Yes after 04 |
| section-12-rollout-verification | all | - | No |

## Execution Order

1. section-01-policy-foundation
2. section-02-data-profile-service and section-04-admin-policy-audit-flags
3. section-03-security-pin-tokens
4. section-05-profile-completion-ux, section-06-chat-enforcement, section-07-media-async-enforcement, section-09-external-actors-adapters
5. section-08-generated-asset-viewer-policy, section-10-settings-admin-i18n, section-11-observability-compliance
6. section-12-rollout-verification

## Section Summaries

### section-01-policy-foundation
Shared age-safety types, policy schema, jurisdiction presets, decision contracts, and base service skeletons.

### section-02-data-profile-service
Safety profile persistence, age calculation, country normalization, completion status, migration strategy, and profile versioning.

### section-03-security-pin-tokens
Security PIN abstraction, protected-surface token issuance/validation, Private Vault compatibility, rate limits, and logout cleanup.

### section-04-admin-policy-audit-flags
Admin policy router, feature flags, policy storage, audit helpers, RBAC, and policy test tooling.

### section-05-profile-completion-ux
Post-login completion gate, server completion errors, frontend route guard, completion page/state, and exempt-route behavior.

### section-06-chat-enforcement
Chat prompt/output enforcement, provider payload minimization, streaming-safe response handling, and context-pack prompt-injection resistance.

### section-07-media-async-enforcement
Media prompt preflight, no-credit-on-block, async job revalidation, provider callbacks, Python envelope/internal-only enforcement.

### section-08-generated-asset-viewer-policy
Safety metadata on generated/shared assets and viewer-time enforcement for preview/download/share/remix/reference reuse.

### section-09-external-actors-adapters
Actor/audience resolution for API keys, public API, delegated workers, widgets, MCP, and system agents.

### section-10-settings-admin-i18n
Settings/Profile/Security UI, Admin Safety UI, menu projection, review queue UI, and English/Thai i18n.

### section-11-observability-compliance
Metrics, alerts, runbooks, manual review/appeals, consent/retention ledgers, privacy/export/delete controls.

### section-12-rollout-verification
Tenant rollout modes, kill switch, migration playbook, integration/E2E/security gates, and final regression checklist.
