# SmartSpecPro Database Schema Research

## Overview
SmartSpecPro uses **PostgreSQL 15** with **Drizzle ORM** for type-safe schema management. The schema is fully defined in `apps/web/drizzle/schema.ts` (49KB file) with migrations stored as SQL files in `apps/web/drizzle/`.

**Key facts:**
- Migrations: 42+ SQL migration files (0000 through 0042)
- Migration manager: Drizzle Kit (generates + runs migrations)
- ORM: Drizzle ORM with pgTable, pgEnum, and type inference
- Schema versioning: Managed via `drizzle/meta/_journal.json`

---

## 1. AUTHENTICATION & USERS

### users table
**Primary table for user accounts and authentication.**

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | Surrogate key for all relations |
| openId | varchar(64) UNIQUE | OAuth identifier from Manus |
| name | text | User display name |
| email | varchar(320) | User email |
| password | text | Hash for local login (optional) |
| loginMethod | varchar(64) | Login method identifier |
| role | roleEnum | one of: `user`, `admin`, `domain_admin` |
| registeredDomain | varchar(255) | Domain where user registered (locked) |
| currentTenantId | integer FK→tenants | Quick access to current tenant |
| credits | integer | Credit balance (smallest unit) |
| plan | planEnum | one of: `free`, `starter`, `pro`, `enterprise` |
| isDisabled | boolean | Account disabled flag |
| normalizedEmail | varchar(320) | Gmail dots stripped, + aliases removed |
| trustScore | integer 0-100 | Registration trust score |
| registrationIp | varchar(45) | IP address at registration |
| userPreferences | json | JSON config with keys: `translationLanguage`, `translationModel`, `telegramNotifyLevel`, `telegramDeliveryFailing` |
| **TELEGRAM FIELDS:** | | |
| telegramChatId | varchar(64) | Telegram chat ID for notifications |
| telegramUsername | varchar(64) | Telegram username |
| telegramVerified | boolean | Verified flag |
| telegramVerifiedAt | timestamp | Verification timestamp |
| **RECOVERY CONTACTS:** | | |
| backupEmail | varchar(320) | Recovery email |
| backupEmailVerified | boolean | Recovery email verified flag |
| phone | varchar(20) | Phone number |
| phoneVerified | boolean | Phone verified flag |
| **2FA:** | | |
| twoFactorEnabled | boolean | 2FA enabled flag |
| twoFactorSecret | text | Encrypted TOTP secret (base32) |
| recoveryCodes | json | Array of bcrypt-hashed recovery codes |
| **TIMESTAMPS:** | | |
| createdAt | timestamp | Account creation |
| updatedAt | timestamp | Last update |
| lastSignedIn | timestamp | Last login |
| passwordChangedAt | timestamp | Last password change |

### registrationEvents table
Logs every registration attempt for duplicate/fraud detection.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users | |
| email | varchar(320) | Email attempted |
| normalizedEmail | varchar(320) | Normalized for comparison |
| ipAddress | varchar(45) | Registration IP |
| fingerprintHash | varchar(64) | Browser fingerprint hash |
| userAgent | text | Browser user agent string |
| loginMethod | varchar(64) | Method used |
| trustScore | integer | Trust score assigned |
| outcome | varchar(20) | `allowed`, `flagged`, or `blocked` |
| metadata | json | Additional context |
| createdAt | timestamp | Event timestamp |
| **Indexes:** created_user_idx(createdAt, userId) |

### deviceFingerprints table
Links browser fingerprints to users for device tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users(onDelete:cascade) | User who used this device |
| fingerprintHash | varchar(64) | Browser fingerprint hash |
| firstSeenAt | timestamp | First time seen |
| lastSeenAt | timestamp | Most recent use |
| seenCount | integer | Number of times seen |

### blockedPatterns table
Admin-managed blocklist for fraud prevention.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| patternType | varchar(20) | one of: `email_domain`, `email`, `ip`, `fingerprint` |
| pattern | varchar(320) | Pattern to block (e.g., "*.ru" for domains) |
| reason | text | Reason for blocking |
| createdBy | integer FK→users | Admin who created the block |
| isActive | boolean | Whether block is active |
| createdAt | timestamp | When created |

