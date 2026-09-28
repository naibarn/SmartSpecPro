<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-flags-i18n
section-02-shared-primitives
section-03-social-jobs-worker
section-04-ads-connection-service
section-05-connection-router-settings-ui
section-06-ads-graph-client
section-07-ads-read-router-shell
section-08-mutations-wizard
section-09-monitor-guards
section-10-optimizer-governance
section-11-integration-page-insights
section-12-advisor-skills
section-13-observability-oauth
END_MANIFEST -->

# Implementation Sections Index — 031-SocialAdsManagement

Sections mirror `claude-plan.md` sections 01–13 one-to-one. Tests-first per `claude-plan-tdd.md` (same numbering). Working dir for all code: `apps/web/` (except `packages/shared/src/constants/menu.ts` in section 07 and skill folders in section 12).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-flags-i18n | — | almost all | Yes (with 02) |
| section-02-shared-primitives | — | 04, 06 | Yes (with 01) |
| section-03-social-jobs-worker | 01 | 09, 11, 13 | Yes (with 04) |
| section-04-ads-connection-service | 01, 02 | 05, 06 | Yes (with 03) |
| section-05-connection-router-settings-ui | 04 | 07 (gating helpers) | Yes (with 06) |
| section-06-ads-graph-client | 02, 04 | 07, 08, 09, 11 | Yes (with 05) |
| section-07-ads-read-router-shell | 01, 05, 06 | 08, 11 | No |
| section-08-mutations-wizard | 07 | 09, 10, 12 | No |
| section-09-monitor-guards | 03, 06, 08 | 10 | No |
| section-10-optimizer-governance | 08, 09 | 13 | Yes (with 12) |
| section-11-integration-page-insights | 03, 07, 08 | 12 | No (edits shared UI files with 08) |
| section-12-advisor-skills | 08, 11 | 13 | Yes (with 10) |
| section-13-observability-oauth | 10, 12 | — | No (final) |

## Execution Order

1. **Batch 1 (parallel):** section-01-schema-flags-i18n, section-02-shared-primitives
2. **Batch 2 (parallel):** section-03-social-jobs-worker, section-04-ads-connection-service
3. **Batch 3 (parallel):** section-05-connection-router-settings-ui, section-06-ads-graph-client
4. **Batch 4:** section-07-ads-read-router-shell
5. **Batch 5:** section-08-mutations-wizard
6. **Batch 6:** section-09-monitor-guards, then section-11-integration-page-insights (sequential — both edit SocialAds page files; 09 first)
7. **Batch 7 (parallel):** section-10-optimizer-governance, section-12-advisor-skills
8. **Batch 8:** section-13-observability-oauth

Rollout-phase mapping: P0=03 · P1=01+02+04+05+06+07 · P2=08 · P3=09(+governance parts of 10) · P4=10+11(integration half) · P5=11(pages half)+12 · P6=13(OAuth).

## Section Summaries

### section-01-schema-flags-i18n
11 new Drizzle tables (verify next migration number — 0212 vs reserved → likely 0213), `SOCIAL_ADS_ENABLED` premium flag (Redis check + admin-UI trio), system_settings keys, th/en i18n key families.

### section-02-shared-primitives
`Money` (minor-units integer math), `accountTime` (ad-account-timezone windows), `adsErrorMap` (Graph code→Thai messages), auditLogger sanitizer extension (URL-embedded token regex) + `sanitizeForActionLog`.

### section-03-social-jobs-worker
`socialJobsWorker` (BullMQ queues + upsertJobScheduler lifecycle + boot/shutdown wiring), scheduled-posts sweep fixing Gap A, automation-rules wiring fixing Gap B, per-connection scheduler helpers + reconciliation.

### section-04-ads-connection-service
`socialAdsConnectionService`: paste-token validation, same-app long-lived exchange, encrypted storage, hard-delete disconnect, expiry lifecycle (markExpired + deduped notifications), internal-only decrypt.

### section-05-connection-router-settings-ui
`socialAdsConnection` tRPC router (rate-limited, secret-free DTOs) + `SocialAdsConnectionPanel` in Settings integrations tab (token hygiene rules, guardrails card, ฿500 default).

### section-06-ads-graph-client
`AdsProvider` interface + `MetaAdsProvider`/`adsGraphClient` (v25.0, Bearer-header-only, GET-only retry, pagination, Batch, async insights, appsecret_proof) + `adsBucGovernor` (Redis) + read cache + fixture contract tests.

### section-07-ads-read-router-shell
Menu item (menu.ts 7.5 + Dashboard sidebar), `/social/ads` route, `SocialAds.tsx` shell + Overview/Campaigns/Issues/Insights tabs, read procedures with ownership/lineage checks + read rate limits.

### section-08-mutations-wizard
`adsActionService` (intent-row protocol, per-entity locks, kill-switch choke point, post-success credits), `adsMutationService` (ODAX/budget/special-category validation, optimistic concurrency), mutation procedures, 4-step CampaignWizard with drafts + partial-failure resume, creative asset cache, sandboxed previews.

### section-09-monitor-guards
Monitor processor (Batch API polls, entity-state baseline, transition snapshots), 3 guard rules with auto-pause + hysteresis + manual resume, approve-first via socialHumanApprovals with owner/admin authority fix, deduped notifications.

### section-10-optimizer-governance
Optimizer executor (streaks in Redis, cooldown ledger, transactional re-read, dry-run action-log rows, bounded budget actions, guard precedence), strict Zod rule schemas, rule-builder UI, admin `forceDisableAdsConnection` + oversight aggregates.

### section-11-integration-page-insights
Boost-post button (Publishing→wizard), ads badge in Moderation, social health panel (fail-closed internal token), `pageInsightsService` (post-purge metric set, 90d backfill, daily snapshots), `pageFactsBuilder` (facts only), Pages tab UI.

### section-12-advisor-skills
`social-page-advisor` + `social-ads-advisor` skill folders (lowercase skill.md = all intelligence), `adsFactsBuilder`, `socialAdvisorService` (invokeLLM + outputSchema + lenient parse + deductCreditsForModel), Advisor tab, weekly scheduled reports.

### section-13-observability-oauth
Retention processor (purges/archival), unknown-intent alerts, startup version check, runbooks, OAuth flow (state-nonce, server-side exchange) + App Review readiness switch (paste↔OAuth modes).
