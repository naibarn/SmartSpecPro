# Section 10 — Quality Dashboard & KPI Tracking

## Objective

Create a dashboard page showing content quality metrics: citation coverage, cost per piece, staleness, disclosure compliance, and structured data validity.

## Scope

1. Create tRPC router with aggregation queries
2. Create React dashboard page with charts and tables
3. Display key KPIs from content_artifacts and providerUsageLog

## Primary files

- `apps/web/server/routers/contentQuality.ts` — NEW: tRPC router for metrics
- `apps/web/client/src/pages/ContentQualityDashboard.tsx` — NEW: dashboard page
- `apps/web/client/src/main.tsx` or routing config — add route

## tRPC endpoints

```typescript
contentQuality.getOverview     // summary stats across all content
contentQuality.getBySkill      // per-skill breakdown
contentQuality.getStaleList    // list of stale content items
contentQuality.getCostBreakdown // token costs by skill type
contentQuality.getTimeline     // metrics over time
```

### getOverview response

```typescript
{
  total_artifacts: number;
  active: number;
  stale: number;
  avg_citation_coverage: number;
  avg_quality_score: number;
  disclosure_compliance: number;  // % of artifacts with required disclosure
  stale_critical: number;         // stale items with critical claims
}
```

### getBySkill response

```typescript
{
  skill_slug: string;
  count: number;
  avg_citation_coverage: number;
  avg_cost_usd: number;
  stale_count: number;
  last_generated: string;
}[]
```

## Dashboard layout

```
┌──────────────────────────────────────────────────────────┐
│ Content Quality Dashboard                                 │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│ Total    │ Active   │ Stale    │ Avg      │ Disclosure   │
│ Articles │          │          │ Coverage │ Compliance   │
│ 156      │ 142      │ 14       │ 82%      │ 95%          │
├──────────┴──────────┴──────────┴──────────┴──────────────┤
│ Citation Coverage by Skill                [bar chart]     │
├──────────────────────────────────────────────────────────┤
│ Cost per Piece by Skill                   [bar chart]     │
├──────────────────────────────────────────────────────────┤
│ Stale Content                             [table]         │
│ Skill | Title | Last Verified | Days Overdue | [Refresh]  │
├──────────────────────────────────────────────────────────┤
│ Recent Activity                           [timeline]      │
└──────────────────────────────────────────────────────────┘
```

## Acceptance criteria

1. Dashboard page accessible at `/admin/content-quality` (admin only)
2. Overview stats calculated correctly from content_artifacts
3. Per-skill breakdown shows all skills with artifacts
4. Stale content list shows actionable items with refresh button
5. Cost breakdown pulls from providerUsageLog
6. Page loads within 2 seconds
7. Protected by admin auth middleware

## Test file

`apps/web/server/routers/contentQuality.test.ts`

Test cases:
- getOverview with mock data → correct aggregations
- getBySkill → grouped by skill_slug
- getStaleList → only status='stale' items
- Empty database → zeroed metrics (not errors)
- Auth: non-admin user → 403
