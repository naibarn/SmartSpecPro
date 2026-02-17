# Exact Code Changes for funnelAnalytics.ts

## File: /home/dev/projects/SmartSpecPro/apps/web/server/routers/funnelAnalytics.ts

### 1. Add import (line 12, after existing imports):

```typescript
import { createPrometheusMiddleware } from "../middleware/prometheusMetrics";
```

### 2. Create middleware instance (line 13, after imports, before constants):

```typescript
// ── Prometheus Metrics Middleware ──
const metricsMiddleware = createPrometheusMiddleware();
```

### 3. Apply middleware to summary endpoint (line 337):

**BEFORE:**
```typescript
  summary: domainAdminProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
```

**AFTER:**
```typescript
  summary: domainAdminProcedure
    .use(metricsMiddleware)
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
```

### 4. Apply middleware to timeSeries endpoint (line 387):

**BEFORE:**
```typescript
  timeSeries: domainAdminProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
```

**AFTER:**
```typescript
  timeSeries: domainAdminProcedure
    .use(metricsMiddleware)
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
```

### 5. Apply middleware to rawEvents endpoint (line 434):

**BEFORE:**
```typescript
  rawEvents: rateLimitedDomainAdminProcedure
    .input(rawEventsInput)
    .query(async ({ ctx, input }) => {
```

**AFTER:**
```typescript
  rawEvents: rateLimitedDomainAdminProcedure
    .use(metricsMiddleware)
    .input(rawEventsInput)
    .query(async ({ ctx, input }) => {
```

### 6. Apply middleware to export endpoint (line 504):

**BEFORE:**
```typescript
  export: rateLimitedDomainAdminProcedure
    .input(exportInput)
    .query(async ({ ctx, input }) => {
```

**AFTER:**
```typescript
  export: rateLimitedDomainAdminProcedure
    .use(metricsMiddleware)
    .input(exportInput)
    .query(async ({ ctx, input }) => {
```

### 7. Apply middleware to invalidateCache endpoint (line 583):

**BEFORE:**
```typescript
  invalidateCache: domainAdminProcedure.mutation(async ({ ctx }) => {
```

**AFTER:**
```typescript
  invalidateCache: domainAdminProcedure
    .use(metricsMiddleware)
    .mutation(async ({ ctx }) => {
```

---

## Complete Diff View

```diff
 import { and, count, eq, gte, lte, sql, desc, inArray } from "drizzle-orm";
 import { TRPCError } from "@trpc/server";
 import { z } from "zod";
 import {
   router,
   domainAdminProcedure,
   rateLimitedDomainAdminProcedure,
 } from "../_core/trpc";
 import { funnelEvents } from "../../drizzle/schema";
 import { getDb } from "../db";
 import { auditLogger } from "../services/auditLogger";
 import { isFunnelEnabled } from "../services/funnelRollout";
+import { createPrometheusMiddleware } from "../middleware/prometheusMetrics";
+
+// ── Prometheus Metrics Middleware ──
+const metricsMiddleware = createPrometheusMiddleware();

 // ── Constants ──

 export const MAX_RANGE_DAYS = 90;

 // ... (rest of the file until router definition)

 export const funnelAnalyticsRouter = router({
   summary: domainAdminProcedure
+    .use(metricsMiddleware)
     .input(dateRangeInput)
     .query(async ({ ctx, input }) => {
       // ...
     }),

   timeSeries: domainAdminProcedure
+    .use(metricsMiddleware)
     .input(dateRangeInput)
     .query(async ({ ctx, input }) => {
       // ...
     }),

   rawEvents: rateLimitedDomainAdminProcedure
+    .use(metricsMiddleware)
     .input(rawEventsInput)
     .query(async ({ ctx, input }) => {
       // ...
     }),

   export: rateLimitedDomainAdminProcedure
+    .use(metricsMiddleware)
     .input(exportInput)
     .query(async ({ ctx, input }) => {
       // ...
     }),

   invalidateCache: domainAdminProcedure
+    .use(metricsMiddleware)
     .mutation(async ({ ctx }) => {
       // ...
     }),
 });
```

---

## Verification

After applying these changes:

1. TypeScript should compile without errors: `pnpm check`
2. Server should start: `pnpm dev`
3. Metrics endpoint should show funnel_analytics metrics: `curl localhost:3000/metrics | grep funnel_analytics`

All 5 endpoints will now emit:
- Request duration histogram
- Request counter (with status_code, cached labels)
- Error counter (if errors occur)
- Cache hit/miss counters (for endpoints that use caching: summary, timeSeries)
