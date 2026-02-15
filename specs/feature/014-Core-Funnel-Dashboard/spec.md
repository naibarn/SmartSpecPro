# Feature 014: Core Funnel Dashboard

## 1. Overview

### 1.1 Problem Statement

SmartSpecPro มีระบบ tracking ข้อมูลดิบที่ครอบคลุม (registration events, credit transactions, LLM usage logs, media audit events) แต่ไม่มี Admin Dashboard สำหรับ **visualize Core Funnel** ที่ช่วยให้เข้าใจ:

- ผู้ใช้มาจากไหน, drop off ตรงไหน, convert เมื่อไหร่
- Feature ไหนถูกใช้งานมากที่สุด
- Revenue metrics (ARPU, MRR, credit velocity)
- Retention & churn patterns
- Cohort analysis (users registered week X → % still active week X+4)

### 1.2 Goal

สร้าง **Admin Funnel Dashboard** (`/admin/funnel`) ที่แสดง AARRR metrics:

| Stage | What We Measure |
|-------|----------------|
| **Acquisition** | Signups, registration outcome, trust score, channels |
| **Activation** | First login → first conversation → first LLM request → first media generation |
| **Revenue** | Credit purchases, subscription upgrades, ARPU, MRR |
| **Retention** | DAU/WAU/MAU, cohort retention table, churn rate |
| **Referral** | (Phase 2 — not in this spec) |

### 1.3 Scope

**In Scope:**
- New admin page `/admin/funnel` with 6 dashboard tabs
- New tRPC router `funnelAnalytics` with 10+ procedures
- New `funnel_events` tracking table for explicit funnel stage tracking
- Database indexes for funnel query performance
- Missing PostHog/GA4 events (login, email verification, feature usage)
- CSV/JSON export for all metrics
- Auto-refresh (30s configurable)

**Out of Scope:**
- Referral/invite tracking (Phase 2)
- Custom funnel builder UI (Phase 2)
- Real-time streaming updates via WebSocket (existing SSE sufficient)
- A/B testing integration (use PostHog Experiments directly)
- External BI tool integration (Metabase/Looker)

---

## 2. Data Architecture

### 2.1 Existing Data Sources (No Changes Needed)

These tables already contain the raw data for funnel analysis:

| Table | Funnel Use | Key Columns |
|-------|-----------|-------------|
| `users` | User lifecycle | `id`, `createdAt`, `lastSignedIn`, `plan`, `credits`, `role`, `trustScore`, `loginMethod` |
| `registration_events` | Acquisition funnel | `userId`, `email`, `outcome` (allowed/flagged/blocked), `trustScore`, `loginMethod`, `createdAt` |
| `device_fingerprints` | Device-level tracking | `userId`, `fingerprintHash`, `firstSeenAt`, `lastSeenAt`, `seenCount` |
| `email_verification_tokens` | Verification funnel | `userId`, `email`, `code`, `expiresAt`, `usedAt`, `createdAt` |
| `conversations` | Engagement | `userId`, `model`, `messageCount`, `totalCreditsUsed`, `createdAt` |
| `messages` | Content engagement | `conversationId`, `role`, `creditsUsed`, `modelUsed`, `skillUsed`, `createdAt` |
| `provider_usage_log` | LLM usage & cost | `userId`, `modelUsed`, `inputTokens`, `outputTokens`, `costUsd`, `creditsCharged`, `responseTimeMs`, `statusCode`, `errorType`, `createdAt` |
| `api_audit_events` | Media/skill tracking | `userId`, `eventType`, `skillSlug`, `mediaType`, `creditsCharged`, `costUsd`, `responseTimeMs`, `createdAt` |
| `credit_transactions` | Monetization | `userId`, `amount`, `type` (purchase/usage/bonus/refund/adjustment/subscription), `balanceAfter`, `referenceId`, `createdAt` |
| `credit_packages` | Pricing catalog | `name`, `credits`, `priceUsd`, `packageType`, `billingPeriod`, `stripePriceId` |
| `user_credit_budgets` | Spend tracking | `userId`, `monthlyLimit`, `creditsUsedThisMonth`, `budgetMonthKey` |
| `video_editor_projects` | Video engagement | `userId`, `clipCount`, `duration`, `createdAt` |
| `workflows` | Automation adoption | `userId`, `status`, `createdAt` |
| `workflow_executions` | Automation usage | `userId`, `workflowId`, `status`, `creditsUsed`, `createdAt` |
| `library_items` | Asset management | `ownerUserId`, `itemType`, `source`, `createdAt` |
| `skills` | Feature catalog | `slug`, `name`, `category`, `executionMode` |
| `media_callback_events` | Media reliability | `providerName`, `status`, `attemptCount`, `createdAt` |

### 2.2 New Table: `funnel_events`

Explicit funnel stage tracking for events not captured elsewhere.

```sql
CREATE TABLE funnel_events (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name      VARCHAR(64) NOT NULL,     -- e.g. 'signup_completed', 'email_verified', 'first_login'
  event_category  VARCHAR(32) NOT NULL,     -- 'acquisition', 'activation', 'revenue', 'retention', 'engagement'
  properties      JSONB DEFAULT '{}',       -- flexible properties per event
  session_id      VARCHAR(64),              -- browser session ID (nullable)
  source          VARCHAR(32) DEFAULT 'server', -- 'server', 'client', 'webhook'
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Performance indexes for funnel queries
CREATE INDEX idx_funnel_events_user_created ON funnel_events (user_id, created_at);
CREATE INDEX idx_funnel_events_name_created ON funnel_events (event_name, created_at);
CREATE INDEX idx_funnel_events_category_created ON funnel_events (event_category, created_at);
```

**Drizzle Schema Definition:**

```typescript
// In drizzle/schema.ts
export const funnelEvents = pgTable("funnel_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventName: varchar("event_name", { length: 64 }).notNull(),
  eventCategory: varchar("event_category", { length: 32 }).notNull(),
  properties: json("properties").$type<Record<string, unknown>>().default({}),
  sessionId: varchar("session_id", { length: 64 }),
  source: varchar("source", { length: 32 }).default("server"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_funnel_events_user_created").on(table.userId, table.createdAt),
  index("idx_funnel_events_name_created").on(table.eventName, table.createdAt),
  index("idx_funnel_events_category_created").on(table.eventCategory, table.createdAt),
]);
```

### 2.3 New Indexes on Existing Tables

These indexes are **required** for funnel query performance:

```sql
-- users: funnel cohort queries
CREATE INDEX idx_users_created_at ON users ("createdAt");
CREATE INDEX idx_users_last_signed_in ON users ("lastSignedIn");
CREATE INDEX idx_users_plan ON users (plan);

-- registration_events: acquisition funnel
CREATE INDEX idx_registration_events_created ON registration_events ("createdAt");
CREATE INDEX idx_registration_events_outcome ON registration_events (outcome, "createdAt");

-- credit_transactions: monetization funnel
CREATE INDEX idx_credit_transactions_user_created ON credit_transactions ("userId", "createdAt");
CREATE INDEX idx_credit_transactions_type_created ON credit_transactions (type, "createdAt");

-- conversations: activation funnel
CREATE INDEX idx_conversations_user_created ON conversations ("userId", "createdAt");

-- messages: engagement depth
CREATE INDEX idx_messages_conversation_created ON messages ("conversationId", "createdAt");
```

---

## 3. Funnel Events Catalog

### 3.1 Event Definitions

Every funnel-trackable event, its source, and how it's captured:

#### Acquisition Events

| Event Name | Category | Source | Trigger Point | Properties | Status |
|-----------|----------|--------|--------------|-----------|--------|
| `signup_started` | acquisition | client | Signup page rendered | `{ plan_selected }` | **EXISTS** (PostHog client) |
| `signup_plan_selected` | acquisition | client | Plan card clicked on signup | `{ plan: "free"\|"pro" }` | **NEW** |
| `signup_completed` | acquisition | client | After successful registration | `{ plan, auth_method }` | **EXISTS** (PostHog client) |
| `signup_blocked` | acquisition | server | Registration blocked by trust score | `{ reason, trust_score, ip }` | **NEW** — emit from `registrationEvents` INSERT |
| `email_verification_sent` | acquisition | server | Verification email dispatched | `{ email, channel }` | **NEW** |
| `email_verified` | acquisition | server | Email verification code used | `{ email, time_to_verify_sec }` | **NEW** — emit when `usedAt` is set |
| `signup_bonus_granted` | acquisition | server | Signup credits awarded | `{ credits, is_first_user }` | **NEW** |

#### Activation Events

| Event Name | Category | Source | Trigger Point | Properties | Status |
|-----------|----------|--------|--------------|-----------|--------|
| `first_login` | activation | server | First `lastSignedIn` update after creation | `{ auth_method, time_since_signup_sec }` | **NEW** |
| `login` | activation | client | Every successful login | `{ auth_method }` | **EXISTS** as `login_succeeded` |
| `login_failed` | activation | client | Failed login attempt | `{ failure_reason, auth_method }` | **EXISTS** (PostHog client) |
| `first_conversation` | activation | server | First conversation created | `{ model, time_since_signup_sec }` | **NEW** |
| `first_llm_request` | activation | server | First row in `providerUsageLog` | `{ model, provider, time_since_signup_sec }` | **NEW** |
| `first_media_generation` | activation | server | First `mediaType != null` in `apiAuditEvents` | `{ media_type, skill_slug, time_since_signup_sec }` | **NEW** |
| `first_skill_used` | activation | server | First `skillSlug != null` in `apiAuditEvents` | `{ skill_slug, skill_category }` | **NEW** |
| `first_workflow_created` | activation | server | First workflow entry | `{ time_since_signup_sec }` | **NEW** |
| `first_video_project` | activation | server | First videoEditorProjects entry | `{ time_since_signup_sec }` | **NEW** |

#### Revenue Events

| Event Name | Category | Source | Trigger Point | Properties | Status |
|-----------|----------|--------|--------------|-----------|--------|
| `credit_purchased` | revenue | server | `creditTransactions.type = 'purchase'` | `{ amount, price_usd, package_name, stripe_id }` | **NEW** |
| `subscription_started` | revenue | server | `creditTransactions.type = 'subscription'` (first) | `{ plan, billing_period, price_usd }` | **NEW** |
| `subscription_renewed` | revenue | server | `creditTransactions.type = 'subscription'` (recurring) | `{ plan, billing_period }` | **NEW** |
| `plan_upgraded` | revenue | server | `users.plan` changed to higher tier | `{ from_plan, to_plan }` | **NEW** |
| `plan_downgraded` | revenue | server | `users.plan` changed to lower tier | `{ from_plan, to_plan }` | **NEW** |
| `credits_depleted` | revenue | server | `users.credits` reaches 0 | `{ last_transaction_type }` | **NEW** |
| `budget_alert_triggered` | revenue | server | `userCreditBudgets.alertSent` = true | `{ usage_pct, monthly_limit }` | **NEW** |

#### Engagement Events

| Event Name | Category | Source | Trigger Point | Properties | Status |
|-----------|----------|--------|--------------|-----------|--------|
| `conversation_created` | engagement | server | New conversation | `{ model, has_system_prompt }` | **NEW** |
| `message_sent` | engagement | server | New user message | `{ conversation_id, has_attachments }` | **NEW** |
| `skill_executed` | engagement | server | Skill execution completed | `{ skill_slug, skill_category, success, credits_used }` | **NEW** |
| `media_generated` | engagement | server | Media generation completed | `{ media_type, model, provider, success }` | **NEW** |
| `media_generation_failed` | engagement | server/python | Media generation failed | `{ media_type, error_message }` | **EXISTS** (PostHog Python) |
| `workflow_executed` | engagement | server | Workflow execution completed | `{ workflow_id, status, credits_used, node_count }` | **NEW** |
| `library_item_created` | engagement | server | New library item added | `{ item_type, source }` | **NEW** |
| `video_project_saved` | engagement | server | Video project auto-save | `{ clip_count, duration, track_count }` | **NEW** |
| `feature_explored` | engagement | client | Admin/skill marketplace browsed | `{ feature_name, page_path }` | **NEW** |

#### Retention Events

| Event Name | Category | Source | Trigger Point | Properties | Status |
|-----------|----------|--------|--------------|-----------|--------|
| `session_started` | retention | client | App loaded with auth | `{ days_since_last_visit }` | **NEW** |
| `daily_active` | retention | server | First request of the day per user | `{ request_type }` | **NEW** — computed |
| `churned` | retention | server | No activity for 30+ days | `{ last_active_date, days_inactive }` | **NEW** — computed by cron |
| `reactivated` | retention | server | Active again after 14+ days inactive | `{ days_inactive, trigger_action }` | **NEW** — computed |

### 3.2 Event Emission Strategy

Events are emitted to **3 destinations** simultaneously:

```
┌──────────────┐
│  Event Source │ (signup, login, media gen, etc.)
└──────┬───────┘
       │
       ├──────────────→  funnel_events table (PostgreSQL)  ← for SQL dashboard queries
       │
       ├──────────────→  PostHog captureServerEvent()      ← for PostHog dashboards
       │
       └──────────────→  GA4 Measurement Protocol          ← if analytics_provider = "ga4" | "both"
```