---

## 2. MULTI-TENANCY

### tenants table
White-label multi-tenant system. Each tenant is a separate branded instance.

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PRIMARY KEY | e.g., "tenant-abc123" |
| slug | varchar(64) UNIQUE | URL slug (e.g., "smartspec", "acme-corp") |
| name | varchar(255) | Display name |
| primaryDomain | varchar(255) UNIQUE | Primary domain (e.g., "smartspec.ai") |
| domains | json | Additional domains (array) |
| logoUrl | varchar(512) | Tenant logo |
| websiteLogoUrl | varchar(512) | Header/footer logo |
| faviconUrl | varchar(512) | Favicon |
| isActive | boolean | Active flag |
| **SEO CONFIG:** | json | Keys: `defaultTitle`, `defaultDescription`, `defaultKeywords[]`, `ogImage`, `twitterCard`, `aiContext`, `aiKeyFacts[]`, `structuredData`, `geoTargeting{country,region,city,language,coordinates}` |
| seoConfig | | |
| **THEME CONFIG:** | json | Keys: `primaryColor`, `secondaryColor`, `accentColor`, `backgroundColor`, `textColor`, `fontFamily`, `headingFont`, `layout`, `headerStyle`, `footerStyle`, `buttonStyle`, `cardStyle`, `customCss` |
| themeConfig | | |
| **CONTACT INFO:** | json | Keys: `email`, `phone`, `address`, `socialLinks{facebook,twitter,linkedin,instagram,youtube}` |
| contactInfo | | |
| **SETTINGS:** | json | Feature flags: `enableBlog`, `enableGallery`, `enableEcommerce`, `enableBooking`; Analytics: `googleAnalyticsId`, `facebookPixelId`; Integrations: `stripePublicKey`, `mailchimpApiKey`; Custom fields |
| settings | | |
| ownerId | integer FK→users | Tenant owner/admin |
| status | varchar(20) | From Python backend: `ACTIVE` |
| plan | varchar(20) | From Python backend: `FREE` |
| createdAt | timestamp | Tenant creation |
| updatedAt | timestamp | Last update |

---

## 3. CONVERSATIONS & MESSAGES

### conversations table
Main table for chat sessions.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users(onDelete:cascade) | Conversation owner |
| title | varchar(255) | Conversation title |
| model | varchar(100) | Default LLM model (e.g., "gpt-4o-mini") |
| temperature | numeric(3,2) | Temperature 0-2 (default 0.7) |
| systemPrompt | text | Custom system prompt |
| **SKILL SETTINGS:** | json | Keys: `autoDetect`, `enabledSkills[]`, `detectionMode("ask"\|"auto"\|"explicit")` |
| skillSettings | | |
| isArchived | boolean | Archived flag |
| isPinned | boolean | Pinned flag |
| trashedAt | timestamp | Soft delete (auto-purged after 30 days) |
| totalCreditsUsed | numeric(12,4) | Cumulative credits used |
| messageCount | integer | Number of messages |
| projectId | varchar(100) | For cross-session memory linking |
| memoryMode | varchar(20) | `full`, `no_long`, or `off` |
| brainstormPartnerModel | varchar(100) | Model B for brainstorming |
| brainstormMaxRounds | integer | Max rounds per session (default 3) |
| createdAt | timestamp | Created |
| updatedAt | timestamp | Last updated |

### messages table
Individual messages within a conversation. Supports multi-modal content.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| conversationId | integer FK→conversations(onDelete:cascade) | Parent conversation |
| role | messageRoleEnum | one of: `user`, `assistant`, `system` |
| content | text | Message text content |
| inputTokens | integer | Input tokens used |
| outputTokens | integer | Output tokens used |
| creditsUsed | numeric(10,4) | Credits charged for this message |
| modelUsed | varchar(100) | Which model generated response |
| **ATTACHMENTS:** | json | Array of {type, url, key, name, size, mimeType, thumbnail} |
| attachments | | Types: `image`, `file`, `audio`, `video` |
| **ARTIFACTS:** | json | Array of {id, type, title, content, language, metadata} |
| artifacts | | Types: `code`, `markdown`, `image`, `video`, `pdf`, `file`, `slideshow`, `chart`, `table` |
| skillUsed | varchar(100) | Name of skill that generated this (if any) |
| skillArgs | json | Arguments passed to skill |
| error | text | Error message if generation failed |
| isRegenerated | boolean | Whether message was regenerated |
| parentMessageId | integer | Parent message ID (for regenerated messages) |
| createdAt | timestamp | Created |
| **Indexes:** created_at_idx |

