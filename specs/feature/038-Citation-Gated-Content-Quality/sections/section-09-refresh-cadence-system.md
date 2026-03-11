# Section 09 — Refresh Cadence & Content Staleness Detection

## Objective

Create a system to store CMS-formatted content artifacts, track their `last_verified_at` timestamps, and detect when content becomes stale based on `refresh_cadence_days`.

## Scope

1. Create `content_artifacts` database table
2. Create staleness checker service
3. Create BullMQ repeating job for staleness detection
4. Add tRPC endpoints for saving and querying artifacts

## Primary files

- `apps/web/drizzle/schema.ts` — add content_artifacts table
- `apps/web/server/services/contentStalenessChecker.ts` — NEW: staleness logic
- `apps/web/server/services/contentArtifactStore.ts` — NEW: CRUD for artifacts
- `apps/web/server/routers/contentArtifacts.ts` — NEW: tRPC router
- `apps/web/server/jobs/contentRefreshJob.ts` — NEW: BullMQ job

## Database schema

```typescript
// In drizzle/schema.ts
export const contentArtifacts = pgTable("content_artifacts", {
  id: serial("id").primaryKey(),
  tenantId: text("tenantId").notNull(),
  userId: integer("userId").notNull(),
  skillSlug: text("skillSlug").notNull(),
  outputFormat: text("outputFormat").notNull(),  // cms_article | cms_review | markdown
  contentJson: jsonb("contentJson"),
  qualityScore: jsonb("qualityScore"),  // QualityReport from Section 05
  lastVerifiedAt: timestamp("lastVerifiedAt", { withTimezone: true }),
  refreshCadenceDays: integer("refreshCadenceDays").default(30),
  nextRefreshAt: timestamp("nextRefreshAt", { withTimezone: true }),
  status: text("status").default("active"),  // active | stale | archived
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});
```

## Staleness checker

```typescript
export async function checkAndMarkStaleContent(): Promise<number>;
// Returns count of newly stale items
// Updates status='stale' where nextRefreshAt < NOW() and status='active'
```

## BullMQ job

Repeating job every 6 hours:
```typescript
// contentRefreshJob.ts
const queue = new Queue("content-refresh");
queue.add("check-staleness", {}, {
  repeat: { pattern: "0 */6 * * *" }  // every 6 hours
});
```

## tRPC endpoints

```typescript
contentArtifacts.save      // save new artifact after skill execution
contentArtifacts.getById   // get single artifact
contentArtifacts.list      // list artifacts with filters (status, skill, tenant)
contentArtifacts.getStale  // list stale artifacts
contentArtifacts.refresh   // mark artifact for refresh (reset next_refresh_at)
contentArtifacts.archive   // archive artifact
```

## Acceptance criteria

1. `content_artifacts` table created via Drizzle migration
2. Artifacts can be saved with CMS JSON content + quality report
3. Staleness checker correctly marks items past their refresh date
4. BullMQ job runs on schedule
5. tRPC endpoints protected by auth middleware
6. `nextRefreshAt` calculated as `lastVerifiedAt + refreshCadenceDays`

## Test file

`apps/web/server/services/contentStalenessChecker.test.ts`

Test cases:
- Artifact with nextRefreshAt in past → marked stale
- Artifact with nextRefreshAt in future → stays active
- Archived artifact → not checked
- Save artifact → nextRefreshAt calculated correctly
- List stale → returns only stale items