**Implementation: FunnelTracker Service**

```typescript
// apps/web/server/services/funnelTracker.ts

import { db } from "../_core/database";
import { funnelEvents } from "../../drizzle/schema";
import { captureServerEvent } from "./posthog";
import { sendGA4Event } from "./ga4"; // new service

export interface FunnelEventParams {
  userId: number;
  eventName: string;
  eventCategory: "acquisition" | "activation" | "revenue" | "retention" | "engagement";
  properties?: Record<string, unknown>;
  sessionId?: string;
  source?: "server" | "client" | "webhook";
}

export async function trackFunnelEvent(params: FunnelEventParams): Promise<void> {
  // 1. Insert into funnel_events table
  await db.insert(funnelEvents).values({
    userId: params.userId,
    eventName: params.eventName,
    eventCategory: params.eventCategory,
    properties: params.properties ?? {},
    sessionId: params.sessionId,
    source: params.source ?? "server",
  });

  // 2. Send to PostHog (non-blocking)
  captureServerEvent(
    String(params.userId),
    `funnel_${params.eventName}`,
    params.properties,
  );

  // 3. Send to GA4 if configured (non-blocking)
  sendGA4Event(params.userId, params.eventName, params.properties);
}
```

### 3.3 "First" Event Detection

Activation "first_*" events need to check if the user has done this before:

```typescript
export async function trackFirstEvent(
  userId: number,
  eventName: string, // e.g. "first_llm_request"
  properties?: Record<string, unknown>,
): Promise<boolean> {
  // Check if already tracked
  const existing = await db
    .select({ id: funnelEvents.id })
    .from(funnelEvents)
    .where(
      and(
        eq(funnelEvents.userId, userId),
        eq(funnelEvents.eventName, eventName),
      ),
    )
    .limit(1);

  if (existing.length > 0) return false; // Already tracked

  // Calculate time since signup
  const user = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  const timeSinceSignup = user[0]
    ? Math.floor((Date.now() - user[0].createdAt.getTime()) / 1000)
    : null;

  await trackFunnelEvent({
    userId,
    eventName,
    eventCategory: "activation",
    properties: { ...properties, time_since_signup_sec: timeSinceSignup },
  });

  return true;
}
```

---

## 4. GA4 Measurement Protocol Service

New service for sending server-side events to Google Analytics 4:

```typescript
// apps/web/server/services/ga4.ts

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export async function sendGA4Event(
  userId: number,
  eventName: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  const provider = process.env.ANALYTICS_PROVIDER || "posthog";

  if (!measurementId || !apiSecret) return;
  if (provider !== "ga4" && provider !== "both") return;

  try {
    await fetch(
      `${GA4_ENDPOINT}?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: `server_${userId}`,
          user_id: String(userId),
          events: [{
            name: eventName.slice(0, 40), // GA4 max 40 chars
            params: {
              ...params,
              engagement_time_msec: 1, // required for GA4
            },
          }],
        }),
      },
    );
  } catch {
    // Fire-and-forget, don't block the request
  }
}
```

---

## 5. Backend API Design

### 5.1 tRPC Router: `funnelAnalytics`

**File:** `apps/web/server/routers/funnelAnalytics.ts`

All procedures are **admin-only** (`requireAdmin` middleware).

#### 5.1.1 `getAcquisitionFunnel`

```typescript
input: z.object({
  dateFrom: z.string(), // ISO date "2026-01-01"
  dateTo: z.string(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
})

output: {
  summary: {
    totalSignups: number;
    allowedSignups: number;
    blockedSignups: number;
    flaggedSignups: number;
    emailVerified: number;
    emailVerificationRate: number;       // verified / allowed (%)
    averageTrustScore: number;
  };
  timeSeries: Array<{
    date: string;
    signups: number;
    verified: number;
    blocked: number;
    flagged: number;
  }>;
  byLoginMethod: Array<{
    method: string;                      // 'email', 'google', 'github'
    count: number;
    percentage: number;
  }>;
  byPlan: Array<{
    plan: string;                        // 'free', 'starter', 'pro', 'enterprise'
    count: number;
    percentage: number;
  }>;
}
```

**SQL Strategy:**
```sql
-- Time series signups with outcomes
SELECT
  DATE_TRUNC(:granularity, re."createdAt") AS date,
  COUNT(*) FILTER (WHERE re.outcome = 'allowed') AS signups,
  COUNT(*) FILTER (WHERE re.outcome = 'blocked') AS blocked,
  COUNT(*) FILTER (WHERE re.outcome = 'flagged') AS flagged
FROM registration_events re
WHERE re."createdAt" BETWEEN :dateFrom AND :dateTo
GROUP BY 1
ORDER BY 1;

-- Email verification rate
SELECT
  COUNT(DISTINCT evt."userId") AS verified
FROM email_verification_tokens evt
WHERE evt."usedAt" IS NOT NULL
  AND evt."createdAt" BETWEEN :dateFrom AND :dateTo;
```

#### 5.1.2 `getActivationFunnel`

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  cohortType: z.enum(["signup_date", "all"]).default("all"),
})

output: {
  stages: Array<{
    stage: string;                       // 'signup', 'email_verified', 'first_login', 'first_conversation', 'first_llm_request', 'first_media_generation'
    count: number;
    percentage: number;                  // % of previous stage
    percentageOfTotal: number;           // % of first stage
    medianTimeToReachSec: number | null; // median time from signup to this stage
  }>;
  dropOff: Array<{
    fromStage: string;
    toStage: string;
    dropOffCount: number;
    dropOffPercent: number;
  }>;
  timeToActivate: {
    p25Sec: number;
    p50Sec: number;
    p75Sec: number;
    p95Sec: number;
  };
}
```

**SQL Strategy:**
```sql
-- Activation funnel stages for users who signed up in date range
WITH cohort AS (
  SELECT id, "createdAt" AS signup_at
  FROM users
  WHERE "createdAt" BETWEEN :dateFrom AND :dateTo
),
-- Stage: email verified
verified AS (
  SELECT DISTINCT evt."userId"
  FROM email_verification_tokens evt
  WHERE evt."usedAt" IS NOT NULL
    AND evt."userId" IN (SELECT id FROM cohort)
),
-- Stage: first login (lastSignedIn > createdAt)
first_login AS (
  SELECT u.id
  FROM users u
  JOIN cohort c ON u.id = c.id
  WHERE u."lastSignedIn" > u."createdAt" + INTERVAL '1 minute'
),
-- Stage: first conversation
first_conv AS (
  SELECT DISTINCT c."userId"
  FROM conversations c
  WHERE c."userId" IN (SELECT id FROM cohort)
),
-- Stage: first LLM request
first_llm AS (
  SELECT DISTINCT p."userId"
  FROM provider_usage_log p
  WHERE p."userId" IN (SELECT id FROM cohort)
),
-- Stage: first media generation
first_media AS (
  SELECT DISTINCT a."userId"
  FROM api_audit_events a
  WHERE a."mediaType" IS NOT NULL
    AND a."userId" IN (SELECT id FROM cohort)
)
SELECT
  (SELECT COUNT(*) FROM cohort) AS signup_count,
  (SELECT COUNT(*) FROM verified) AS verified_count,
  (SELECT COUNT(*) FROM first_login) AS first_login_count,
  (SELECT COUNT(*) FROM first_conv) AS first_conv_count,
  (SELECT COUNT(*) FROM first_llm) AS first_llm_count,
  (SELECT COUNT(*) FROM first_media) AS first_media_count;
```

#### 5.1.3 `getRevenueFunnel`

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
})