### conversationSummaries table
LLM-generated summaries for memory compression.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| conversationId | integer FK→conversations(onDelete:cascade) | |
| summary | text | Generated summary |
| messageRangeStart | integer | First message ID summarized |
| messageRangeEnd | integer | Last message ID summarized |
| messageCount | integer | Number of messages summarized |
| tokensUsed | integer | Tokens to generate summary |
| projectId | varchar(100) | For cross-session sharing |
| createdAt | timestamp | |

### entityMemories table
Long-term facts about users, projects, preferences persisting across conversations.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users(onDelete:cascade) | |
| entityType | entityTypeEnum | one of: `user`, `project`, `preference`, `technical`, `decision`, `plan`, `architecture`, `component`, `task`, `code_knowledge`, `rule` |
| entityName | varchar(255) | Entity name (e.g., "SmartSpecPro") |
| facts | json | Array of fact strings |
| sourceConversationId | integer FK→conversations(onDelete:set null) | Where fact was learned |
| projectId | varchar(100) | Project scope (null = global) |
| confidence | numeric(3,2) | Confidence score 0-1 |
| lastAccessedAt | timestamp | Last accessed time |
| importance | integer 1-10 | Importance score |
| source | varchar(20) | `auto`, `manual`, or `suggested` |
| reinforcementCount | integer | Times reinforced |
| createdAt | timestamp | |
| updatedAt | timestamp | |

---

## 4. NOTIFICATIONS & SCHEDULING

### scheduledMessages table
Recurring or one-time scheduled prompts.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users(onDelete:cascade) | Creator/owner |
| conversationId | integer FK→conversations(onDelete:set null) | Target conversation (null = create new) |
| targetUserId | integer FK→users(onDelete:cascade) | Recipient (null = self) |
| prompt | text | Prompt to send to LLM |
| cronExpression | varchar(100) | Cron for recurring (e.g., "0 8 * * *") |
| timezone | varchar(64) | User timezone (default "Asia/Bangkok") |
| scheduledAt | timestamp | One-time schedule |
| isRecurring | boolean | Recurring flag |
| status | scheduleStatusEnum | one of: `active`, `paused`, `completed`, `failed` |
| modelId | varchar(128) | LLM model to use |
| dynamicParams | json | Dynamic parameters for skill execution |
| skillId | varchar(100) | Skill to execute (default "chat-alert") |
| isSimpleReminder | boolean | Skip LLM, show prompt as-is (0 credits) |
| priority | reminderPriorityEnum | one of: `low`, `normal`, `high`, `critical` (critical = full-screen modal) |
| emailNotify | boolean | Send email on execution |
| description | text | Human-readable description |
| lastRunAt | timestamp | Last execution |
| nextRunAt | timestamp | Next scheduled run |
| bullmqJobId | varchar(255) | BullMQ job ID for cancellation |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| **Indexes:** user_status(userId, status); user_created(userId, createdAt); status_idx |

### scheduledMessageLogs table
Execution history for scheduled messages.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| scheduledMessageId | integer FK→scheduledMessages(onDelete:cascade) | |
| executedAt | timestamp | Execution time |
| responseContent | text | LLM response |
| creditsUsed | numeric(10,4) | Credits consumed |
| status | varchar(20) | `success` or `failure` |
| error | text | Error message if failed |
| **Indexes:** schedule_id_executed_at(scheduledMessageId, executedAt) |

