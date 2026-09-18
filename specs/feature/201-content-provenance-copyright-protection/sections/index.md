<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-persistence-migration
section-03-protection-service
section-04-content-protection-router
section-05-worker-protection-job
section-06-compound-integration
section-07-ui-workspace
section-08-dashboard-settings-navigation
section-09-rights-evidence-review
section-10-verification-rollout
END_MANIFEST -->

# Implementation Sections Index

| Section | Depends on | Deliverable |
|---|---|---|
| 01 | — | Shared Feature-201 contracts and pure helpers |
| 02 | 01 | Drizzle tables and migration |
| 03 | 01, 02 | Provider boundary and protection service |
| 04 | 01, 02, 03 | Authenticated tRPC API |
| 05 | 01, 03, 04 | Canonical worker job and result settlement |
| 06 | 01, 03, 04, 05 | Web editor and Vertical Drama compound gate |
| 07 | 01, 04 | Content Protection React workspace |
| 08 | 01, 07 | Shared menu, Dashboard links/card, Settings deep link |
| 09 | 02, 04, 07 | Rights, certificates, cases, evidence/reviewer |
| 10 | 01–09 | Tests, flags, metrics, migration/rollout verification |

## Cross-section interfaces

- `ContentProtectionChoice`, `ProtectionModality`, and
  `CompoundArtifactEnvelope` are exported by section 01 and consumed without
  redefinition.
- `contentProtectionService` is the only module allowed to transition a
  protection asset to `PROTECTED`.
- `contentProtectionRouter` uses service methods and server-derived tenant/user
  authority; UI never writes protection state directly.
- `content_protection` worker jobs carry `protectionAssetId` and the same
  `compoundArtifactId/compoundPlanDigest` persisted by section 06.
- UI route names and Dashboard/menu IDs are defined once in shared contracts.