output: {
  summary: {
    totalRevenue: number;                // USD from credit purchases
    totalCreditsCharged: number;
    totalCreditsPurchased: number;
    uniquePayers: number;
    arpu: number;                        // avg revenue per user (all users)
    arppu: number;                       // avg revenue per paying user
    freeToPayConversionRate: number;     // % of free users who purchased
    creditVelocity: number;              // credits consumed per day (avg)
  };
  timeSeries: Array<{
    date: string;
    revenue: number;                     // USD
    creditsPurchased: number;
    creditsUsed: number;
    uniquePayers: number;
    newPayers: number;                   // first-time purchasers
  }>;
  byPackageType: Array<{
    packageType: string;                 // 'one_time', 'subscription', 'agency'
    revenue: number;
    count: number;
  }>;
  byPlan: Array<{
    plan: string;
    userCount: number;
    totalRevenue: number;
    avgCreditsUsed: number;
  }>;
  topSpenders: Array<{
    userId: number;
    name: string | null;
    email: string | null;
    totalPurchased: number;
    totalUsed: number;
    currentBalance: number;
    plan: string;
  }>;
}
```

**SQL Strategy:**
```sql
-- Revenue summary
SELECT
  SUM(CASE WHEN ct.type = 'purchase' THEN ct.amount ELSE 0 END) AS total_credits_purchased,
  COUNT(DISTINCT CASE WHEN ct.type = 'purchase' THEN ct."userId" END) AS unique_payers,
  SUM(CASE WHEN ct.type = 'usage' THEN ABS(ct.amount) ELSE 0 END) AS total_credits_used
FROM credit_transactions ct
WHERE ct."createdAt" BETWEEN :dateFrom AND :dateTo;

-- Revenue USD (join with credit_packages for price)
-- 1 credit = $0.001 USD
SELECT SUM(ct.amount) * 0.001 AS revenue_usd
FROM credit_transactions ct
WHERE ct.type = 'purchase'
  AND ct."createdAt" BETWEEN :dateFrom AND :dateTo;

-- Free-to-pay conversion
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM credit_transactions ct2
      WHERE ct2."userId" = u.id AND ct2.type = 'purchase'
    )
  ) AS paying_users
FROM users u
WHERE u."createdAt" BETWEEN :dateFrom AND :dateTo;
```

#### 5.1.4 `getRetentionCohorts`

```typescript
input: z.object({
  cohortGranularity: z.enum(["day", "week", "month"]).default("week"),
  periods: z.number().min(1).max(24).default(12), // number of periods to show
  activityType: z.enum(["login", "llm_request", "any_request"]).default("any_request"),
})

output: {
  cohorts: Array<{
    cohortDate: string;                  // e.g. "2026-W05" or "2026-01"
    cohortSize: number;                  // users who signed up in this period
    retention: Array<{
      period: number;                    // 0, 1, 2, ... (0 = signup period)
      activeUsers: number;
      retentionRate: number;             // % of cohort still active
    }>;
  }>;
  averageRetention: Array<{
    period: number;
    avgRetentionRate: number;
  }>;
}
```

**SQL Strategy:**
```sql
-- Weekly cohort retention (activity = any providerUsageLog or apiAuditEvents row)
WITH cohorts AS (
  SELECT
    id AS user_id,
    DATE_TRUNC('week', "createdAt") AS cohort_week
  FROM users
  WHERE "createdAt" >= NOW() - INTERVAL '12 weeks'
),
activity AS (
  -- Union of all activity sources
  SELECT "userId" AS user_id, DATE_TRUNC('week', "createdAt") AS active_week
  FROM provider_usage_log
  WHERE "createdAt" >= NOW() - INTERVAL '12 weeks'
  UNION
  SELECT "userId", DATE_TRUNC('week', "createdAt")
  FROM api_audit_events
  WHERE "createdAt" >= NOW() - INTERVAL '12 weeks'
)
SELECT
  c.cohort_week,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  EXTRACT(WEEK FROM a.active_week - c.cohort_week) AS period,
  COUNT(DISTINCT a.user_id) AS active_users
FROM cohorts c
LEFT JOIN activity a ON c.user_id = a.user_id
  AND a.active_week >= c.cohort_week
GROUP BY c.cohort_week, period
ORDER BY c.cohort_week, period;
```

#### 5.1.5 `getEngagementMetrics`

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
})

output: {
  summary: {
    dau: number;                         // distinct users today
    wau: number;                         // distinct users this week
    mau: number;                         // distinct users this month
    dauWauRatio: number;                 // stickiness: DAU/WAU
    avgSessionsPerUser: number;
    avgConversationsPerUser: number;
    avgMessagesPerConversation: number;
  };
  timeSeries: Array<{
    date: string;
    activeUsers: number;
    conversations: number;
    messages: number;
    llmRequests: number;
    mediaGenerations: number;
    creditsUsed: number;
  }>;
  featureAdoption: Array<{
    feature: string;                     // 'chat', 'media_image', 'media_video', 'media_audio', 'workflow', 'video_editor', 'library'
    uniqueUsers: number;
    totalUsage: number;
    percentOfActiveUsers: number;
  }>;
  skillUsage: Array<{
    skillSlug: string;
    skillName: string;
    category: string;
    executionCount: number;
    uniqueUsers: number;
    avgCreditsPerUse: number;
    successRate: number;
  }>;
  modelUsage: Array<{
    model: string;
    provider: string;
    requestCount: number;
    uniqueUsers: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number;
  }>;
}
```