### userNotifications table
In-app notification center.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users(onDelete:cascade) | |
| type | notificationTypeEnum | one of: `scheduled_message`, `follow_request`, `alert`, `system` |
| title | varchar(255) | Notification title |
| content | text | Notification content |
| conversationId | integer FK→conversations(onDelete:set null) | Related conversation (if any) |
| scheduledMessageId | integer FK→scheduledMessages(onDelete:set null) | Related schedule (if any) |
| priority | reminderPriorityEnum | one of: `low`, `normal`, `high`, `critical` |
| isRead | boolean | Read flag |
| createdAt | timestamp | |
| **Indexes:** user_read(userId, isRead, createdAt); user_priority(userId, isRead, priority) |

### directMessages table
User-to-user messaging. Max 10 messages for follows, unlimited for mutual follows.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| senderId | integer FK→users(onDelete:cascade) | Sender |
| receiverId | integer FK→users(onDelete:cascade) | Recipient |
| content | text | Message content |
| isUrgent | boolean | Shows as pop-up alert |
| isRead | boolean | Read flag |
| createdAt | timestamp | |

---

## 5. BILLING & CREDITS

### creditTransactions table
All credit movements for billing and audit.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users | |
| amount | integer | Positive (add) or negative (deduct) |
| type | transactionTypeEnum | one of: `purchase`, `usage`, `bonus`, `refund`, `adjustment`, `subscription` |
| description | varchar(512) | Human-readable description |
| metadata | json | Keys: `model`, `provider`, `tokensUsed`, `costUsd`, `endpoint`, `traceId` |
| createdAt | timestamp | |

---

## 6. LLM PROVIDER MANAGEMENT & USAGE LOGS

### providerUsageLog table
**Tracks all LLM requests for billing, usage analysis, and rate limiting.**

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| userId | integer FK→users | |
| providerId | integer FK→llmProviders | |
| modelUsed | varchar(128) | Model name |
| inputTokens | integer | Tokens in |
| outputTokens | integer | Tokens out |
| costUsd | numeric(12,8) | Provider-reported or calculated cost |
| creditsCharged | integer | Credits deducted from user |
| responseTimeMs | integer | Latency |
| statusCode | integer | HTTP status |
| errorType | varchar(64) | Error classification: `rate_limit`, `timeout`, `server_error` |
| traceId | varchar(32) | Audit trace correlation |
| errorMessage | text | Error details |
| requestType | varchar(32) | Type of request |
| wasFallback | boolean | Whether this was a fallback attempt |
| fallbackFromProviderId | integer FK→llmProviders | Original provider that failed |
| createdAt | timestamp | |
| **Indexes:** user_created(userId, createdAt); provider_created(providerId, createdAt); trace_id_idx |

### apiAuditEvents table
Structured logging for media/skill/LLM requests with trace correlation.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| traceId | varchar(32) | Trace ID for correlation |
| eventType | varchar(64) | Event type (e.g., `llm_request`, `skill_execute`, `media_generate`) |
| userId | integer FK→users | |
| endpoint | varchar(512) | API endpoint called |
| model | varchar(128) | LLM model |
| provider | varchar(64) | Provider name |
| statusCode | integer | HTTP status |
| errorMessage | text | Error details |
| responseTimeMs | integer | Latency |
| creditsCharged | integer | Credits used |
| costUsd | numeric(12,8) | Cost in USD |
| skillSlug | varchar(100) | Skill name (if skill event) |
| mediaType | varchar(20) | Media type (if media event) |
| mediaTaskId | varchar(128) | Media task ID |
| metadata | json | Additional context |
| sandboxJobId | varchar(36) | OpenSandbox job ID |
| opensandboxId | varchar(128) | OpenSandbox container ID |
| createdAt | timestamp | |
| **Indexes:** trace_id_idx; user_created(userId, createdAt); type_created(eventType, createdAt) |

### routingRules table
Admin-configured provider routing preferences.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| modelPattern | varchar(128) | Pattern: "*", "kimi-*", or exact model ID |
| routingMode | varchar(32) | Strategy: `cost`, `quality`, `priority` |
| providerOrder | json | Array of provider IDs for priority mode |
| maxFallbacks | integer | Max fallback attempts (default 3) |
| isActive | boolean | Active flag |
| createdAt | timestamp | |

---

## 7. SYSTEM SETTINGS

