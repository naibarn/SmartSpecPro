<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-phase4-schema-migration
section-02-phase4-dedup-service
section-03-phase4-frontend-sse
section-04-phase5-schema-preferences
section-05-phase5-preference-delivery
section-06-phase5-escalation-job
section-07-phase5-frontend-settings
section-08-phase6-unified-query
section-09-phase6-admin-dashboard
section-10-phase7-email-delivery
section-11-phase7-webhook-delivery
section-12-phase7-templates-retention
section-13-feature-flags-i18n
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-phase4-schema-migration | - | 02, 03 | Yes |
| section-02-phase4-dedup-service | 01 | 05 | No |
| section-03-phase4-frontend-sse | 01, 02 | - | Yes (with 02 done) |
| section-04-phase5-schema-preferences | 01 | 05, 06, 07 | Yes (after 01) |
| section-05-phase5-preference-delivery | 02, 04 | 08, 10, 11 | No |
| section-06-phase5-escalation-job | 04, 05 | - | Yes (after 05) |
| section-07-phase5-frontend-settings | 04, 05 | - | Yes (after 05) |
| section-08-phase6-unified-query | 05 | 09 | No |
| section-09-phase6-admin-dashboard | 08 | - | No |
| section-10-phase7-email-delivery | 05, 12 | - | Yes (after 05, 12) |
| section-11-phase7-webhook-delivery | 05, 12 | - | Yes (after 05, 12) |
| section-12-phase7-templates-retention | 05 | 10, 11 | No |
| section-13-feature-flags-i18n | - | all | Yes (first) |

## Execution Order

1. **Batch 1** (parallel): section-01-phase4-schema-migration, section-13-feature-flags-i18n
2. **Batch 2** (sequential): section-02-phase4-dedup-service (after 01)
3. **Batch 3** (parallel): section-03-phase4-frontend-sse, section-04-phase5-schema-preferences (after 01, 02)
4. **Batch 4** (sequential): section-05-phase5-preference-delivery (after 02, 04)
5. **Batch 5** (parallel): section-06-phase5-escalation-job, section-07-phase5-frontend-settings (after 05)
6. **Batch 6** (parallel): section-08-phase6-unified-query, section-12-phase7-templates-retention (after 05)
7. **Batch 7** (parallel): section-09-phase6-admin-dashboard, section-10-phase7-email-delivery, section-11-phase7-webhook-delivery (after 08, 12)

## Section Summaries

### section-01-phase4-schema-migration
Notification type enum extension (ALTER TYPE ADD VALUE), add groupKey/occurrenceCount/firstOccurredAt/lastOccurredAt columns to userNotifications, create notificationOccurrences table, create dedup unique partial index. Run drizzle migration.

### section-02-phase4-dedup-service
Implement dedup logic in createNotification() using INSERT ON CONFLICT. Add occurrence snapshot insertion. Update admin-broadcast endpoint to accept groupKey. Update Python alerts.py to pass groupKey. Add group key patterns to each notification call site.

### section-03-phase4-frontend-sse
Add occurrence badge (xN) to GlobalNotificationBell and Notifications page. Implement group expansion UI with getGroupOccurrences API call. Fix SSE reconnection with exponential backoff.

### section-04-phase5-schema-preferences
Create notificationPreferences, alertRules, and escalationPolicies tables in schema.ts. Run drizzle migration. Add tRPC routers for CRUD operations on all three tables. Register routers in routers.ts.

### section-05-phase5-preference-delivery
Add preference-aware delivery gate in createNotification(). Implement mapToCategory() helper. Add Redis-cached preference lookup with invalidation on upsert. Implement escalation bypass (isEscalated=true skips preferences).

### section-06-phase5-escalation-job
Create BullMQ escalation job (every 5 min). Query unacknowledged critical notifications past trigger window. Create escalation notifications to target roles/users with isEscalated=true metadata. Create notificationJobs.ts initialization module.

### section-07-phase5-frontend-settings
Build /settings/notifications page with per-category preference grid. Build /admin/alert-rules page with rule CRUD and escalation policy management. Add routes and menu entries.

### section-08-phase6-unified-query
Create unifiedNotificationService.ts with multi-source query (userNotifications + orchestratorNotifications). Implement Redis-cached unified count. Add index on orchestratorNotifications. Enrich Guardian metadata in feedbackProcessor.ts. Add unified tRPC endpoints.

### section-09-phase6-admin-dashboard
Build /admin/notifications page with stat cards, source/severity charts, unified list with filters, detail panel. Add route and menu entry.

### section-10-phase7-email-delivery
Create notificationEmailService.ts extending existing emailService. Implement immediate email for high/critical notifications. Create notificationDigestJob.ts (BullMQ hourly) for batched email delivery. Track last digest time in Redis.

### section-11-phase7-webhook-delivery
Create notificationWebhooks table in schema. Implement notificationWebhookService.ts with HMAC signing, SSRF prevention, BullMQ delivery with retries, auto-disable on failure. Create tRPC webhook CRUD router. Add webhook management UI to settings and admin.

### section-12-phase7-templates-retention
Create notificationTemplateService.ts with i18n templates (EN/TH) and variable interpolation. Create notificationRetentionJob.ts (BullMQ daily 03:00 UTC) with age-based + per-user-cap cleanup.

### section-13-feature-flags-i18n
Add 6 feature flags to featureFlags.ts. Add notification-related translations to locales/en.ts and th.ts. Add menu entries for new pages to packages/shared/src/constants/menu.ts. Add routes to main.tsx.