**SQL Strategy:**
```sql
-- DAU/WAU/MAU from providerUsageLog + apiAuditEvents
SELECT
  COUNT(DISTINCT CASE
    WHEN "createdAt" >= CURRENT_DATE THEN "userId"
  END) AS dau,
  COUNT(DISTINCT CASE
    WHEN "createdAt" >= DATE_TRUNC('week', CURRENT_DATE) THEN "userId"
  END) AS wau,
  COUNT(DISTINCT CASE
    WHEN "createdAt" >= DATE_TRUNC('month', CURRENT_DATE) THEN "userId"
  END) AS mau
FROM (
  SELECT "userId", "createdAt" FROM provider_usage_log
  WHERE "createdAt" >= DATE_TRUNC('month', CURRENT_DATE)
  UNION ALL
  SELECT "userId", "createdAt" FROM api_audit_events
  WHERE "createdAt" >= DATE_TRUNC('month', CURRENT_DATE)
) combined;

-- Feature adoption
SELECT
  CASE
    WHEN a."mediaType" = 'image' THEN 'media_image'
    WHEN a."mediaType" = 'video' THEN 'media_video'
    WHEN a."mediaType" = 'audio' THEN 'media_audio'
    WHEN a."skillSlug" IS NOT NULL THEN 'skill'
    ELSE 'chat'
  END AS feature,
  COUNT(DISTINCT a."userId") AS unique_users,
  COUNT(*) AS total_usage
FROM api_audit_events a
WHERE a."createdAt" BETWEEN :dateFrom AND :dateTo
GROUP BY 1;

-- Skill usage breakdown
SELECT
  a."skillSlug",
  s.name AS skill_name,
  s.category,
  COUNT(*) AS execution_count,
  COUNT(DISTINCT a."userId") AS unique_users,
  AVG(a."creditsCharged") AS avg_credits,
  COUNT(*) FILTER (WHERE a."statusCode" < 400)::float / NULLIF(COUNT(*), 0) AS success_rate
FROM api_audit_events a
LEFT JOIN skills s ON s.slug = a."skillSlug"
WHERE a."eventType" = 'skill_execute'
  AND a."createdAt" BETWEEN :dateFrom AND :dateTo
GROUP BY a."skillSlug", s.name, s.category
ORDER BY execution_count DESC;
```

#### 5.1.6 `getUserLifecycleStages`

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
})

output: {
  stages: Array<{
    stage: string;     // 'new', 'activated', 'engaged', 'power_user', 'paying', 'churned', 'dormant'
    count: number;
    percentage: number;
  }>;
  stageDefinitions: Record<string, string>; // description of each stage
}
```

**Stage Definitions:**

| Stage | Definition |
|-------|-----------|
| `new` | Signed up, no conversations yet |
| `activated` | Created at least 1 conversation |
| `engaged` | 5+ conversations OR 20+ messages in the period |
| `power_user` | 20+ conversations OR 100+ messages OR used 3+ features |
| `paying` | At least 1 `purchase` credit transaction |
| `churned` | Was `engaged` or `power_user` but inactive 30+ days |
| `dormant` | Was `activated` but inactive 14-30 days |

#### 5.1.7 `getFunnelTimeSeries`

Combined daily metrics for the overview dashboard tab.

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
})

output: {
  daily: Array<{
    date: string;
    signups: number;
    activeUsers: number;
    conversations: number;
    llmRequests: number;
    mediaGenerations: number;
    creditsUsed: number;
    revenue: number;
  }>;
}
```

#### 5.1.8 `getKPISummary`

Top-level KPI cards for the dashboard header.

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
})

output: {
  current: {
    totalUsers: number;
    newUsersInPeriod: number;
    activeUsersInPeriod: number;
    totalRevenue: number;
    arpu: number;
    signupToActivationRate: number;
    freeToPayRate: number;
    churnRate: number;
  };
  previousPeriod: { /* same shape — for % change calculation */ };
  percentChange: {
    totalUsers: number;        // +12.5 means 12.5% increase
    newUsersInPeriod: number;
    activeUsersInPeriod: number;
    totalRevenue: number;
    arpu: number;
    signupToActivationRate: number;
    freeToPayRate: number;
    churnRate: number;
  };
}
```

#### 5.1.9 `exportFunnelData`

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  section: z.enum(["acquisition", "activation", "revenue", "retention", "engagement", "all"]),
  format: z.enum(["csv", "json"]).default("csv"),
})

output: {
  data: string; // CSV or JSON string
  filename: string;
}
```

#### 5.1.10 `getFunnelEvents`

Raw funnel events viewer (for debugging/investigation).

```typescript
input: z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  userId: z.number().optional(),
  eventName: z.string().optional(),
  eventCategory: z.string().optional(),
  limit: z.number().min(1).max(500).default(100),
  offset: z.number().min(0).default(0),
})

output: {
  events: Array<{
    id: number;
    userId: number;
    userName: string | null;
    eventName: string;
    eventCategory: string;
    properties: Record<string, unknown>;
    source: string;
    createdAt: string;
  }>;
  total: number;
}
```

---

## 6. Frontend Design

### 6.1 Route & Page

**Route:** `/admin/funnel`
**Component:** `apps/web/client/src/pages/AdminFunnelDashboard.tsx`
**Access:** Admin and domain_admin only

### 6.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Core Funnel Dashboard                   [Date Range] [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│  KPI Cards Row (8 cards with % change vs previous period)       │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │ Users  │ │New Sign│ │ Active │ │Revenue │ ...                │
│  │ 1,234  │ │  +45   │ │  892   │ │$1,234  │                   │
│  │ +12.5% │ │ -8.3%  │ │ +5.2%  │ │ +22.1% │                   │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Acquisition] [Activation] [Revenue] [Retention]    │
│  [Engagement]                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  (Tab content — see sections below)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Tab: Overview

Combined daily chart + user lifecycle stage distribution.