### systemSettings table
Global or category-specific settings.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| category | varchar(64) | e.g., `stripe`, `invoice`, `email`, `smtp` |
| key | varchar(128) | Setting key |
| value | text | String value |
| valueJson | json | Complex JSON value |
| isSensitive | boolean | Masked in UI (for secrets like API keys) |
| description | text | Human description |
| updatedBy | integer | User who updated it |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### invoiceConfig table
Customizable invoice headers (per-tenant or global).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| tenantId | varchar(36) FK→tenants(onDelete:cascade) | Tenant (null = global) |
| companyName | varchar(256) | Invoice company name |
| addressLine1,2 | varchar(256) | Address |
| city, state, postalCode | varchar(128,32) | Location |
| country | varchar(128) | Country |
| taxId | varchar(64) | Tax/VAT ID |
| email | varchar(256) | Company email |
| phone | varchar(64) | Company phone |
| website | varchar(256) | Company website |
| logoUrl | varchar(512) | Invoice logo |
| footerText | text | Invoice footer |
| termsText | text | Terms and conditions |
| bankDetails | json | Keys: `bankName`, `accountName`, `accountNumber`, `routingNumber`, `swiftCode`, `iban` |
| customFields | json | Array of {label, value} |
| isActive | boolean | Active flag |
| createdAt | timestamp | |
| updatedAt | timestamp | |

---

## 8. GOOGLE DRIVE & ONEDRIVE INTEGRATION

### googleDriveSyncState table
Per-user Google Drive sync configuration and webhook tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| tenantId | varchar(36) FK→tenants(onDelete:cascade) | |
| userId | integer FK→users(onDelete:cascade) | |
| indexingMode | indexingModeEnum | one of: `none`, `selected_folders`, `all_except`, `all` |
| folderSelections | jsonb | Array of folder IDs to sync |
| fileTypeFilter | jsonb | Array of file types to include |
| maxFileSizeBytes | integer | Max file size (default 50MB) |
| channelId | varchar(128) | Google webhook channel ID |
| channelTokenHash | varchar(128) | Hash of channel token (for security) |
| channelExpiry | timestamp | Channel expiry |
| filesTotal | integer | Total files count |
| filesProcessed | integer | Processed count |
| lastSyncAt | timestamp | Last sync time |
| lastError | text | Last error message |
| autoSyncEnabled | boolean | Auto-sync flag |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| **Indexes:** unique(tenant_id, user_id); channel_id_idx |

### googleDriveEditSessions table
Tracks active Google Docs/Sheets editing sessions for library files.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PRIMARY KEY | |
| tenantId | varchar(36) FK→tenants(onDelete:cascade) | |
| userId | integer FK→users(onDelete:cascade) | |
| libraryItemId | integer FK→libraryItems(onDelete:cascade) | |
| driveFileId | varchar(128) | Google Drive file ID |
| editUrl | text | Google Docs/Sheets edit URL |
| originalSourceUrl | text | Original upload source |
| status | editSessionStatusEnum | one of: `active`, `saved_back`, `discarded`, `expired` |
| expiresAt | timestamp | Session expiry |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| **Indexes:** tenant_user_status(tenant_id, user_id, status); library_item_idx; expires_at_idx |

---

## 9. ENUMS (Type Definitions)

| Enum Name | Values |
|-----------|--------|
| roleEnum | `user`, `admin`, `domain_admin` |
| planEnum | `free`, `starter`, `pro`, `enterprise` |
| transactionTypeEnum | `purchase`, `usage`, `bonus`, `refund`, `adjustment`, `subscription` |
| messageRoleEnum | `user`, `assistant`, `system` |
| entityTypeEnum | `user`, `project`, `preference`, `technical`, `decision`, `plan`, `architecture`, `component`, `task`, `code_knowledge`, `rule` |
| scheduleStatusEnum | `active`, `paused`, `completed`, `failed` |
| notificationTypeEnum | `scheduled_message`, `follow_request`, `alert`, `system` |
| reminderPriorityEnum | `low`, `normal`, `high`, `critical` |
| followStatusEnum | `active`, `blocked` |
| indexingModeEnum | `none`, `selected_folders`, `all_except`, `all` |
| editSessionStatusEnum | `active`, `saved_back`, `discarded`, `expired` |

---

## 10. KEY RELATIONSHIPS

### User-Centric View
```
users (1)
  ├─→ conversations (many, userId FK)
  │    ├─→ messages (many, conversationId FK)
  │    ├─→ conversationSummaries (many)
  │    └─→ entityMemories (1 source reference)
  ├─→ scheduledMessages (many, userId FK)
  │    ├─→ scheduledMessageLogs (many)
  │    └─→ userNotifications (many, scheduledMessageId FK)
  ├─→ creditTransactions (many, userId FK)
  ├─→ providerUsageLog (many, userId FK)
  ├─→ userNotifications (many, userId FK)
  ├─→ directMessages (many, senderId or receiverId FK)
  └─→ tenants (many, via currentTenantId or ownerId)
```

### Tenant-Centric View
```
tenants (1)
  ├─→ users (many, ownerId or registeredDomain)
  ├─→ workflows (many, tenantId FK)
  ├─→ googleDriveSyncState (many)
  ├─→ googleDriveEditSessions (many)
  ├─→ invoiceConfig (optional)
  └─→ menuConfig (many)
```

### Audit Trail
```
traceId (correlates across tables)
  ├─→ providerUsageLog.traceId
  ├─→ apiAuditEvents.traceId
  └─→ creditTransactions.metadata.traceId
```

---

## 11. MIGRATION STRUCTURE

Located in `apps/web/drizzle/` directory:

**Migration files (42 total):**
- 0000-0042: Sequential numbered migrations
- Format: `NNNN_descriptive_name.sql`
- Examples:
  - `0011_add_audit_logging.sql` — Added providerUsageLog and apiAuditEvents
  - `0013_apply_telegram_columns.sql` — Added Telegram fields to users
  - `0019_unified_library_schema.sql`
  - `0032_presentation_schema.sql`
  - `0042_quiet_jane_foster.sql` (latest)

**Migration metadata:**
- `drizzle/meta/_journal.json` — Tracks applied migrations
- `drizzle/meta/0_snapshot.json` — Initial schema snapshot
- Format: Each entry has idx, version, when (timestamp), tag

**Drizzle Kit commands:**
- `pnpm db:push` — Generates new migration + applies
- `drizzle-kit generate` — Compare schema.ts to DB, create SQL
- `drizzle-kit migrate` — Apply pending migrations

---

## 12. NO EXISTING TELEGRAM-SPECIFIC TABLE

**Important finding:** There is **NO dedicated `telegram_bots` or `telegram_integrations` table.**

Telegram integration exists only as:
1. **User fields** (in `users` table):
   - telegramChatId, telegramUsername, telegramVerified, telegramVerifiedAt
   - userPreferences.telegramNotifyLevel
   - userPreferences.telegramDeliveryFailing

2. **Notification system** (generic):
   - userNotifications table (type: `scheduled_message`, `follow_request`, `alert`, `system`)
   - scheduledMessages (with priority levels)
   - No Telegram-specific storage for bot tokens, channel IDs, etc.

**Implication for multi-channel strategy:**
- **Email** delivery exists (emailNotify flag on scheduledMessages)
- **In-app** notifications exist (userNotifications table)
- **Telegram** exists only as user preference + contact info
- **SMS/Channel abstraction** would be NEW and needs design

---

## 13. CHANNEL & NOTIFICATION ABSTRACTION OPPORTUNITIES

Current notification flow:
```
scheduledMessages
  ├─ Simple reminder mode (just display prompt)
  └─ LLM mode (process through LLM)
       ↓
       (execution)
       ↓
userNotifications (in-app only)
  + userPreferences.telegramNotifyLevel (user-level flag)
  + emailNotify flag on scheduledMessages
```

**Design gaps for multi-channel:**
- No explicit "channel" concept in scheduledMessages or userNotifications
- Email delivery is opt-in flag but not tracked/audited
- Telegram is contact info only, no delivery guarantee or retry logic
- SMS channel not present

**New tables needed for proper multi-channel support:**
- `notification_channels` (definition)
- `user_channel_preferences` (overrides)
- `notification_delivery_log` (audit trail)

See separate file: `database-schema-telegram-design.md`