```
┌─────────────────────────────────────────────────┐
│  Daily Activity (Line Chart)                     │
│  ┌─────────────────────────────────────────────┐ │
│  │  📈 Signups / Active Users / Revenue        │ │
│  │  (Recharts LineChart, toggleable series)     │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  User Lifecycle Stages (Horizontal Stacked Bar)  │
│  ┌──────────────────────────────────────────────┐│
│  │ New ██ Activated ████ Engaged ██████ Power ██││
│  │ Paying ███ Dormant ██ Churned █              ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 6.4 Tab: Acquisition

```
┌─────────────────────────────────────────────────┐
│  Registration Funnel (Bar Chart)                 │
│  Started → Completed → Verified → First Login    │
│  100%   → 78%       → 65%      → 52%            │
├──────────────────────┬──────────────────────────┤
│  By Login Method     │  By Plan Selection        │
│  ┌─────────────────┐ │  ┌──────────────────────┐ │
│  │ Email: 65%      │ │  │ Free: 82%            │ │
│  │ Google: 28%     │ │  │ Pro: 15%             │ │
│  │ GitHub: 7%      │ │  │ Enterprise: 3%       │ │
│  └─────────────────┘ │  └──────────────────────┘ │
├──────────────────────┴──────────────────────────┤
│  Signup Time Series (Line Chart)                 │
│  Daily signups with allowed/blocked/flagged      │
├─────────────────────────────────────────────────┤
│  Trust Score Distribution (Histogram)            │
│  0-20: ██ 21-40: █ 41-60: ███ 61-80: █████████ │
│  81-100: ████████████████████████████████████████│
└─────────────────────────────────────────────────┘
```

### 6.5 Tab: Activation

```
┌─────────────────────────────────────────────────┐
│  Activation Funnel (Funnel Chart)                │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Signup              ████████████ 1,000  │    │
│  │  Email Verified      ██████████   820    │    │
│  │  First Login         ████████     680    │    │
│  │  First Conversation  ██████       520    │    │
│  │  First LLM Request   █████        440    │    │
│  │  First Media Gen     ███          280    │    │
│  │  First Skill Used    ██           180    │    │
│  └──────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  Time to Activate (Box Plot or Percentile Table) │
│  ┌──────────────────────────────────────────┐    │
│  │ Metric              P25   P50   P75  P95 │    │
│  │ Signup→Login        2m    15m   2h   3d  │    │
│  │ Login→1st Conv      5m    30m   4h   7d  │    │
│  │ Conv→1st LLM Req    <1m   2m    15m  1d  │    │
│  │ LLM→1st Media       10m   2h    2d   14d │    │
│  └──────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  Drop-off Analysis (Table)                       │
│  ┌──────────────────────────────────────────┐    │
│  │ Stage Transition    Drop    % Lost       │    │
│  │ Signup → Verified   180     18.0%        │    │
│  │ Verified → Login    140     17.1%        │    │
│  │ Login → 1st Conv    160     23.5%  ⚠️    │    │
│  │ Conv → 1st LLM       80    15.4%        │    │
│  │ LLM → 1st Media     160    36.4%  🔴    │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 6.6 Tab: Revenue

```
┌─────────────────────────────────────────────────┐
│  Revenue Summary Cards                           │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │ Rev │ │ARPU │ │ARPPU│ │Conv%│ │Veloc│       │
│  │$12K │ │$9.7 │ │$48  │ │8.2% │ │450/d│       │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │
├─────────────────────────────────────────────────┤
│  Revenue Time Series (Line/Bar Chart)            │
│  Revenue + Credits Purchased + Credits Used      │
├──────────────────────┬──────────────────────────┤
│  By Package Type     │  By Plan                  │
│  Pie/Donut Chart     │  Horizontal Bar Chart     │
├──────────────────────┴──────────────────────────┤
│  Top Spenders (Table)                            │
│  User | Email | Purchased | Used | Balance | Plan│
│  #1   | a@b   | 50,000   | 42K  | 8,000  | pro │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

### 6.7 Tab: Retention

```
┌─────────────────────────────────────────────────┐
│  Retention Cohort Table (Heatmap)                │
│  ┌──────────────────────────────────────────┐    │
│  │ Cohort    Size  W0    W1    W2    W3 ... │    │
│  │ Feb W1    120   100%  62%   45%   38%    │    │
│  │ Feb W2    135   100%  58%   42%   --     │    │
│  │ Feb W3    98    100%  65%   --    --     │    │
│  │ (cells colored green→yellow→red by %)    │    │
│  └──────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  Average Retention Curve (Line Chart)            │
│  X: Week since signup, Y: % retained            │
├─────────────────────────────────────────────────┤
│  Churn/Dormant Summary                           │
│  Active: 892 | Dormant (14-30d): 156            │
│  Churned (30d+): 234 | Reactivated: 28          │
└─────────────────────────────────────────────────┘
```

### 6.8 Tab: Engagement

```
┌─────────────────────────────────────────────────┐
│  DAU/WAU/MAU Cards + Stickiness Ratio            │
├─────────────────────────────────────────────────┤
│  Engagement Time Series (Line Chart)             │
│  Active Users / Conversations / LLM Requests     │
├──────────────────────┬──────────────────────────┤
│  Feature Adoption    │  Skill Usage Ranking      │
│  ┌─────────────────┐ │  ┌──────────────────────┐ │
│  │ Chat     85%    │ │  │ image-gen    4,520   │ │
│  │ Media    42%    │ │  │ code-assist  3,100   │ │
│  │ Workflow 12%    │ │  │ video-gen    1,200   │ │
│  │ Video Ed  8%    │ │  │ summarize      980   │ │
│  │ Library  15%    │ │  │ translate      650   │ │
│  └─────────────────┘ │  └──────────────────────┘ │
├──────────────────────┴──────────────────────────┤
│  Model Usage (Table)                             │
│  Model | Provider | Requests | Tokens | Cost     │
│  gpt-4o | openai  | 12,500  | 45M   | $234     │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

### 6.9 Shared Components

#### Date Range Picker

```typescript
interface DateRangeProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  presets: Array<{ label: string; days: number }>; // "7d", "30d", "90d", "YTD"
}
```

**Presets:** Last 7 days, Last 30 days, Last 90 days, This month, Last month, Year to date, Custom range

#### KPI Card

```typescript
interface KPICardProps {
  label: string;
  value: string | number;
  previousValue?: number;
  percentChange?: number;   // auto-colored: green positive, red negative
  icon?: LucideIcon;
  format?: "number" | "currency" | "percent";
}
```

#### Funnel Chart

Custom SVG funnel visualization (no external library needed):

```typescript
interface FunnelChartProps {
  stages: Array<{
    label: string;
    value: number;
    percentage: number;
  }>;
  colors?: string[];
}
```

#### Cohort Heatmap Table

```typescript
interface CohortHeatmapProps {
  cohorts: Array<{
    label: string;
    size: number;
    retention: number[]; // retention % per period
  }>;
  periodLabel: string;   // "Week" | "Month"
}
```

### 6.10 Chart Library

**Use `recharts`** — already likely a dependency or lightweight enough to add:

```bash
pnpm add recharts
```

Components needed: `LineChart`, `BarChart`, `PieChart`, `ResponsiveContainer`, `Tooltip`, `Legend`

Custom components: `FunnelChart` (SVG), `CohortHeatmap` (HTML table with CSS colors)

---

## 7. Event Emission Integration Points

Where to add `trackFunnelEvent()` calls in existing code:

### 7.1 Registration Flow

| File | Location | Event |
|------|---------|-------|
| `server/routers/users.ts` | After successful user creation | `signup_completed` (server-side duplicate for DB) |
| `server/routers/users.ts` | When registration blocked | `signup_blocked` |
| `server/routers/users.ts` | After email verification code sent | `email_verification_sent` |
| `server/routers/users.ts` | After email verification code used | `email_verified` |
| `server/services/creditService.ts` | After signup bonus granted | `signup_bonus_granted` |

### 7.2 Activation Flow

| File | Location | Event |
|------|---------|-------|
| `server/routers/auth.ts` or login handler | After successful auth | `first_login` (use `trackFirstEvent`) |
| `server/routers/chat.ts` | After new conversation created | `first_conversation` + `conversation_created` |
| `server/services/costTracker.ts` | After `logRequest()` | `first_llm_request` (use `trackFirstEvent`) |
| `server/services/skillExecutor.ts` | After successful execution | `first_skill_used` + `skill_executed` |
| `server/routers/mediaJobs.ts` | After media job submitted | `first_media_generation` (use `trackFirstEvent`) |

### 7.3 Revenue Flow

| File | Location | Event |
|------|---------|-------|
| `server/services/creditService.ts` | `addCredits()` with type=purchase | `credit_purchased` |
| `server/services/creditService.ts` | `addCredits()` with type=subscription | `subscription_started` / `subscription_renewed` |
| `server/routers/users.ts` or admin | After plan change | `plan_upgraded` / `plan_downgraded` |
| `server/services/creditService.ts` | When `deductCredits()` → balance=0 | `credits_depleted` |

### 7.4 Engagement Flow

| File | Location | Event |
|------|---------|-------|
| `server/routers/chat.ts` | After new message saved | `message_sent` |
| `server/routers/workflows.ts` | After execution completed | `workflow_executed` |
| `server/routers/library.ts` | After item created | `library_item_created` |
| `server/routers/videoEditor.ts` | After project saved | `video_project_saved` |

### 7.5 Retention (Computed)

| Method | Timing | Event |
|--------|--------|-------|
| Daily cron job or scheduled task | Once per day | Compute `daily_active`, `churned`, `reactivated` |
| Login handler | On each login | `session_started` with `days_since_last_visit` |

---

## 8. Backfill Strategy

For existing users/data before `funnel_events` table exists:

### 8.1 One-Time Backfill Script

```typescript
// scripts/backfill-funnel-events.ts
// Run after migration: npx tsx scripts/backfill-funnel-events.ts

async function backfill() {
  // 1. Backfill signup_completed from users table
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT id, 'signup_completed', 'acquisition',
      jsonb_build_object('plan', plan, 'backfilled', true),
      'backfill', "createdAt"
    FROM users
    ON CONFLICT DO NOTHING
  `);

  // 2. Backfill email_verified
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT DISTINCT evt."userId", 'email_verified', 'acquisition',
      jsonb_build_object('backfilled', true),
      'backfill', evt."usedAt"
    FROM email_verification_tokens evt
    WHERE evt."usedAt" IS NOT NULL
    ON CONFLICT DO NOTHING
  `);

  // 3. Backfill first_conversation
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT c."userId", 'first_conversation', 'activation',
      jsonb_build_object('model', c.model, 'backfilled', true),
      'backfill', c."createdAt"
    FROM conversations c
    WHERE c.id = (
      SELECT MIN(c2.id) FROM conversations c2 WHERE c2."userId" = c."userId"
    )
    ON CONFLICT DO NOTHING
  `);

  // 4. Backfill first_llm_request
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT p."userId", 'first_llm_request', 'activation',
      jsonb_build_object('model', p."modelUsed", 'backfilled', true),
      'backfill', p."createdAt"
    FROM provider_usage_log p
    WHERE p.id = (
      SELECT MIN(p2.id) FROM provider_usage_log p2 WHERE p2."userId" = p."userId"
    )
    ON CONFLICT DO NOTHING
  `);

  // 5. Backfill first_media_generation
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT a."userId", 'first_media_generation', 'activation',
      jsonb_build_object('media_type', a."mediaType", 'backfilled', true),
      'backfill', a."createdAt"
    FROM api_audit_events a
    WHERE a."mediaType" IS NOT NULL
      AND a.id = (
        SELECT MIN(a2.id) FROM api_audit_events a2
        WHERE a2."userId" = a."userId" AND a2."mediaType" IS NOT NULL
      )
    ON CONFLICT DO NOTHING
  `);

  // 6. Backfill credit_purchased
  await db.execute(sql`
    INSERT INTO funnel_events (user_id, event_name, event_category, properties, source, created_at)
    SELECT ct."userId", 'credit_purchased', 'revenue',
      jsonb_build_object('amount', ct.amount, 'backfilled', true),
      'backfill', ct."createdAt"
    FROM credit_transactions ct
    WHERE ct.type = 'purchase'
    ON CONFLICT DO NOTHING
  `);
}
```

### 8.2 Backfill Order

1. Run `drizzle-kit migrate` to create `funnel_events` table + indexes
2. Run backfill script
3. Deploy new code with `trackFunnelEvent()` calls
4. Verify event counts match expected

---

## 9. Performance Considerations

### 9.1 Query Performance Targets

| Query | Target | Strategy |
|-------|--------|----------|
| KPI summary | < 500ms | Aggregate from indexed tables, limit date range |
| Acquisition funnel | < 300ms | Index on `registration_events.createdAt` |
| Activation funnel | < 1s | CTE with early termination per stage |
| Revenue summary | < 500ms | Index on `credit_transactions(type, createdAt)` |
| Retention cohorts | < 2s | Limit to 12 periods, use `UNION ALL` for activity |
| Engagement metrics | < 1s | Pre-computed DAU/WAU/MAU from indexed columns |
| Funnel events list | < 200ms | Paginated with offset, indexed `(event_name, createdAt)` |

### 9.2 Caching Strategy

```typescript
// Cache expensive queries in Redis (30s TTL for auto-refresh)
const CACHE_TTL = 30; // seconds

// Key pattern: funnel:{procedure}:{hash(input)}
// Example: funnel:getKPISummary:a1b2c3d4
```

- KPI summary: cache 30s (matches auto-refresh interval)
- Retention cohorts: cache 5 min (expensive query, slow-changing data)
- Engagement metrics: cache 30s
- Funnel events list: no cache (user expects real-time)

### 9.3 Large Dataset Handling

For deployments with 100K+ users:

1. **Materialized view** for retention cohorts (refresh hourly via cron)
2. **Partitioned `funnel_events`** table by month if > 10M rows
3. **Date range limit**: UI enforces max 90-day range for heavy queries
4. **Async export**: Large CSV exports via BullMQ job instead of sync response

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Test File | What It Tests |
|-----------|--------------|
| `funnelTracker.test.ts` | `trackFunnelEvent()`, `trackFirstEvent()`, deduplication logic |
| `ga4.test.ts` | GA4 Measurement Protocol event formatting, error handling |
| `funnelAnalytics.test.ts` | Each tRPC procedure with mock data |

### 10.2 Integration Tests

| Test | What It Verifies |
|------|-----------------|
| Acquisition funnel query | Correct counts from `registration_events` + `email_verification_tokens` |
| Activation funnel stages | CTEs return correct stage progression |
| Revenue calculations | ARPU, conversion rate math accuracy |
| Retention cohort SQL | Correct cohort bucketing and period calculation |
| Event emission | `trackFunnelEvent` writes to DB + calls PostHog |

### 10.3 Test Data Factory

```typescript
// tests/factories/funnelFactory.ts
export function createTestUser(overrides?: Partial<NewUser>): Promise<User>;
export function createTestRegistrationEvent(userId: number, outcome?: string): Promise<void>;
export function createTestConversation(userId: number): Promise<void>;
export function createTestLLMRequest(userId: number): Promise<void>;
export function createTestCreditTransaction(userId: number, type: string, amount: number): Promise<void>;
export function createTestFunnelEvent(userId: number, eventName: string): Promise<void>;
```

---

## 11. Security & Access Control

### 11.1 Access Rules

- All `funnelAnalytics` procedures require `role = 'admin' OR role = 'domain_admin'`
- Domain admins see only their tenant's users (`WHERE tenantId = currentTenant`)
- User PII (email, name) shown only to admins, not exported in CSV by default
- Raw `funnel_events.properties` may contain session IDs — sanitize before display

### 11.2 Rate Limiting

- Funnel queries: 30 requests/minute per admin (prevent dashboard reload loops)
- CSV export: 5 exports/minute per admin
- No public access to any funnel endpoint

### 11.3 Data Retention

- `funnel_events` table: retain 1 year, archive older to cold storage
- Auto-cleanup via scheduled job: `DELETE FROM funnel_events WHERE created_at < NOW() - INTERVAL '1 year'`
- Configurable via `system_settings` key `funnel_retention_days` (default 365)

---

## 12. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Basic funnel visibility with existing data

1. Create `funnel_events` table + indexes on existing tables
2. Create `FunnelTracker` service (`trackFunnelEvent`, `trackFirstEvent`)
3. Create `ga4.ts` service (GA4 Measurement Protocol)
4. Create `funnelAnalytics` tRPC router (all 10 procedures)
5. Create `/admin/funnel` page with 6 tabs
6. Add chart library (`recharts`)
7. Implement KPI cards, Acquisition tab, Activation funnel
8. Implement Revenue tab, Retention cohort table
9. Implement Engagement tab with feature/skill/model breakdown
10. Add CSV/JSON export
11. Run backfill script for existing data
12. Add `trackFunnelEvent()` calls to critical paths (signup, login, first_*, purchase)

### Phase 2: Deep Tracking

**Goal:** Comprehensive event coverage

13. Add all remaining funnel events from Section 3 catalog
14. Add daily cron for computed events (churned, reactivated, daily_active)
15. Add session_started tracking on client
16. Add feature_explored tracking on client
17. Add caching layer for expensive queries
18. Add auto-refresh toggle (15s / 30s / 60s / off)

### Phase 3: Advanced Analytics

**Goal:** Power user features

19. Custom date comparison (this week vs last week)
20. User drilldown (click user in table → see their full journey)
21. Funnel segment filters (by plan, by login method, by date cohort)
22. Materialized views for retention cohorts (for scale)
23. Alerting: notify admin when churn rate exceeds threshold
24. PostHog dashboard sync (push funnel definitions to PostHog)

---

## 13. File Structure

```
apps/web/
├── client/src/
│   ├── pages/
│   │   └── AdminFunnelDashboard.tsx          # Main dashboard page
│   └── components/admin/funnel/
│       ├── KPICards.tsx                       # Top-level KPI row
│       ├── FunnelChart.tsx                    # Custom SVG funnel visualization
│       ├── CohortHeatmap.tsx                 # Retention cohort heatmap table
│       ├── AcquisitionTab.tsx                # Acquisition funnel tab
│       ├── ActivationTab.tsx                 # Activation funnel tab
│       ├── RevenueTab.tsx                    # Revenue analytics tab
│       ├── RetentionTab.tsx                  # Retention & cohort tab
│       ├── EngagementTab.tsx                 # Engagement & feature adoption tab
│       ├── OverviewTab.tsx                   # Combined overview tab
│       └── FunnelDateRange.tsx               # Date range picker with presets
├── server/
│   ├── routers/
│   │   └── funnelAnalytics.ts               # tRPC router (10+ procedures)
│   └── services/
│       ├── funnelTracker.ts                  # Event tracking service
│       └── ga4.ts                            # GA4 Measurement Protocol
├── drizzle/
│   └── schema.ts                            # + funnel_events table definition
└── scripts/
    └── backfill-funnel-events.ts            # One-time data backfill

python-backend/
└── app/services/
    └── funnel_tracker.py                    # Python-side funnel event emission (optional)
```

---

## 14. Dependencies

### New Dependencies

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `recharts` | ^2.x | Charts (Line, Bar, Pie) | ~180KB gzipped |

### Existing Dependencies Used

- `@radix-ui/*` — Tabs, Cards, Badges, Tables
- `lucide-react` — Icons
- `sonner` — Toast notifications
- `zod` — Input validation
- `drizzle-orm` — Database queries
- `ioredis` — Cache layer

---

## 15. Success Metrics

After deployment, the dashboard itself should help track:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Signup → Activation rate | > 50% | Activation funnel stage 1→3 |
| Time to first LLM request | < 10 min median | Activation time-to-reach |
| Free → Paid conversion | > 5% | Revenue funnel |
| Week 4 retention | > 30% | Retention cohort table |
| DAU/WAU stickiness | > 40% | Engagement metrics |
| Dashboard page load time | < 2s | Frontend performance |
| Funnel query latency | < 1s (p95) | Backend monitoring |

---

## 16. Open Questions

| # | Question | Impact | Suggested Answer |
|---|---------|--------|------------------|
| 1 | Should we add `recharts` or use a lighter alternative? | Bundle size | Use recharts — mature, React-native, widely used |
| 2 | Should retention cohort use login or any-activity? | Metric definition | Default: any-activity (LLM request or media gen), configurable |
| 3 | Max date range for heavy queries? | Performance | 90 days for cohort, 365 days for simple counts |
| 4 | Should funnel events be sent to PostHog AND stored in DB? | Data consistency | Yes — DB for SQL queries, PostHog for their dashboards |
| 5 | Multi-tenant isolation for domain_admin? | Access control | Yes — filter by tenantId for domain_admin role |
| 6 | Should we partition funnel_events table from day 1? | Scalability | No — add partitioning in Phase 3 if > 5M rows |
