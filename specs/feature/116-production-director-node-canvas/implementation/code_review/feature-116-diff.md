diff --git a/apps/web/client/src/pages/MediaStudio.tsx b/apps/web/client/src/pages/MediaStudio.tsx
index 27d62308..95891696 100644
--- a/apps/web/client/src/pages/MediaStudio.tsx
+++ b/apps/web/client/src/pages/MediaStudio.tsx
@@ -63,6 +63,8 @@ import {
   DashboardSurface,
 } from "@/components/dashboard";
 import { StoryboardBatchReviewDialog, type StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";
+import { ProductionWorkspace } from "@/features/media-production/components/ProductionWorkspace";
+import { VideoShotWorkspace } from "@/features/media-production/components/VideoShotWorkspace";
 import {
   Sparkles,
   Image,
@@ -111,6 +113,7 @@ import {
   Library,
   Lock,
   Save,
+  Film,
 } from "lucide-react";
 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
@@ -258,7 +261,7 @@ type MarketplaceStudioPlatformFilter = "all" | "shopee" | "tiktok_shop";
 type MarketplaceStudioMode = "images" | "products";
 type LibraryMediaItemTypeFilter = Exclude<LibraryItemTypeFilter, "all">;
 type StudioSidebarTab = "history" | "library" | "marketplace";
-type StudioWorkspaceTab = "production" | MediaType;
+type StudioWorkspaceTab = "production" | "video_shot" | MediaType;
 type HistoryGalleryTab = "image" | "video" | "audio";
 type VideoAudioWorkflow = "native" | "separate_voice" | "separate_music" | "separate_voice_music";
 type StoryboardAudioPrepMode = "off" | "generate_voice" | "existing_voice";
@@ -11210,6 +11213,59 @@ export default function MediaStudio() {
     },
   );
   const productionPlanScenes = getProductionPlanScenes(productionDirector.plan);
+  const productionWorkspaceSpace = useMemo(() => {
+    const shots = productionPlanScenes.slice(0, 8).map((scene: any, index: number) => ({
+      id: String(scene?.id ?? scene?.shot_id ?? `shot-${index + 1}`),
+      title: String(scene?.title ?? scene?.scene_title ?? scene?.shot_title ?? `Shot ${index + 1}`),
+      order: index + 1,
+      durationSeconds: Number.isFinite(Number(scene?.durationSeconds ?? scene?.duration_seconds))
+        ? Number(scene?.durationSeconds ?? scene?.duration_seconds)
+        : undefined,
+      nodeIds: [`shot-${index + 1}-group`, `shot-${index + 1}-output`],
+      status: "draft" as const,
+    }));
+    const hasProductionProject = Boolean(productionDirector.productionRunId || productionDirector.title || productionDirector.goalSummary || productionDirector.plan);
+    const safeShots = shots.length > 0
+      ? shots
+      : hasProductionProject
+        ? [{ id: "shot-1", title: productionDirector.title || "Draft shot", order: 1, nodeIds: ["shot-1-group", "shot-1-output"], status: "draft" as const }]
+        : [];
+    return {
+      schemaVersion: "1.0.0" as const,
+      productionRunId: productionDirector.productionRunId || "draft",
+      version: Number(productionDirector.planVersion ?? 1) || 1,
+      status: "plan_ready_for_review" as const,
+      brief: {
+        summary: productionDirector.goalSummary || productionDirector.title || "Draft production",
+        title: productionDirector.title,
+        audience: productionDirector.audience,
+        platform: productionDirector.platform,
+      },
+      contextAssets: [],
+      shots: safeShots,
+      flowNodes: [
+        { id: "brief", kind: "planning" as const, title: "Goal Brief", status: "ready" as const, position: { x: 0, y: 80 } },
+        ...safeShots.flatMap((shot: any, index: number) => [
+          { id: shot.nodeIds[0], kind: "video_shot" as const, title: shot.title, status: "ready" as const, shotId: shot.id, position: { x: 260, y: 40 + index * 120 } },
+          { id: shot.nodeIds[1], kind: "video" as const, title: `${shot.title} output`, status: "warning" as const, shotId: shot.id, position: { x: 560, y: 40 + index * 120 }, estimatedCredits: 40 },
+        ]),
+      ],
+      flowEdges: safeShots.flatMap((shot: any) => [
+        { id: `brief-${shot.nodeIds[0]}`, source: "brief", target: shot.nodeIds[0], kind: "dependency" as const },
+        { id: `${shot.nodeIds[0]}-${shot.nodeIds[1]}`, source: shot.nodeIds[0], target: shot.nodeIds[1], kind: "dependency" as const },
+      ]),
+      warnings: productionDirector.approved ? [] : ["approval_required_before_generation"],
+    };
+  }, [
+    productionDirector.approved,
+    productionDirector.audience,
+    productionDirector.goalSummary,
+    productionDirector.planVersion,
+    productionDirector.platform,
+    productionDirector.productionRunId,
+    productionDirector.title,
+    productionPlanScenes,
+  ]);
   const productionPlanSummary = getProductionPlanSummary(productionDirector.plan);
   const productionVerificationVerdict = String(
     productionDirector.verification?.verdict
@@ -12149,7 +12205,7 @@ export default function MediaStudio() {
           <div className="lg:col-span-2 space-y-4">
             {/* Media Type Tabs */}
             <Tabs value={studioWorkspaceTab} onValueChange={handleWorkspaceTabChange}>
-              <TabsList className="grid h-auto w-full grid-cols-4 bg-muted/50 p-1">
+              <TabsList className="grid h-auto w-full grid-cols-5 bg-muted/50 p-1">
                 <TabsTrigger
                   value="production"
                   className="min-w-0 gap-1 px-2 py-2 text-xs transition-all data-[state=active]:bg-sky-600 data-[state=active]:text-white data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:text-sm"
@@ -12157,6 +12213,13 @@ export default function MediaStudio() {
                   <Bot className="h-4 w-4 shrink-0" />
                   <span className="truncate">Production</span>
                 </TabsTrigger>
+                <TabsTrigger
+                  value="video_shot"
+                  className="min-w-0 gap-1 px-2 py-2 text-xs transition-all data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:text-sm"
+                >
+                  <Film className="h-4 w-4 shrink-0" />
+                  <span className="truncate">Video Shot</span>
+                </TabsTrigger>
                 <TabsTrigger
                   value="image"
                   className="min-w-0 gap-1 px-2 py-2 text-xs transition-all data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:text-sm"
@@ -12181,7 +12244,7 @@ export default function MediaStudio() {
               </TabsList>
             </Tabs>
 
-            {activeTab === "audio" && (
+            {studioWorkspaceTab !== "production" && studioWorkspaceTab !== "video_shot" && activeTab === "audio" && (
               <Tabs value={audioWorkflow} onValueChange={(value) => setAudioWorkflow(value as AudioWorkflow)}>
                 <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-white/80 p-1 shadow-sm md:grid-cols-5">
                   <TabsTrigger
@@ -12224,6 +12287,32 @@ export default function MediaStudio() {
             )}
 
             {studioWorkspaceTab === "production" && (
+              <ProductionWorkspace
+                title={productionDirector.title}
+                status={productionDirector.status}
+                summary={productionDirector.goalSummary}
+                productionRunId={productionDirector.productionRunId}
+                onTitleChange={(title) => updateProductionDirector({ title })}
+                onSummaryChange={(goalSummary) => updateProductionDirector({ goalSummary })}
+                onSave={saveProductionProjectDraft}
+                onCreateFixturePlan={runProductionPlanAndVerify}
+                onOpenVideoShot={() => setStudioWorkspaceTab("video_shot")}
+                isSaving={saveProductionGoalMutation.isPending}
+                locale={isThaiLocale ? "th" : "en"}
+                space={productionWorkspaceSpace}
+              />
+            )}
+
+            {studioWorkspaceTab === "video_shot" && (
+              <VideoShotWorkspace
+                space={productionWorkspaceSpace.shots.length > 0 ? productionWorkspaceSpace : null}
+                selectedShotId={productionWorkspaceSpace.shots[0]?.id ?? null}
+                onBackToProduction={() => setStudioWorkspaceTab("production")}
+                locale={isThaiLocale ? "th" : "en"}
+              />
+            )}
+
+            {false && studioWorkspaceTab === "production" && (
               <DashboardCard className="border-sky-200 bg-sky-50/60" bodyClassName="space-y-3 p-4">
                 <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                   <div>
@@ -12350,6 +12439,7 @@ export default function MediaStudio() {
             )}
 
             {/* Prompt Input */}
+            {studioWorkspaceTab !== "production" && studioWorkspaceTab !== "video_shot" && (
             <DashboardCard className="space-y-4" bodyClassName="p-4">
               <DashboardSectionHeader
                 eyebrow={isTextToSpeechMode ? t('mediaStudio.ttsText.eyebrow') : t('mediaStudio.prompt.eyebrow')}
@@ -14050,8 +14140,10 @@ export default function MediaStudio() {
                 </p>
               )}
             </DashboardCard>
+            )}
 
             {/* Settings */}
+            {studioWorkspaceTab !== "production" && studioWorkspaceTab !== "video_shot" && (
             <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-4 w-4" />
@@ -15642,6 +15734,7 @@ export default function MediaStudio() {
                 </div>
               )}
             </div>
+            )}
 
             {/* Generated Media History */}
             {visibleGeneratedMedia.length > 0 && (
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 506cc4e1..30845765 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -5801,6 +5801,31 @@ export const mediaProductionRuns = pgTable("media_production_runs", {
 export type MediaProductionRun = typeof mediaProductionRuns.$inferSelect;
 export type InsertMediaProductionRun = typeof mediaProductionRuns.$inferInsert;
 
+export const mediaProductionSpaces = pgTable("media_production_spaces", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull(),
+  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
+  productionRunId: varchar("productionRunId", { length: 128 }).notNull(),
+  version: integer("version").notNull(),
+  space: jsonb("space").$type<Record<string, any>>().default({}).notNull(),
+  changeKind: varchar("changeKind", { length: 40 }).default("space").notNull(),
+  changedFields: jsonb("changedFields").$type<string[]>().default([]).notNull(),
+  spaceHash: varchar("spaceHash", { length: 128 }).notNull(),
+  status: varchar("status", { length: 40 }).default("goal_draft").notNull(),
+  archivedAt: timestamp("archivedAt", { withTimezone: true }),
+  deletedAt: timestamp("deletedAt", { withTimezone: true }),
+  contractVersion: varchar("contractVersion", { length: 32 }).default("1.0.0").notNull(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("media_production_spaces_unique").on(t.tenantId, t.productionRunId, t.version),
+  index("media_production_spaces_run_idx").on(t.tenantId, t.productionRunId, t.createdAt),
+  index("media_production_spaces_user_status_idx").on(t.userId, t.status, t.updatedAt),
+]);
+
+export type MediaProductionSpace = typeof mediaProductionSpaces.$inferSelect;
+export type InsertMediaProductionSpace = typeof mediaProductionSpaces.$inferInsert;
+
 export const mediaProductionGoalVersions = pgTable("media_production_goal_versions", {
   id: bigserial("id", { mode: "number" }).primaryKey(),
   tenantId: varchar("tenantId", { length: 36 }).notNull(),
diff --git a/apps/web/server/routers/mediaProduction.ts b/apps/web/server/routers/mediaProduction.ts
index 59c72909..71305841 100644
--- a/apps/web/server/routers/mediaProduction.ts
+++ b/apps/web/server/routers/mediaProduction.ts
@@ -16,16 +16,33 @@ import { resolveTenantIdVarchar } from "../services/tenantContext";
 import {
   buildProductionOutputProjectionIdentity,
   buildProductionStableHash,
+  computeProductionSpaceReadiness,
+  deriveProductionHandoffPayload,
   evaluateProductionAssetPlanReadiness,
+  validateProductionSpace,
   validateProductionRunTransition,
+  type ProductionNodeConfigSnapshot,
+  type ProductionShot,
+  type ProductionSpace,
   type ProductionAssetPlan,
   type ProductionRunStatus,
 } from "../../shared/mediaProduction";
+import {
+  getProductionSpace,
+  redactProductionSpaceExport,
+  saveProductionBrief,
+  saveProductionNodeConfig,
+  saveProductionShot,
+  saveProductionSpace,
+} from "../services/productionSpaceService";
 import { and, desc, eq } from "drizzle-orm";
 import { TRPCError } from "@trpc/server";
 
 const productionGoalSchema = z.record(z.any());
 const productionPayloadSchema = z.record(z.any());
+const productionSpaceSchema = productionPayloadSchema.transform((value) => value as unknown as ProductionSpace);
+const productionShotSchema = productionPayloadSchema.transform((value) => value as unknown as ProductionShot);
+const productionNodeConfigSchema = productionPayloadSchema.transform((value) => value as unknown as ProductionNodeConfigSnapshot);
 const productionSurfaceSchema = z.enum(["storyboard_review", "video_edit"]);
 const stringArraySchema = z.array(z.string().min(1).max(256)).default([]);
 
@@ -47,6 +64,25 @@ async function getExistingRun(
   return run;
 }
 
+async function assertRunWritableByUser(
+  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
+  tenantId: string,
+  userId: number,
+  productionRunId: string,
+) {
+  const [run] = await db
+    .select({ userId: mediaProductionRuns.userId })
+    .from(mediaProductionRuns)
+    .where(and(
+      eq(mediaProductionRuns.tenantId, tenantId),
+      eq(mediaProductionRuns.productionRunId, productionRunId),
+    ))
+    .limit(1);
+  if (run && Number(run.userId) !== userId) {
+    throw new TRPCError({ code: "FORBIDDEN", message: "Production run is owned by another user" });
+  }
+}
+
 async function getNextVersion(
   db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
   table: typeof mediaProductionGoalVersions | typeof mediaProductionPlanVersions,
@@ -95,6 +131,195 @@ function extractProductionClips(payload: Record<string, unknown>): Array<Record<
 }
 
 export const mediaProductionRouter = router({
+  getSpace: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+    }))
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      const result = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
+      if (!result) return null;
+      return {
+        ...result,
+        validation: validateProductionSpace(result.space),
+        readiness: computeProductionSpaceReadiness(result.space),
+      };
+    }),
+
+  saveSpace: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      expectedVersion: z.number().int().nonnegative(),
+      space: productionSpaceSchema,
+      changedFields: stringArraySchema,
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      return saveProductionSpace({
+        db,
+        tenantId,
+        userId: ctx.user.id,
+        productionRunId: input.productionRunId,
+        expectedVersion: input.expectedVersion,
+        space: input.space,
+        changedFields: input.changedFields,
+      });
+    }),
+
+  saveBrief: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      expectedVersion: z.number().int().nonnegative(),
+      brief: productionGoalSchema,
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      return saveProductionBrief({
+        db,
+        tenantId,
+        userId: ctx.user.id,
+        productionRunId: input.productionRunId,
+        expectedVersion: input.expectedVersion,
+        brief: input.brief as any,
+      });
+    }),
+
+  saveShot: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      expectedVersion: z.number().int().nonnegative(),
+      shot: productionShotSchema,
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      return saveProductionShot({
+        db,
+        tenantId,
+        userId: ctx.user.id,
+        productionRunId: input.productionRunId,
+        expectedVersion: input.expectedVersion,
+        shot: input.shot,
+      });
+    }),
+
+  saveNodeConfig: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      expectedVersion: z.number().int().nonnegative(),
+      nodeId: z.string().min(1).max(128),
+      configSnapshot: productionNodeConfigSchema,
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      return saveProductionNodeConfig({
+        db,
+        tenantId,
+        userId: ctx.user.id,
+        productionRunId: input.productionRunId,
+        expectedVersion: input.expectedVersion,
+        nodeId: input.nodeId,
+        configSnapshot: input.configSnapshot,
+      });
+    }),
+
+  saveCanvasLayout: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      expectedVersion: z.number().int().nonnegative(),
+      layout: z.record(z.object({ x: z.number(), y: z.number() })),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
+      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
+      return saveProductionSpace({
+        db,
+        tenantId,
+        userId: ctx.user.id,
+        productionRunId: input.productionRunId,
+        expectedVersion: input.expectedVersion,
+        space: {
+          ...current.space,
+          flowNodes: current.space.flowNodes.map((node) => ({
+            ...node,
+            position: input.layout[node.id] ?? node.position,
+          })),
+        },
+        changeKind: "layout",
+        changedFields: ["flowNodes.position"],
+      });
+    }),
+
+  validateSpace: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      space: productionSpaceSchema.optional(),
+    }))
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      const space = input.space ?? (await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId }))?.space;
+      if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
+      return {
+        validation: validateProductionSpace(space),
+        readiness: computeProductionSpaceReadiness(space),
+      };
+    }),
+
+  previewHandoff: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+      target: productionSurfaceSchema,
+    }))
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
+      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
+      return deriveProductionHandoffPayload(current.space, input.target);
+    }),
+
+  exportSpace: protectedProcedure
+    .input(z.object({
+      productionRunId: z.string().min(1).max(128),
+    }))
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
+      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
+      return {
+        exportedAt: new Date().toISOString(),
+        productionRunId: input.productionRunId,
+        version: current.version,
+        space: redactProductionSpaceExport(current.space),
+      };
+    }),
+
   listRuns: protectedProcedure
     .input(z.object({
       query: z.string().max(120).optional(),
@@ -231,6 +456,7 @@ export const mediaProductionRouter = router({
       const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
       if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
       const now = new Date();
+      await assertRunWritableByUser(db, tenantId, ctx.user.id, input.productionRunId);
       const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
       if (existing) {
         const transition = validateProductionRunTransition(
@@ -293,6 +519,7 @@ export const mediaProductionRouter = router({
       const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
       if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
       const now = new Date();
+      await assertRunWritableByUser(db, tenantId, ctx.user.id, input.productionRunId);
       const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
       let nextRunStatus = input.status as ProductionRunStatus;
       if (existing) {
diff --git a/apps/web/shared/geminiOmni.test.ts b/apps/web/shared/geminiOmni.test.ts
index 555e3f7f..20b5666f 100644
--- a/apps/web/shared/geminiOmni.test.ts
+++ b/apps/web/shared/geminiOmni.test.ts
@@ -5,6 +5,7 @@ import {
   getGeminiOmniVoicePreset,
   isGeminiOmniVoicePresetId,
   normalizeGeminiOmniVideoList,
+  validateGeminiOmniProductionNodeCapability,
   validateGeminiOmniVideoInput,
 } from "./geminiOmni";
 
@@ -142,4 +143,28 @@ describe("geminiOmni shared contract", () => {
     });
     expect(GEMINI_OMNI_VOICE_PRESETS.every((preset) => preset.description.length >= 80)).toBe(true);
   });
+
+  it("validates production node references through the same Gemini Omni provider limits", () => {
+    const result = validateGeminiOmniProductionNodeCapability({
+      prompt: "Cinematic marketplace demo",
+      duration: "8s",
+      resolution: "1080p",
+      references: [
+        { kind: "product_image", url: "https://cdn.example.com/product.png", providerPayloadKey: "image_urls" },
+        { kind: "reference_image", url: "https://cdn.example.com/scene.png", providerPayloadKey: "image_urls" },
+        { kind: "source_video", url: "https://cdn.example.com/source.mp4", providerPayloadKey: "video_list" },
+        { kind: "character_asset", assetId: "char_1", providerPayloadKey: "character_ids" },
+        { kind: "audio_asset", assetId: "audio_1", providerPayloadKey: "audio_ids" },
+      ],
+    });
+
+    expect(result.ok).toBe(true);
+    expect(result.normalized).toMatchObject({
+      imageUrls: ["https://cdn.example.com/product.png", "https://cdn.example.com/scene.png"],
+      characterIds: ["char_1"],
+      audioIds: ["audio_1"],
+      hasSourceVideo: true,
+      referenceUnitCount: 5,
+    });
+  });
 });
diff --git a/apps/web/shared/geminiOmni.ts b/apps/web/shared/geminiOmni.ts
index c11870f5..db87a466 100644
--- a/apps/web/shared/geminiOmni.ts
+++ b/apps/web/shared/geminiOmni.ts
@@ -133,6 +133,22 @@ export interface GeminiOmniValidationResult {
   issues: GeminiOmniValidationIssue[];
 }
 
+export interface GeminiOmniProductionNodeReference {
+  kind: "source_video" | "reference_image" | "product_image" | "character_asset" | "audio_asset";
+  url?: string;
+  assetId?: string;
+  outputRefId?: string;
+  providerPayloadKey?: "video_list" | "image_urls" | "character_ids" | "audio_ids" | string;
+  referenceUnitWeight?: number;
+}
+
+export interface GeminiOmniProductionNodeCapabilityInput {
+  prompt?: string | null;
+  references: GeminiOmniProductionNodeReference[];
+  duration?: unknown;
+  resolution?: unknown;
+}
+
 const SUPPORTED_DURATIONS = new Set(["4", "6", "8", "10"]);
 const SUPPORTED_RESOLUTIONS = new Set(["720p", "1080p", "4K"]);
 const SAFE_RELATIVE_MEDIA_PREFIXES = ["/uploads/", "/api/storage/files/"] as const;
@@ -342,3 +358,32 @@ export function buildGeminiOmniProviderExtraParams(input: GeminiOmniVideoValidat
     gemini_omni_contract_version: GEMINI_OMNI_CONTRACT_VERSION,
   };
 }
+
+export function validateGeminiOmniProductionNodeCapability(input: GeminiOmniProductionNodeCapabilityInput): GeminiOmniValidationResult {
+  const imageUrls: string[] = [];
+  const videoList: GeminiOmniReferenceVideoInput[] = [];
+  const characterIds: string[] = [];
+  const audioIds: string[] = [];
+
+  for (const reference of input.references) {
+    if (reference.kind === "source_video") {
+      videoList.push({ url: reference.url, videoUrl: reference.url });
+    } else if (reference.kind === "reference_image" || reference.kind === "product_image") {
+      if (reference.url) imageUrls.push(reference.url);
+    } else if (reference.kind === "character_asset") {
+      if (reference.assetId) characterIds.push(reference.assetId);
+    } else if (reference.kind === "audio_asset") {
+      if (reference.assetId) audioIds.push(reference.assetId);
+    }
+  }
+
+  return validateGeminiOmniVideoInput({
+    prompt: input.prompt,
+    imageUrls,
+    videoList,
+    characterIds,
+    audioIds,
+    duration: input.duration,
+    resolution: input.resolution,
+  });
+}
diff --git a/apps/web/shared/mediaProduction.test.ts b/apps/web/shared/mediaProduction.test.ts
index 042e0f79..b0c03951 100644
--- a/apps/web/shared/mediaProduction.test.ts
+++ b/apps/web/shared/mediaProduction.test.ts
@@ -1,9 +1,14 @@
 import { describe, expect, it } from "vitest";
 import {
   buildProductionOutputProjectionIdentity,
+  computeProductionSpaceReadiness,
   canSubmitProductionFinalRender,
+  deriveProductionHandoffPayload,
+  doesProductionNodeConfigChangeInvalidateApproval,
   evaluateProductionAssetPlanReadiness,
+  validateProductionSpace,
   validateProductionRunTransition,
+  type ProductionSpace,
   type ProductionQualityGate,
 } from "./mediaProduction";
 
@@ -95,4 +100,132 @@ describe("mediaProduction shared orchestration contracts", () => {
       reasonCode: "production_state_terminal",
     });
   });
+
+  const baseSpace: ProductionSpace = {
+    schemaVersion: "1.0.0",
+    productionRunId: "run-116",
+    version: 3,
+    status: "plan_ready_for_review",
+    brief: { summary: "Launch a product proof video", platform: "TikTok", audience: "buyers" },
+    contextAssets: [],
+    shots: [
+      { id: "shot-1", title: "Hook", order: 1, durationSeconds: 4, nodeIds: ["script-1", "image-1"] },
+      { id: "shot-2", title: "Proof", order: 2, durationSeconds: 6, nodeIds: ["video-1"] },
+    ],
+    flowNodes: [
+      { id: "script-1", kind: "script", title: "Hook script", status: "ready", estimatedCredits: 0 },
+      {
+        id: "image-1",
+        kind: "image",
+        title: "Hero product image",
+        status: "ready",
+        estimatedCredits: 12,
+        outputRefs: [{ outputRefId: "out-image-1", nodeId: "image-1", kind: "image", url: "https://cdn.example.com/image.png" }],
+      },
+      {
+        id: "video-1",
+        kind: "video",
+        title: "Proof clip",
+        status: "warning",
+        estimatedCredits: 80,
+        outputRefs: [{ outputRefId: "out-video-1", nodeId: "video-1", kind: "video", url: "https://cdn.example.com/video.mp4" }],
+      },
+    ],
+    flowEdges: [
+      { id: "edge-1", source: "script-1", target: "image-1", kind: "dependency" },
+      { id: "edge-2", source: "image-1", target: "video-1", kind: "reference" },
+    ],
+    cues: [
+      { id: "cue-2", shotId: "shot-2", startSeconds: 4, endSeconds: 10, kind: "shot", label: "Proof" },
+      { id: "cue-1", shotId: "shot-1", startSeconds: 0, endSeconds: 4, kind: "shot", label: "Hook" },
+    ],
+  };
+
+  it("validates a minimal ProductionSpace graph and catches duplicate ids, cycles, and missing edges", () => {
+    expect(validateProductionSpace(baseSpace)).toMatchObject({ ok: true, issues: [] });
+
+    const invalid: ProductionSpace = {
+      ...baseSpace,
+      flowNodes: [...baseSpace.flowNodes, { ...baseSpace.flowNodes[0] }],
+      flowEdges: [
+        ...baseSpace.flowEdges,
+        { id: "edge-2", source: "video-1", target: "script-1" },
+        { id: "edge-missing", source: "missing", target: "script-1" },
+      ],
+    };
+
+    expect(validateProductionSpace(invalid).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
+      "duplicate_node_id",
+      "duplicate_edge_id",
+      "edge_missing_source",
+      "cycle_detected",
+    ]));
+  });
+
+  it("computes canvas readiness without spending provider generation credits", () => {
+    expect(computeProductionSpaceReadiness(baseSpace)).toMatchObject({
+      status: "warning",
+      readyNodeIds: ["script-1", "image-1"],
+      warningNodeIds: ["video-1"],
+      estimatedCredits: 92,
+    });
+  });
+
+  it("invalidates approval only for material node config changes", () => {
+    const before = {
+      snapshotId: "snap-1",
+      version: 1,
+      toolSurface: "image" as const,
+      adapter: "image" as const,
+      config: { prompt: "old" },
+      configHash: "hash-a",
+    };
+
+    expect(doesProductionNodeConfigChangeInvalidateApproval(before, { ...before, version: 2 })).toBe(false);
+    expect(doesProductionNodeConfigChangeInvalidateApproval(before, { ...before, configHash: "hash-b" })).toBe(true);
+  });
+
+  it("derives ordered handoff payloads with output refs and cue sheet", () => {
+    const payload = deriveProductionHandoffPayload(baseSpace, "video_edit");
+
+    expect(payload).toMatchObject({
+      schemaVersion: "1.0.0",
+      target: "video_edit",
+      productionRunId: "run-116",
+      sourceSpaceVersion: 3,
+    });
+    expect(payload.orderedShots.map((shot) => shot.shotId)).toEqual(["shot-1", "shot-2"]);
+    expect(payload.orderedShots.flatMap((shot) => shot.nodeOutputRefs.map((ref) => ref.outputRefId))).toEqual([
+      "out-image-1",
+      "out-video-1",
+    ]);
+    expect(payload.cues.map((cue) => cue.id)).toEqual(["cue-1", "cue-2"]);
+  });
+
+  it("blocks product handoff when claim evidence is missing or self-referential", () => {
+    const result = validateProductionSpace({
+      ...baseSpace,
+      productEvidenceManifest: {
+        manifestId: "manifest-1",
+        status: "blocked",
+        requiredClaimIds: ["claim-1"],
+        warnings: [],
+        products: [
+          {
+            id: "product-asset-1",
+            productId: "product-1",
+            title: "Serum",
+            approvalState: "approved",
+            claimEvidence: [{ claimId: "claim-1", evidenceIds: ["claim-1"], status: "blocked" }],
+          },
+        ],
+      },
+    });
+
+    expect(result.ok).toBe(false);
+    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
+      "product_evidence_mismatch",
+      "blocked_product_evidence",
+    ]));
+  });
 });
diff --git a/apps/web/shared/mediaProduction.ts b/apps/web/shared/mediaProduction.ts
index 464f9cd2..d38b72f3 100644
--- a/apps/web/shared/mediaProduction.ts
+++ b/apps/web/shared/mediaProduction.ts
@@ -1,5 +1,22 @@
 export type ProductionGateStatus = "pass" | "warning" | "revise" | "human_review" | "block";
 export type ProductionOutputSurface = "storyboard_review" | "video_edit";
+export type ProductionNodeKind =
+  | "planning"
+  | "script"
+  | "image"
+  | "video"
+  | "tts"
+  | "music"
+  | "sound_effect"
+  | "voice"
+  | "caption"
+  | "video_shot"
+  | "qa"
+  | "storyboard_review"
+  | "video_edit"
+  | "handoff";
+export type ProductionNodeStatus = "draft" | "ready" | "warning" | "blocked" | "approved" | "running" | "completed" | "failed" | "disabled";
+export type ProductionEvidenceStatus = "approved" | "needs_review" | "blocked";
 export type ProductionRunStatus =
   | "goal_draft"
   | "goal_ready"
@@ -45,6 +62,184 @@ export interface ProductionGoal {
   contractVersion?: string;
 }
 
+export interface ProductionReferenceInput {
+  id: string;
+  kind: "reference_image" | "product_image" | "character_asset" | "audio_asset" | "source_video" | "generated_media" | "marketplace_product";
+  title: string;
+  url?: string;
+  thumbnailUrl?: string;
+  assetId?: string;
+  outputRefId?: string;
+  source: string;
+  provenance?: Record<string, unknown>;
+  providerPayloadKey?: string;
+  referenceUnitWeight?: number;
+}
+
+export interface ProductClaimEvidenceMap {
+  claimId: string;
+  evidenceIds: string[];
+  status: ProductionEvidenceStatus;
+  riskLevel?: "low" | "medium" | "high";
+}
+
+export interface ProductStoryboardAsset {
+  id: string;
+  productId: string;
+  title: string;
+  imageUrl?: string;
+  sku?: string;
+  variantId?: string;
+  approvalState?: ProductionEvidenceStatus;
+  claimEvidence: ProductClaimEvidenceMap[];
+  provenance?: Record<string, unknown>;
+}
+
+export interface ProductionProductEvidenceManifest {
+  manifestId: string;
+  products: ProductStoryboardAsset[];
+  requiredClaimIds: string[];
+  status: "ready" | "warning" | "blocked";
+  warnings: string[];
+}
+
+export interface ProductionNodeConfigSnapshot {
+  snapshotId: string;
+  version: number;
+  toolSurface: "production" | "image" | "video" | "audio" | "storyboard_review" | "video_edit";
+  adapter: "image" | "video" | "tts" | "preview_only" | "disabled";
+  config: Record<string, unknown>;
+  configHash: string;
+  manuallyEdited?: boolean;
+  createdAt?: string;
+  updatedAt?: string;
+}
+
+export interface ProductionNodeOutputRef {
+  outputRefId: string;
+  nodeId: string;
+  kind: "image" | "video" | "audio" | "caption" | "manifest" | "project";
+  url?: string;
+  thumbnailUrl?: string;
+  mediaId?: string;
+  providerTaskId?: string;
+  metadata?: Record<string, unknown>;
+}
+
+export interface ProductionFlowNode {
+  id: string;
+  kind: ProductionNodeKind;
+  title: string;
+  status: ProductionNodeStatus;
+  shotId?: string;
+  toolBindingId?: string;
+  configSnapshot?: ProductionNodeConfigSnapshot;
+  referenceInputs?: ProductionReferenceInput[];
+  outputRefs?: ProductionNodeOutputRef[];
+  readinessIssues?: string[];
+  estimatedCredits?: number;
+  position?: { x: number; y: number };
+  locked?: boolean;
+  approvedAt?: string;
+}
+
+export interface ProductionFlowEdge {
+  id: string;
+  source: string;
+  target: string;
+  label?: string;
+  kind?: "dependency" | "reference" | "handoff" | "qa";
+}
+
+export interface ProductionShot {
+  id: string;
+  title: string;
+  order: number;
+  durationSeconds?: number;
+  script?: string;
+  visualIntent?: string;
+  audioIntent?: string;
+  productAssetIds?: string[];
+  nodeIds: string[];
+  locked?: boolean;
+  status?: "draft" | "ready" | "blocked" | "approved" | "completed";
+}
+
+export interface ProductionCue {
+  id: string;
+  shotId: string;
+  startSeconds: number;
+  endSeconds: number;
+  kind: "shot" | "caption" | "audio" | "transition" | "product";
+  label: string;
+  metadata?: Record<string, unknown>;
+}
+
+export interface ProductionSpace {
+  schemaVersion: "1.0.0";
+  productionRunId: string;
+  version: number;
+  status: ProductionRunStatus;
+  brief: ProductionGoal;
+  shots: ProductionShot[];
+  flowNodes: ProductionFlowNode[];
+  flowEdges: ProductionFlowEdge[];
+  contextAssets: ProductionReferenceInput[];
+  productEvidenceManifest?: ProductionProductEvidenceManifest;
+  cues?: ProductionCue[];
+  warnings?: string[];
+  featureFlags?: Record<string, boolean>;
+  updatedAt?: string;
+}
+
+export interface ProductionSpaceValidationIssue {
+  code:
+    | "missing_space"
+    | "missing_brief"
+    | "duplicate_node_id"
+    | "duplicate_edge_id"
+    | "edge_missing_source"
+    | "edge_missing_target"
+    | "cycle_detected"
+    | "shot_missing_node"
+    | "product_evidence_mismatch"
+    | "blocked_product_evidence";
+  message: string;
+  path?: string;
+}
+
+export interface ProductionSpaceValidationResult {
+  ok: boolean;
+  issues: ProductionSpaceValidationIssue[];
+  warnings: ProductionSpaceValidationIssue[];
+}
+
+export interface ProductionSpaceReadiness {
+  status: "ready" | "warning" | "blocked";
+  readyNodeIds: string[];
+  blockedNodeIds: string[];
+  warningNodeIds: string[];
+  estimatedCredits: number;
+}
+
+export interface ProductionHandoffPayload {
+  schemaVersion: "1.0.0";
+  target: ProductionOutputSurface;
+  productionRunId: string;
+  sourceSpaceVersion: number;
+  idempotencyKey: string;
+  orderedShots: Array<{
+    shotId: string;
+    title: string;
+    order: number;
+    durationSeconds?: number;
+    nodeOutputRefs: ProductionNodeOutputRef[];
+  }>;
+  cues: ProductionCue[];
+  productEvidenceManifest?: ProductionProductEvidenceManifest;
+  warnings: string[];
+}
+
 export interface ProductionAssetNode {
   id: string;
   kind: string;
@@ -196,6 +391,168 @@ export function buildProductionStableHash(value: unknown): string {
   return stableHash(stableStringify(value));
 }
 
+export function validateProductionSpace(space: ProductionSpace | null | undefined): ProductionSpaceValidationResult {
+  const issues: ProductionSpaceValidationIssue[] = [];
+  const warnings: ProductionSpaceValidationIssue[] = [];
+  if (!space) {
+    return { ok: false, issues: [{ code: "missing_space", message: "ProductionSpace is required." }], warnings };
+  }
+  if (!String(space.brief?.summary ?? "").trim()) {
+    issues.push({ code: "missing_brief", path: "brief.summary", message: "Production brief summary is required." });
+  }
+
+  const nodeIds = new Set<string>();
+  const duplicateNodeIds = new Set<string>();
+  for (const node of space.flowNodes) {
+    if (nodeIds.has(node.id)) duplicateNodeIds.add(node.id);
+    nodeIds.add(node.id);
+  }
+  for (const id of duplicateNodeIds) {
+    issues.push({ code: "duplicate_node_id", path: `flowNodes.${id}`, message: `Duplicate production node id: ${id}` });
+  }
+
+  const edgeIds = new Set<string>();
+  for (const edge of space.flowEdges) {
+    if (edgeIds.has(edge.id)) {
+      issues.push({ code: "duplicate_edge_id", path: `flowEdges.${edge.id}`, message: `Duplicate production edge id: ${edge.id}` });
+    }
+    edgeIds.add(edge.id);
+    if (!nodeIds.has(edge.source)) {
+      issues.push({ code: "edge_missing_source", path: `flowEdges.${edge.id}.source`, message: `Edge ${edge.id} references missing source node.` });
+    }
+    if (!nodeIds.has(edge.target)) {
+      issues.push({ code: "edge_missing_target", path: `flowEdges.${edge.id}.target`, message: `Edge ${edge.id} references missing target node.` });
+    }
+  }
+
+  for (const shot of space.shots) {
+    for (const nodeId of shot.nodeIds) {
+      if (!nodeIds.has(nodeId)) {
+        issues.push({ code: "shot_missing_node", path: `shots.${shot.id}.nodeIds`, message: `Shot ${shot.id} references missing node ${nodeId}.` });
+      }
+    }
+  }
+
+  if (hasProductionGraphCycle(space.flowNodes.map((node) => node.id), space.flowEdges)) {
+    issues.push({ code: "cycle_detected", path: "flowEdges", message: "Production canvas contains a dependency cycle." });
+  }
+
+  const manifest = space.productEvidenceManifest;
+  if (manifest) {
+    const evidenceIds = new Set(manifest.products.flatMap((product) => product.claimEvidence.flatMap((claim) => claim.evidenceIds)));
+    for (const claimId of manifest.requiredClaimIds) {
+      const hasClaim = manifest.products.some((product) => product.claimEvidence.some((claim) => claim.claimId === claimId));
+      if (!hasClaim || evidenceIds.has(claimId)) {
+        issues.push({
+          code: "product_evidence_mismatch",
+          path: "productEvidenceManifest.requiredClaimIds",
+          message: `Product claim ${claimId} is missing linked evidence or was used as its own evidence id.`,
+        });
+      }
+    }
+    const blocked = manifest.products.some((product) =>
+      product.approvalState === "blocked"
+      || product.claimEvidence.some((claim) => claim.status === "blocked")
+    );
+    if (blocked || manifest.status === "blocked") {
+      issues.push({ code: "blocked_product_evidence", path: "productEvidenceManifest", message: "Blocked product evidence prevents product-related generation or handoff." });
+    } else if (manifest.status === "warning") {
+      warnings.push({ code: "blocked_product_evidence", path: "productEvidenceManifest", message: "Product evidence has warnings that require review before handoff." });
+    }
+  }
+
+  return { ok: issues.length === 0, issues, warnings };
+}
+
+export function computeProductionSpaceReadiness(space: ProductionSpace): ProductionSpaceReadiness {
+  const readyNodeIds: string[] = [];
+  const blockedNodeIds: string[] = [];
+  const warningNodeIds: string[] = [];
+  let estimatedCredits = 0;
+  for (const node of space.flowNodes) {
+    estimatedCredits += Math.max(0, Number(node.estimatedCredits ?? 0));
+    if (node.status === "blocked" || node.status === "failed" || (node.readinessIssues?.length ?? 0) > 0) {
+      blockedNodeIds.push(node.id);
+    } else if (node.status === "warning" || node.status === "disabled") {
+      warningNodeIds.push(node.id);
+    } else {
+      readyNodeIds.push(node.id);
+    }
+  }
+  return {
+    status: blockedNodeIds.length > 0 ? "blocked" : warningNodeIds.length > 0 ? "warning" : "ready",
+    readyNodeIds,
+    blockedNodeIds,
+    warningNodeIds,
+    estimatedCredits,
+  };
+}
+
+export function doesProductionNodeConfigChangeInvalidateApproval(
+  before: ProductionNodeConfigSnapshot | null | undefined,
+  after: ProductionNodeConfigSnapshot | null | undefined,
+): boolean {
+  if (!before || !after) return Boolean(before || after);
+  return before.configHash !== after.configHash || before.toolSurface !== after.toolSurface || before.adapter !== after.adapter;
+}
+
+export function deriveProductionHandoffPayload(space: ProductionSpace, target: ProductionOutputSurface): ProductionHandoffPayload {
+  const orderedShots = [...space.shots]
+    .sort((a, b) => a.order - b.order)
+    .map((shot) => {
+      const nodeOutputRefs = shot.nodeIds
+        .map((nodeId) => space.flowNodes.find((node) => node.id === nodeId))
+        .filter((node): node is ProductionFlowNode => Boolean(node))
+        .flatMap((node) => node.outputRefs ?? []);
+      return {
+        shotId: shot.id,
+        title: shot.title,
+        order: shot.order,
+        durationSeconds: shot.durationSeconds,
+        nodeOutputRefs,
+      };
+    });
+  return {
+    schemaVersion: "1.0.0",
+    target,
+    productionRunId: space.productionRunId,
+    sourceSpaceVersion: space.version,
+    idempotencyKey: buildProductionOutputProjectionIdentity({
+      tenantId: "space",
+      productionRunId: space.productionRunId,
+      surface: target,
+      sourceOutput: { version: space.version, target, orderedShots },
+    }).idempotencyKey,
+    orderedShots,
+    cues: [...(space.cues ?? [])].sort((a, b) => a.startSeconds - b.startSeconds),
+    productEvidenceManifest: space.productEvidenceManifest,
+    warnings: space.warnings ?? [],
+  };
+}
+
+function hasProductionGraphCycle(nodeIds: string[], edges: ProductionFlowEdge[]): boolean {
+  const visiting = new Set<string>();
+  const visited = new Set<string>();
+  const outgoing = new Map<string, string[]>();
+  for (const id of nodeIds) outgoing.set(id, []);
+  for (const edge of edges) {
+    if (!outgoing.has(edge.source)) continue;
+    outgoing.get(edge.source)?.push(edge.target);
+  }
+  const visit = (nodeId: string): boolean => {
+    if (visiting.has(nodeId)) return true;
+    if (visited.has(nodeId)) return false;
+    visiting.add(nodeId);
+    for (const target of outgoing.get(nodeId) ?? []) {
+      if (visit(target)) return true;
+    }
+    visiting.delete(nodeId);
+    visited.add(nodeId);
+    return false;
+  };
+  return nodeIds.some((id) => visit(id));
+}
+
 function stableHash(value: string): string {
   let hashA = 0x811c9dc5;
   let hashB = 0x9e3779b9;
diff --git a/apps/web/skills/gemini-omni-video-director/schemas/output.schema.json b/apps/web/skills/gemini-omni-video-director/schemas/output.schema.json
index aaa101ec..ed81da90 100644
--- a/apps/web/skills/gemini-omni-video-director/schemas/output.schema.json
+++ b/apps/web/skills/gemini-omni-video-director/schemas/output.schema.json
@@ -36,8 +36,153 @@
     "scene_timeline": { "type": "array", "items": { "type": "object" } },
     "continuity_graph": { "type": "object", "additionalProperties": true },
     "prompt_sequence": { "type": "array", "items": { "type": "object", "required": ["clip_id", "final_prompt"], "properties": { "clip_id": { "type": "string" }, "final_prompt": { "type": "string" } }, "additionalProperties": true } },
-    "reference_plan": { "type": "object", "additionalProperties": true },
-    "provider_plan": { "type": "object", "additionalProperties": true },
+    "reference_plan": {
+      "type": "object",
+      "properties": {
+        "source_video": {
+          "type": "object",
+          "properties": {
+            "label": { "type": "string" },
+            "asset_id": { "type": "string" },
+            "output_ref_id": { "type": "string" },
+            "trim": {
+              "type": "object",
+              "properties": {
+                "start_seconds": { "type": "number", "minimum": 0 },
+                "end_seconds": { "type": "number", "minimum": 0 }
+              },
+              "additionalProperties": false
+            },
+            "pricing_branch": { "type": "string", "enum": ["with-video", "without-video"] },
+            "reference_unit_weight": { "type": "number", "minimum": 0 }
+          },
+          "additionalProperties": false
+        },
+        "reference_images": {
+          "type": "array",
+          "items": {
+            "type": "object",
+            "required": ["label"],
+            "properties": {
+              "label": { "type": "string" },
+              "asset_id": { "type": "string" },
+              "output_ref_id": { "type": "string" },
+              "url": { "type": "string" },
+              "reference_unit_weight": { "type": "number", "minimum": 0 }
+            },
+            "additionalProperties": false
+          },
+          "default": []
+        },
+        "character_assets": {
+          "type": "array",
+          "items": {
+            "type": "object",
+            "required": ["label"],
+            "properties": {
+              "label": { "type": "string" },
+              "asset_id": { "type": "string" },
+              "reference_unit_weight": { "type": "number", "minimum": 0 }
+            },
+            "additionalProperties": false
+          },
+          "default": []
+        },
+        "audio_assets": {
+          "type": "array",
+          "items": {
+            "type": "object",
+            "required": ["label"],
+            "properties": {
+              "label": { "type": "string" },
+              "asset_id": { "type": "string" },
+              "reference_unit_weight": { "type": "number", "minimum": 0 },
+              "limit_warning": { "type": "string" }
+            },
+            "additionalProperties": false
+          },
+          "default": []
+        },
+        "debug": {
+          "type": "object",
+          "description": "Raw provider payload keys are allowed only here for schema or debug review.",
+          "additionalProperties": true
+        },
+        "schema": {
+          "type": "object",
+          "description": "Provider schema metadata may name raw provider keys for validation.",
+          "additionalProperties": true
+        }
+      },
+      "additionalProperties": false
+    },
+    "provider_plan": {
+      "type": "object",
+      "properties": {
+        "provider_id": { "type": "string" },
+        "model_id": { "type": "string" },
+        "capability_summary": { "type": "string" },
+        "friendly_reference_plan": {
+          "type": "array",
+          "items": {
+            "type": "object",
+            "required": ["label", "kind"],
+            "properties": {
+              "label": { "type": "string" },
+              "kind": { "type": "string", "enum": ["reference_image", "product_image", "character_asset", "audio_asset", "source_video", "generated_output"] },
+              "asset_id": { "type": "string" },
+              "output_ref_id": { "type": "string" },
+              "reference_unit_weight": { "type": "number", "minimum": 0 }
+            },
+            "additionalProperties": false
+          },
+          "default": []
+        },
+        "reference_unit_summary": {
+          "type": "object",
+          "properties": {
+            "used": { "type": "integer", "minimum": 0 },
+            "limit": { "type": "integer", "minimum": 0 },
+            "source_video_count": { "type": "integer", "minimum": 0 },
+            "character_asset_count": { "type": "integer", "minimum": 0 },
+            "audio_asset_count": { "type": "integer", "minimum": 0 }
+          },
+          "additionalProperties": false
+        },
+        "pricing_branch": { "type": "string", "enum": ["with-video", "without-video", "unknown"] },
+        "debug": {
+          "type": "object",
+          "description": "Raw provider payload keys are allowed only here for schema or debug review.",
+          "additionalProperties": true
+        },
+        "schema": {
+          "type": "object",
+          "description": "Provider schema metadata may name raw provider keys for validation.",
+          "additionalProperties": true
+        }
+      },
+      "additionalProperties": false
+    },
+    "production_node_output_refs": {
+      "type": "array",
+      "items": {
+        "type": "object",
+        "required": ["id", "node_id", "kind"],
+        "properties": {
+          "id": { "type": "string" },
+          "node_id": { "type": "string" },
+          "shot_id": { "type": "string" },
+          "kind": { "type": "string", "enum": ["video", "image", "audio", "caption", "provider_task", "metadata"] },
+          "url": { "type": "string" },
+          "provider_task_id": { "type": "string" },
+          "config_snapshot_id": { "type": "string" },
+          "config_hash": { "type": "string" },
+          "created_from_production_space_id": { "type": "string" }
+        },
+        "additionalProperties": false
+      },
+      "default": []
+    },
     "pricing_hint": { "type": "object", "additionalProperties": true },
     "qa_handoff": { "type": "object", "additionalProperties": true },
     "warnings": { "type": "array", "items": { "type": "string" } },
diff --git a/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.input.json b/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.input.json
index 5f510a9b..9eba4766 100644
--- a/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.input.json
+++ b/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.input.json
@@ -1 +1,118 @@
-{ "production_goal": {}, "plan_package": {} }
+{
+  "production_space": {
+    "id": "space-basic-product-review",
+    "version": 1,
+    "brief": {
+      "title": "Pocket Blender Review Short",
+      "goal_type": "product_review",
+      "audience": "busy college students",
+      "platform": "tiktok",
+      "objective": "Show a compact blender making a smoothie in a dorm room."
+    },
+    "shots": [
+      {
+        "id": "shot-1",
+        "order": 1,
+        "title": "Dorm desk hook",
+        "purpose": "Introduce the space constraint and product.",
+        "duration_seconds": 6,
+        "node_ids": ["node-shot-1", "node-image-1", "node-video-1"],
+        "product_asset_ids": ["psa-blender-hero"],
+        "claim_ids": ["claim-portable"],
+        "readiness": "warning"
+      }
+    ],
+    "flowNodes": [
+      {
+        "id": "node-shot-1",
+        "type": "video_shot",
+        "label": "Shot 1",
+        "position": { "x": 0, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "warning",
+          "toolBindingId": "binding-shot-1"
+        }
+      },
+      {
+        "id": "node-image-1",
+        "type": "image_generate",
+        "label": "Product insert image",
+        "position": { "x": 260, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "ready",
+          "toolBindingId": "binding-image-1",
+          "configSnapshotId": "snap-image-1"
+        }
+      },
+      {
+        "id": "node-video-1",
+        "type": "image_to_video",
+        "label": "Animated product moment",
+        "position": { "x": 520, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "warning",
+          "toolBindingId": "binding-video-1",
+          "configSnapshotId": "snap-video-1"
+        }
+      }
+    ],
+    "flowEdges": [
+      {
+        "id": "edge-image-video",
+        "source": "node-image-1",
+        "target": "node-video-1",
+        "label": "image reference",
+        "kind": "asset_dependency"
+      }
+    ],
+    "productEvidenceManifests": [
+      {
+        "shot_id": "shot-1",
+        "product_asset_ids": ["psa-blender-hero"],
+        "claim_ids": ["claim-portable"],
+        "evidence_ids": ["ev-dimensions"],
+        "readiness": "ready"
+      }
+    ],
+    "warnings": [
+      {
+        "code": "needs_user_credit_confirmation",
+        "message": "Video generation must wait for explicit credit confirmation.",
+        "severity": "warning",
+        "shot_id": "shot-1",
+        "node_id": "node-video-1"
+      }
+    ],
+    "budgetSummary": {
+      "status": "within_budget",
+      "estimated_credits": 240,
+      "requires_credit_confirmation": true
+    },
+    "readinessSummary": {
+      "status": "warning",
+      "blocking_issue_count": 0,
+      "warning_count": 1
+    }
+  },
+  "capability_registry": {
+    "registry_version": "116.1",
+    "surfaces": ["production_workspace", "video_shot", "image", "video", "audio", "storyboard_review", "video_edit"],
+    "disabled_adapters": ["music_generate", "sound_effect_generate"]
+  },
+  "provider_capabilities": [
+    {
+      "provider_id": "kie",
+      "model_id": "gemini-omni-video",
+      "supported_node_types": ["image_to_video", "video_generate"],
+      "reference_unit_limit": 7,
+      "source_video_limit": 1,
+      "audio_id_limit": 1
+    }
+  ],
+  "feature_115_readiness": "ready",
+  "feature_115_allowed_next_actions": ["plan_storyboard", "handoff_to_storyboard_review"],
+  "accepted_warnings": ["needs_user_credit_confirmation"]
+}
diff --git a/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.output.json b/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.output.json
index 0db6b3f7..8d7a91dd 100644
--- a/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.output.json
+++ b/apps/web/skills/media-production-plan-verifier/fixtures/pass.basic.output.json
@@ -1,16 +1,65 @@
 {
   "skill_name": "media-production-plan-verifier",
   "skill_version": "1.0.0",
-  "contract_version": "1.0.0",
-  "verification_status": "pass",
-  "score": 0.9,
+  "contract_version": "116.1",
+  "verification_status": "warning",
+  "score": 0.91,
+  "story_coherence_score": 0.95,
+  "shot_completeness_score": 0.9,
+  "node_readiness_score": 0.86,
+  "product_truth_score": 1,
+  "product_image_fidelity_score": 0.95,
+  "feature_115_gate_result": {
+    "status": "pass",
+    "readiness": "ready",
+    "allowed_next_actions": ["plan_storyboard", "handoff_to_storyboard_review"]
+  },
+  "provider_feasibility_score": 0.9,
+  "budget_risk": {
+    "level": "low",
+    "requires_credit_confirmation": true,
+    "estimated_credits": 240
+  },
   "blocking_issues": [],
-  "warnings": [],
+  "warnings": [
+    {
+      "code": "needs_user_credit_confirmation",
+      "message": "Approve explicit credit spend before generation.",
+      "severity": "warning",
+      "node_id": "node-video-1"
+    }
+  ],
+  "per_shot_warnings": [
+    {
+      "shot_id": "shot-1",
+      "code": "shot_generation_pending",
+      "message": "Shot is planned but not generated.",
+      "severity": "info"
+    }
+  ],
+  "per_node_warnings": [
+    {
+      "node_id": "node-video-1",
+      "code": "credit_confirmation_required",
+      "message": "Video node may be configured, but generation must wait for explicit confirmation.",
+      "severity": "warning"
+    }
+  ],
+  "product_image_fidelity_warnings": [],
   "missing_decisions": [],
   "recommended_revisions": [],
   "targeted_revision_map": {},
-  "credit_risk_summary": {},
-  "approval_readiness": {},
-  "reviewer_notes": [],
-  "allowed_next_actions": ["approve_plan"]
+  "approval_invalidation_recommendations": [],
+  "credit_risk_summary": {
+    "estimated_credits": 240,
+    "within_budget": true,
+    "save_to_node_spends_credits": false
+  },
+  "approval_readiness": {
+    "status": "warning",
+    "can_approve": true,
+    "reason": "The plan is structurally ready; generation remains gated by credit confirmation."
+  },
+  "reviewer_notes": ["Product evidence is linked to the shot and no raw provider generation is required during planning."],
+  "allowed_next_actions": ["approve_plan", "configure_nodes", "handoff_to_storyboard_review"]
 }
diff --git a/apps/web/skills/media-production-plan-verifier/schemas/input.schema.json b/apps/web/skills/media-production-plan-verifier/schemas/input.schema.json
index 96b3786f..87374b54 100644
--- a/apps/web/skills/media-production-plan-verifier/schemas/input.schema.json
+++ b/apps/web/skills/media-production-plan-verifier/schemas/input.schema.json
@@ -1,11 +1,173 @@
 {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
-  "required": ["production_goal", "plan_package"],
+  "required": [
+    "production_space",
+    "capability_registry",
+    "provider_capabilities",
+    "accepted_warnings"
+  ],
   "properties": {
-    "production_goal": { "type": "object", "additionalProperties": true },
-    "plan_package": { "type": "object", "additionalProperties": true },
+    "production_space": { "$ref": "#/$defs/productionSpace" },
+    "capability_registry": {
+      "type": "object",
+      "required": ["registry_version", "surfaces"],
+      "properties": {
+        "registry_version": { "type": "string" },
+        "surfaces": {
+          "type": "array",
+          "items": { "$ref": "#/$defs/productionSurface" },
+          "minItems": 1
+        },
+        "disabled_adapters": { "type": "array", "items": { "type": "string" }, "default": [] }
+      },
+      "additionalProperties": true
+    },
+    "provider_capabilities": {
+      "type": "array",
+      "items": {
+        "type": "object",
+        "required": ["provider_id", "model_id", "supported_node_types"],
+        "properties": {
+          "provider_id": { "type": "string" },
+          "model_id": { "type": "string" },
+          "supported_node_types": { "type": "array", "items": { "type": "string" } },
+          "reference_unit_limit": { "type": "integer", "minimum": 0 },
+          "source_video_limit": { "type": "integer", "minimum": 0 },
+          "audio_id_limit": { "type": "integer", "minimum": 0 }
+        },
+        "additionalProperties": true
+      },
+      "default": []
+    },
+    "feature_115_readiness": { "type": "string", "enum": ["ready", "ready_with_warnings", "needs_user_review", "insufficient_evidence", "not_applicable"] },
+    "feature_115_allowed_next_actions": { "type": "array", "items": { "type": "string" }, "default": [] },
     "accepted_warnings": { "type": "array", "items": { "type": "string" }, "default": [] }
   },
-  "additionalProperties": true
+  "additionalProperties": false,
+  "$defs": {
+    "productionSpace": {
+      "type": "object",
+      "required": ["id", "version", "brief", "shots", "flowNodes", "flowEdges", "productEvidenceManifests", "warnings", "budgetSummary", "readinessSummary"],
+      "properties": {
+        "id": { "type": "string" },
+        "version": { "type": "integer", "minimum": 1 },
+        "brief": { "type": "object", "additionalProperties": true },
+        "shots": { "type": "array", "items": { "$ref": "#/$defs/productionShot" }, "minItems": 1 },
+        "flowNodes": { "type": "array", "items": { "$ref": "#/$defs/productionFlowNode" }, "minItems": 1 },
+        "flowEdges": { "type": "array", "items": { "$ref": "#/$defs/productionFlowEdge" } },
+        "productEvidenceManifests": { "type": "array", "items": { "$ref": "#/$defs/productEvidenceManifest" } },
+        "warnings": { "type": "array", "items": { "$ref": "#/$defs/warning" } },
+        "budgetSummary": { "$ref": "#/$defs/budgetSummary" },
+        "readinessSummary": { "$ref": "#/$defs/readinessSummary" }
+      },
+      "additionalProperties": true
+    },
+    "productionShot": {
+      "type": "object",
+      "required": ["id", "order", "title", "purpose", "duration_seconds", "node_ids", "readiness"],
+      "properties": {
+        "id": { "type": "string" },
+        "order": { "type": "integer", "minimum": 1 },
+        "title": { "type": "string" },
+        "purpose": { "type": "string" },
+        "duration_seconds": { "type": "number", "exclusiveMinimum": 0 },
+        "node_ids": { "type": "array", "items": { "type": "string" } },
+        "product_asset_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+        "claim_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+        "readiness": { "type": "string", "enum": ["ready", "warning", "revise", "block"] }
+      },
+      "additionalProperties": true
+    },
+    "productionFlowNode": {
+      "type": "object",
+      "required": ["id", "type", "label", "position", "data"],
+      "properties": {
+        "id": { "type": "string" },
+        "type": { "type": "string" },
+        "label": { "type": "string" },
+        "position": {
+          "type": "object",
+          "required": ["x", "y"],
+          "properties": {
+            "x": { "type": "number" },
+            "y": { "type": "number" }
+          },
+          "additionalProperties": false
+        },
+        "data": {
+          "type": "object",
+          "required": ["shotId", "readiness"],
+          "properties": {
+            "shotId": { "type": "string" },
+            "readiness": { "type": "string", "enum": ["ready", "warning", "revise", "block"] },
+            "toolBindingId": { "type": "string" },
+            "configSnapshotId": { "type": "string" }
+          },
+          "additionalProperties": true
+        }
+      },
+      "additionalProperties": true
+    },
+    "productionFlowEdge": {
+      "type": "object",
+      "required": ["id", "source", "target"],
+      "properties": {
+        "id": { "type": "string" },
+        "source": { "type": "string" },
+        "target": { "type": "string" },
+        "label": { "type": "string" },
+        "kind": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "productEvidenceManifest": {
+      "type": "object",
+      "required": ["shot_id", "product_asset_ids", "claim_ids", "evidence_ids", "readiness"],
+      "properties": {
+        "shot_id": { "type": "string" },
+        "product_asset_ids": { "type": "array", "items": { "type": "string" } },
+        "claim_ids": { "type": "array", "items": { "type": "string" } },
+        "evidence_ids": { "type": "array", "items": { "type": "string" } },
+        "readiness": { "type": "string", "enum": ["ready", "ready_with_warnings", "needs_user_review", "insufficient_evidence", "blocked"] }
+      },
+      "additionalProperties": true
+    },
+    "warning": {
+      "type": "object",
+      "required": ["code", "message", "severity"],
+      "properties": {
+        "code": { "type": "string" },
+        "message": { "type": "string" },
+        "severity": { "type": "string", "enum": ["info", "warning", "blocker"] },
+        "shot_id": { "type": "string" },
+        "node_id": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "budgetSummary": {
+      "type": "object",
+      "required": ["status", "estimated_credits", "requires_credit_confirmation"],
+      "properties": {
+        "status": { "type": "string", "enum": ["within_budget", "near_limit", "over_budget", "unknown"] },
+        "estimated_credits": { "type": "number", "minimum": 0 },
+        "requires_credit_confirmation": { "type": "boolean" }
+      },
+      "additionalProperties": true
+    },
+    "readinessSummary": {
+      "type": "object",
+      "required": ["status", "blocking_issue_count", "warning_count"],
+      "properties": {
+        "status": { "type": "string", "enum": ["ready", "warning", "revise", "block"] },
+        "blocking_issue_count": { "type": "integer", "minimum": 0 },
+        "warning_count": { "type": "integer", "minimum": 0 }
+      },
+      "additionalProperties": true
+    },
+    "productionSurface": {
+      "type": "string",
+      "enum": ["production_workspace", "production_skill", "production_asset_drawer", "production_qa", "production_gate", "production_review", "production_timeline", "video_shot", "image", "video", "audio", "character_wizard", "audio_asset_wizard", "caption_editor", "storyboard_review", "video_edit", "render_surface", "publish_export"]
+    }
+  }
 }
diff --git a/apps/web/skills/media-production-plan-verifier/schemas/output.schema.json b/apps/web/skills/media-production-plan-verifier/schemas/output.schema.json
index 3c7ddd0f..7c612699 100644
--- a/apps/web/skills/media-production-plan-verifier/schemas/output.schema.json
+++ b/apps/web/skills/media-production-plan-verifier/schemas/output.schema.json
@@ -1,22 +1,135 @@
 {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
-  "required": ["skill_name", "skill_version", "contract_version", "verification_status", "score", "blocking_issues", "warnings", "missing_decisions", "recommended_revisions", "targeted_revision_map", "credit_risk_summary", "approval_readiness", "reviewer_notes", "allowed_next_actions"],
+  "required": [
+    "skill_name",
+    "skill_version",
+    "contract_version",
+    "verification_status",
+    "score",
+    "story_coherence_score",
+    "shot_completeness_score",
+    "node_readiness_score",
+    "product_truth_score",
+    "product_image_fidelity_score",
+    "feature_115_gate_result",
+    "provider_feasibility_score",
+    "budget_risk",
+    "blocking_issues",
+    "warnings",
+    "per_shot_warnings",
+    "per_node_warnings",
+    "product_image_fidelity_warnings",
+    "missing_decisions",
+    "recommended_revisions",
+    "targeted_revision_map",
+    "approval_invalidation_recommendations",
+    "credit_risk_summary",
+    "approval_readiness",
+    "reviewer_notes",
+    "allowed_next_actions"
+  ],
   "properties": {
     "skill_name": { "const": "media-production-plan-verifier" },
     "skill_version": { "type": "string" },
     "contract_version": { "type": "string" },
     "verification_status": { "type": "string", "enum": ["pass", "warning", "revise", "human_review", "block"] },
-    "score": { "type": "number" },
-    "blocking_issues": { "type": "array", "items": { "type": "object" } },
-    "warnings": { "type": "array", "items": { "type": "object" } },
+    "score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "story_coherence_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "shot_completeness_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "node_readiness_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "product_truth_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "product_image_fidelity_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "feature_115_gate_result": {
+      "type": "object",
+      "required": ["status", "allowed_next_actions"],
+      "properties": {
+        "status": { "type": "string", "enum": ["pass", "warning", "block"] },
+        "readiness": { "type": "string" },
+        "allowed_next_actions": { "type": "array", "items": { "type": "string" } }
+      },
+      "additionalProperties": true
+    },
+    "provider_feasibility_score": { "type": "number", "minimum": 0, "maximum": 1 },
+    "budget_risk": {
+      "type": "object",
+      "required": ["level", "requires_credit_confirmation"],
+      "properties": {
+        "level": { "type": "string", "enum": ["low", "medium", "high", "blocked"] },
+        "requires_credit_confirmation": { "type": "boolean" },
+        "estimated_credits": { "type": "number", "minimum": 0 }
+      },
+      "additionalProperties": true
+    },
+    "blocking_issues": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
+    "warnings": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
+    "per_shot_warnings": { "type": "array", "items": { "$ref": "#/$defs/shotFinding" } },
+    "per_node_warnings": { "type": "array", "items": { "$ref": "#/$defs/nodeFinding" } },
+    "product_image_fidelity_warnings": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
     "missing_decisions": { "type": "array", "items": { "type": "string" } },
-    "recommended_revisions": { "type": "array", "items": { "type": "object" } },
-    "targeted_revision_map": { "type": "object" },
-    "credit_risk_summary": { "type": "object" },
-    "approval_readiness": { "type": "object" },
+    "recommended_revisions": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
+    "targeted_revision_map": { "type": "object", "additionalProperties": true },
+    "approval_invalidation_recommendations": {
+      "type": "array",
+      "items": {
+        "type": "object",
+        "required": ["target_id", "reason"],
+        "properties": {
+          "target_id": { "type": "string" },
+          "target_type": { "type": "string", "enum": ["space", "shot", "node", "config_snapshot", "handoff"] },
+          "reason": { "type": "string" }
+        },
+        "additionalProperties": true
+      }
+    },
+    "credit_risk_summary": { "type": "object", "additionalProperties": true },
+    "approval_readiness": {
+      "type": "object",
+      "required": ["status", "can_approve"],
+      "properties": {
+        "status": { "type": "string", "enum": ["ready", "warning", "revise", "block"] },
+        "can_approve": { "type": "boolean" }
+      },
+      "additionalProperties": true
+    },
     "reviewer_notes": { "type": "array", "items": { "type": "string" } },
     "allowed_next_actions": { "type": "array", "items": { "type": "string" } }
   },
-  "additionalProperties": false
+  "additionalProperties": false,
+  "$defs": {
+    "finding": {
+      "type": "object",
+      "required": ["code", "message", "severity"],
+      "properties": {
+        "code": { "type": "string" },
+        "message": { "type": "string" },
+        "severity": { "type": "string", "enum": ["info", "warning", "blocker"] },
+        "shot_id": { "type": "string" },
+        "node_id": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "shotFinding": {
+      "type": "object",
+      "required": ["shot_id", "code", "message", "severity"],
+      "properties": {
+        "shot_id": { "type": "string" },
+        "code": { "type": "string" },
+        "message": { "type": "string" },
+        "severity": { "type": "string", "enum": ["info", "warning", "blocker"] }
+      },
+      "additionalProperties": true
+    },
+    "nodeFinding": {
+      "type": "object",
+      "required": ["node_id", "code", "message", "severity"],
+      "properties": {
+        "node_id": { "type": "string" },
+        "code": { "type": "string" },
+        "message": { "type": "string" },
+        "severity": { "type": "string", "enum": ["info", "warning", "blocker"] }
+      },
+      "additionalProperties": true
+    }
+  }
 }
diff --git a/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.input.json b/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.input.json
index 8af7b171..a38b7e92 100644
--- a/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.input.json
+++ b/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.input.json
@@ -1 +1,105 @@
-{ "production_goal": { "summary": "Create a product review short", "platform": "tiktok" } }
+{
+  "production_brief": {
+    "title": "Pocket Blender Review Short",
+    "goal_type": "product_review",
+    "audience": "busy college students",
+    "platform": "tiktok",
+    "objective": "Show a compact blender making a smoothie in a dorm room.",
+    "language": "en",
+    "constraints": ["Keep every product claim tied to evidence."]
+  },
+  "context_assets": [
+    {
+      "id": "asset-product-hero",
+      "kind": "product",
+      "label": "Hero product image",
+      "url": "https://cdn.example.test/blender.png",
+      "provenance": { "source": "marketplace_capture", "owner": "tenant" }
+    }
+  ],
+  "product_storyboard_assets": [
+    {
+      "id": "psa-blender-hero",
+      "product_id": "prod-blender",
+      "sku": "BLEND-01",
+      "variant": "mint",
+      "role": "hero",
+      "approval_state": "approved",
+      "fidelity_risk": "low"
+    }
+  ],
+  "marketplace_storytelling_handoff": {
+    "source": "feature_115",
+    "readiness": "ready",
+    "selected_product_ids": ["prod-blender"],
+    "storytelling_notes": ["Lead with portability, then show the smoothie result."]
+  },
+  "product_claim_evidence_map": [
+    {
+      "claim_id": "claim-portable",
+      "claim_text": "Compact enough for a dorm desk.",
+      "claim_type": "physical_attribute",
+      "evidence_ids": ["ev-dimensions"],
+      "user_approval_state": "approved",
+      "risk": "low"
+    }
+  ],
+  "feature_115_readiness": "ready",
+  "feature_115_allowed_next_actions": ["plan_storyboard", "handoff_to_storyboard_review"],
+  "available_tool_capabilities": [
+    {
+      "tool_id": "image-generate",
+      "surface": "image",
+      "supported_node_types": ["image_generate"],
+      "mvp_adapter": true
+    },
+    {
+      "tool_id": "gemini-omni-video",
+      "surface": "video",
+      "supported_node_types": ["image_to_video", "video_generate"],
+      "mvp_adapter": true
+    },
+    {
+      "tool_id": "audio-tts",
+      "surface": "audio",
+      "supported_node_types": ["text_to_speech"],
+      "mvp_adapter": true
+    },
+    {
+      "tool_id": "storyboard-review",
+      "surface": "storyboard_review",
+      "supported_node_types": ["storyboard_review_handoff"],
+      "mvp_adapter": true
+    }
+  ],
+  "provider_capabilities": [
+    {
+      "provider_id": "kie",
+      "model_id": "gemini-omni-video",
+      "supported_node_types": ["image_to_video", "video_generate"],
+      "reference_unit_limit": 7,
+      "source_video_limit": 1,
+      "audio_id_limit": 1
+    }
+  ],
+  "capability_registry": {
+    "registry_version": "116.1",
+    "surfaces": ["production_workspace", "video_shot", "image", "video", "audio", "storyboard_review", "video_edit"],
+    "disabled_adapters": ["music_generate", "sound_effect_generate"]
+  },
+  "budget_policy": {
+    "max_credits": 500,
+    "quality_target": "social_ready",
+    "requires_confirmation_before_spend": true
+  },
+  "downstream_target_requirements": ["storyboard_review", "video_edit"],
+  "duration_and_pacing_policy": {
+    "target_duration_seconds": 18,
+    "platform": "tiktok",
+    "aspect_ratio": "9:16",
+    "pacing": "fast"
+  },
+  "shot_count_guidance": { "min": 2, "max": 4, "preferred": 3 },
+  "locked_shot_ids": [],
+  "locked_node_ids": []
+}
diff --git a/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.output.json b/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.output.json
index eeda7c4f..3339105c 100644
--- a/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.output.json
+++ b/apps/web/skills/media-production-storyboard-planner/fixtures/pass.basic.output.json
@@ -1,20 +1,308 @@
 {
   "skill_name": "media-production-storyboard-planner",
   "skill_version": "1.0.0",
-  "contract_version": "1.0.0",
-  "production_goal_summary": {},
-  "production_bible": {},
-  "creative_strategy": {},
-  "storyboard_outline": [],
-  "scene_timeline": [],
-  "shot_plan": [],
-  "asset_requirements": [],
-  "provider_candidate_plan": [],
-  "batch_execution_plan": {},
-  "credit_time_estimate": {},
-  "risks": [],
-  "assumptions": [],
-  "approval_checklist": [],
+  "contract_version": "116.1",
+  "production_goal_summary": {
+    "title": "Pocket Blender Review Short",
+    "platform": "tiktok",
+    "target_duration_seconds": 18
+  },
+  "production_bible": {
+    "premise": "A student makes a smoothie between classes using a compact blender.",
+    "tone": "bright, practical, trustworthy",
+    "product_truth_rules": ["Use only approved product claims."]
+  },
+  "creative_strategy": {
+    "hook": "Open on a crowded dorm desk and reveal the compact blender.",
+    "camera_language": "quick handheld close-ups with clean product insert shots"
+  },
+  "production_space": {
+    "id": "space-basic-product-review",
+    "version": 1,
+    "brief": {
+      "title": "Pocket Blender Review Short",
+      "goal_type": "product_review",
+      "audience": "busy college students",
+      "platform": "tiktok",
+      "objective": "Show a compact blender making a smoothie in a dorm room."
+    },
+    "shots": [
+      {
+        "id": "shot-1",
+        "order": 1,
+        "title": "Dorm desk hook",
+        "purpose": "Introduce the space constraint and product.",
+        "duration_seconds": 6,
+        "node_ids": ["node-shot-1", "node-image-1", "node-video-1"],
+        "product_asset_ids": ["psa-blender-hero"],
+        "claim_ids": ["claim-portable"],
+        "readiness": "warning"
+      }
+    ],
+    "flowNodes": [
+      {
+        "id": "node-shot-1",
+        "type": "video_shot",
+        "label": "Shot 1",
+        "position": { "x": 0, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "warning",
+          "toolBindingId": "binding-shot-1"
+        }
+      },
+      {
+        "id": "node-image-1",
+        "type": "image_generate",
+        "label": "Product insert image",
+        "position": { "x": 260, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "ready",
+          "toolBindingId": "binding-image-1",
+          "configSnapshotId": "snap-image-1",
+          "outputRefs": []
+        }
+      },
+      {
+        "id": "node-video-1",
+        "type": "image_to_video",
+        "label": "Animated product moment",
+        "position": { "x": 520, "y": 0 },
+        "data": {
+          "shotId": "shot-1",
+          "readiness": "warning",
+          "toolBindingId": "binding-video-1",
+          "configSnapshotId": "snap-video-1",
+          "outputRefs": []
+        }
+      }
+    ],
+    "flowEdges": [
+      {
+        "id": "edge-image-video",
+        "source": "node-image-1",
+        "target": "node-video-1",
+        "label": "image reference",
+        "kind": "asset_dependency"
+      }
+    ],
+    "productEvidenceManifests": [
+      {
+        "shot_id": "shot-1",
+        "product_asset_ids": ["psa-blender-hero"],
+        "claim_ids": ["claim-portable"],
+        "evidence_ids": ["ev-dimensions"],
+        "readiness": "ready"
+      }
+    ],
+    "warnings": [
+      {
+        "code": "needs_user_credit_confirmation",
+        "message": "Video generation must wait for explicit credit confirmation.",
+        "severity": "warning",
+        "shot_id": "shot-1",
+        "node_id": "node-video-1"
+      }
+    ],
+    "budgetSummary": {
+      "status": "within_budget",
+      "estimated_credits": 240,
+      "requires_credit_confirmation": true
+    },
+    "readinessSummary": {
+      "status": "warning",
+      "blocking_issue_count": 0,
+      "warning_count": 1
+    }
+  },
+  "shot_count_estimate": { "count": 1, "rationale": "Fixture keeps one representative shot for deterministic validation." },
+  "story_beats": [
+    { "id": "beat-hook", "summary": "Show the small workspace and introduce the blender." }
+  ],
+  "shots": [
+    {
+      "id": "shot-1",
+      "order": 1,
+      "title": "Dorm desk hook",
+      "purpose": "Introduce the space constraint and product.",
+      "duration_seconds": 6,
+      "node_ids": ["node-shot-1", "node-image-1", "node-video-1"],
+      "product_asset_ids": ["psa-blender-hero"],
+      "claim_ids": ["claim-portable"],
+      "readiness": "warning"
+    }
+  ],
+  "shot_sequence": ["shot-1"],
+  "shot_child_node_plan": [
+    { "shot_id": "shot-1", "node_ids": ["node-image-1", "node-video-1"] }
+  ],
+  "canvas_nodes": [
+    {
+      "id": "node-shot-1",
+      "type": "video_shot",
+      "label": "Shot 1",
+      "position": { "x": 0, "y": 0 },
+      "data": { "shotId": "shot-1", "readiness": "warning", "toolBindingId": "binding-shot-1" }
+    },
+    {
+      "id": "node-image-1",
+      "type": "image_generate",
+      "label": "Product insert image",
+      "position": { "x": 260, "y": 0 },
+      "data": { "shotId": "shot-1", "readiness": "ready", "toolBindingId": "binding-image-1", "configSnapshotId": "snap-image-1", "outputRefs": [] }
+    },
+    {
+      "id": "node-video-1",
+      "type": "image_to_video",
+      "label": "Animated product moment",
+      "position": { "x": 520, "y": 0 },
+      "data": { "shotId": "shot-1", "readiness": "warning", "toolBindingId": "binding-video-1", "configSnapshotId": "snap-video-1", "outputRefs": [] }
+    }
+  ],
+  "canvas_edges": [
+    { "id": "edge-image-video", "source": "node-image-1", "target": "node-video-1", "label": "image reference", "kind": "asset_dependency" }
+  ],
+  "node_tool_bindings": [
+    {
+      "node_id": "node-shot-1",
+      "surface": "video_shot",
+      "mode": "shot_builder",
+      "adapterId": "video-shot-adapter",
+      "canConfigure": true,
+      "canGenerate": false,
+      "canSaveToNode": true,
+      "requiresApprovalBeforeGenerate": true,
+      "configSchemaVersion": "116.1",
+      "outputSchemaVersion": "116.1"
+    },
+    {
+      "node_id": "node-image-1",
+      "surface": "image",
+      "mode": "generate",
+      "adapterId": "image-generate-adapter",
+      "canConfigure": true,
+      "canGenerate": true,
+      "canSaveToNode": true,
+      "requiresApprovalBeforeGenerate": true,
+      "configSchemaVersion": "116.1",
+      "outputSchemaVersion": "116.1"
+    },
+    {
+      "node_id": "node-video-1",
+      "surface": "video",
+      "mode": "image_to_video",
+      "modelId": "gemini-omni-video",
+      "adapterId": "gemini-omni-video-adapter",
+      "canConfigure": true,
+      "canGenerate": true,
+      "canSaveToNode": true,
+      "requiresApprovalBeforeGenerate": true,
+      "configSchemaVersion": "116.1",
+      "outputSchemaVersion": "116.1"
+    }
+  ],
+  "node_config_suggestions": [
+    {
+      "node_id": "node-image-1",
+      "surface": "image",
+      "mode": "generate",
+      "config_snapshot": {
+        "id": "snap-image-1",
+        "nodeId": "node-image-1",
+        "nodeVersion": 1,
+        "surface": "image",
+        "mode": "generate",
+        "prompt": "Clean product insert of a mint compact blender on a dorm desk.",
+        "referenceAssetIds": ["asset-product-hero"],
+        "productEvidenceRefs": [
+          {
+            "productStoryboardAssetId": "psa-blender-hero",
+            "evidenceIds": ["ev-dimensions"],
+            "claimIds": ["claim-portable"],
+            "requiredVisualAccuracy": "high"
+          }
+        ],
+        "dynamicFormValues": { "aspect_ratio": "9:16" },
+        "configHash": "hash-image-1"
+      }
+    },
+    {
+      "node_id": "node-video-1",
+      "surface": "video",
+      "mode": "image_to_video",
+      "config_snapshot": {
+        "id": "snap-video-1",
+        "nodeId": "node-video-1",
+        "nodeVersion": 1,
+        "surface": "video",
+        "mode": "image_to_video",
+        "prompt": "Animate the blender reveal with a quick push-in and smoothie ingredients nearby.",
+        "referenceAssetIds": ["asset-product-hero"],
+        "productEvidenceRefs": [
+          {
+            "productStoryboardAssetId": "psa-blender-hero",
+            "evidenceIds": ["ev-dimensions"],
+            "claimIds": ["claim-portable"],
+            "requiredVisualAccuracy": "high"
+          }
+        ],
+        "dynamicFormValues": { "duration_seconds": 6, "resolution": "1080p" },
+        "providerPayloadPreview": {
+          "debug_only": true,
+          "schema_ref": "gemini-omni-video.input.v1"
+        },
+        "configHash": "hash-video-1"
+      }
+    }
+  ],
+  "shot_product_usage": [
+    {
+      "shot_id": "shot-1",
+      "product_asset_ids": ["psa-blender-hero"],
+      "claim_ids": ["claim-portable"],
+      "risk": "low"
+    }
+  ],
+  "product_evidence_manifest": [
+    {
+      "shot_id": "shot-1",
+      "product_asset_ids": ["psa-blender-hero"],
+      "claim_ids": ["claim-portable"],
+      "evidence_ids": ["ev-dimensions"],
+      "readiness": "ready"
+    }
+  ],
+  "feature_115_import_warnings": [],
+  "unsupported_tool_requests": [],
+  "handoff_plan": {
+    "storyboard_review": { "status": "ready_after_approval", "shot_ids": ["shot-1"] },
+    "video_edit": { "status": "ready_after_storyboard_review", "shot_ids": ["shot-1"] }
+  },
+  "credit_and_time_estimate": { "estimated_credits": 240, "estimated_minutes": 8 },
+  "budget_summary": {
+    "status": "within_budget",
+    "estimated_credits": 240,
+    "requires_credit_confirmation": true
+  },
+  "readiness_summary": {
+    "status": "warning",
+    "blocking_issue_count": 0,
+    "warning_count": 1
+  },
+  "warnings": [
+    {
+      "code": "needs_user_credit_confirmation",
+      "message": "Video generation must wait for explicit credit confirmation.",
+      "severity": "warning",
+      "shot_id": "shot-1",
+      "node_id": "node-video-1"
+    }
+  ],
+  "approval_checklist": [
+    { "id": "product-evidence", "label": "Product evidence linked", "status": "pass" },
+    { "id": "credit-confirmation", "label": "Credit spend confirmed before generation", "status": "pending" }
+  ],
   "revision_targets": [],
-  "next_actions": ["review_plan"]
+  "next_actions": ["review_canvas", "approve_plan", "configure_nodes"]
 }
diff --git a/apps/web/skills/media-production-storyboard-planner/schemas/input.schema.json b/apps/web/skills/media-production-storyboard-planner/schemas/input.schema.json
index a9b9a6c0..7a41db17 100644
--- a/apps/web/skills/media-production-storyboard-planner/schemas/input.schema.json
+++ b/apps/web/skills/media-production-storyboard-planner/schemas/input.schema.json
@@ -1,11 +1,213 @@
 {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
-  "required": ["production_goal"],
+  "required": [
+    "production_brief",
+    "context_assets",
+    "product_storyboard_assets",
+    "marketplace_storytelling_handoff",
+    "product_claim_evidence_map",
+    "feature_115_readiness",
+    "feature_115_allowed_next_actions",
+    "available_tool_capabilities",
+    "provider_capabilities",
+    "capability_registry",
+    "duration_and_pacing_policy",
+    "shot_count_guidance"
+  ],
   "properties": {
-    "production_goal": { "type": "object", "additionalProperties": true },
-    "revision_request": { "type": "object", "additionalProperties": true },
-    "locked_sections": { "type": "array", "items": { "type": "string" }, "default": [] }
+    "production_brief": { "$ref": "#/$defs/productionBrief" },
+    "context_assets": {
+      "type": "array",
+      "items": { "$ref": "#/$defs/contextAsset" },
+      "default": []
+    },
+    "product_storyboard_assets": {
+      "type": "array",
+      "items": { "$ref": "#/$defs/productStoryboardAsset" },
+      "default": []
+    },
+    "marketplace_storytelling_handoff": {
+      "type": "object",
+      "required": ["source", "readiness"],
+      "properties": {
+        "source": { "type": "string" },
+        "readiness": { "type": "string", "enum": ["ready", "ready_with_warnings", "needs_user_review", "insufficient_evidence", "not_applicable"] },
+        "selected_product_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+        "storytelling_notes": { "type": "array", "items": { "type": "string" }, "default": [] }
+      },
+      "additionalProperties": true
+    },
+    "product_claim_evidence_map": {
+      "type": "array",
+      "items": { "$ref": "#/$defs/productClaimEvidence" },
+      "default": []
+    },
+    "feature_115_readiness": { "type": "string", "enum": ["ready", "ready_with_warnings", "needs_user_review", "insufficient_evidence", "not_applicable"] },
+    "feature_115_allowed_next_actions": {
+      "type": "array",
+      "items": { "type": "string" },
+      "default": []
+    },
+    "available_tool_capabilities": {
+      "type": "array",
+      "items": { "$ref": "#/$defs/toolCapability" },
+      "minItems": 1
+    },
+    "provider_capabilities": {
+      "type": "array",
+      "items": { "$ref": "#/$defs/providerCapability" },
+      "default": []
+    },
+    "capability_registry": {
+      "type": "object",
+      "required": ["registry_version", "surfaces"],
+      "properties": {
+        "registry_version": { "type": "string" },
+        "surfaces": {
+          "type": "array",
+          "items": { "$ref": "#/$defs/productionSurface" },
+          "minItems": 1
+        },
+        "disabled_adapters": { "type": "array", "items": { "type": "string" }, "default": [] }
+      },
+      "additionalProperties": true
+    },
+    "budget_policy": {
+      "type": "object",
+      "properties": {
+        "max_credits": { "type": "number", "minimum": 0 },
+        "quality_target": { "type": "string" },
+        "requires_confirmation_before_spend": { "type": "boolean", "default": true }
+      },
+      "additionalProperties": true
+    },
+    "downstream_target_requirements": {
+      "type": "array",
+      "items": { "type": "string", "enum": ["storyboard_review", "video_edit", "image", "video", "audio", "publish_export"] },
+      "default": []
+    },
+    "duration_and_pacing_policy": {
+      "type": "object",
+      "required": ["target_duration_seconds"],
+      "properties": {
+        "target_duration_seconds": { "type": "number", "exclusiveMinimum": 0 },
+        "platform": { "type": "string" },
+        "aspect_ratio": { "type": "string" },
+        "pacing": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "shot_count_guidance": {
+      "type": "object",
+      "required": ["min", "max"],
+      "properties": {
+        "min": { "type": "integer", "minimum": 1 },
+        "max": { "type": "integer", "minimum": 1 },
+        "preferred": { "type": "integer", "minimum": 1 }
+      },
+      "additionalProperties": false
+    },
+    "previous_space": { "$ref": "#/$defs/productionSpace" },
+    "locked_shot_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+    "locked_node_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+    "revision_request": { "type": "object", "additionalProperties": true }
   },
-  "additionalProperties": true
+  "additionalProperties": false,
+  "$defs": {
+    "productionBrief": {
+      "type": "object",
+      "required": ["title", "goal_type", "audience", "platform", "objective"],
+      "properties": {
+        "title": { "type": "string", "minLength": 1 },
+        "goal_type": { "type": "string" },
+        "audience": { "type": "string" },
+        "platform": { "type": "string" },
+        "objective": { "type": "string" },
+        "language": { "type": "string" },
+        "constraints": { "type": "array", "items": { "type": "string" }, "default": [] }
+      },
+      "additionalProperties": true
+    },
+    "contextAsset": {
+      "type": "object",
+      "required": ["id", "kind", "label", "provenance"],
+      "properties": {
+        "id": { "type": "string" },
+        "kind": { "type": "string", "enum": ["character", "product", "scene", "brand", "audio", "source_video", "generated_media", "storyboard_review", "video_edit"] },
+        "label": { "type": "string" },
+        "url": { "type": "string" },
+        "provenance": { "type": "object", "additionalProperties": true }
+      },
+      "additionalProperties": true
+    },
+    "productStoryboardAsset": {
+      "type": "object",
+      "required": ["id", "product_id", "role", "approval_state", "fidelity_risk"],
+      "properties": {
+        "id": { "type": "string" },
+        "product_id": { "type": "string" },
+        "sku": { "type": "string" },
+        "variant": { "type": "string" },
+        "role": { "type": "string" },
+        "approval_state": { "type": "string", "enum": ["approved", "needs_review", "blocked"] },
+        "fidelity_risk": { "type": "string", "enum": ["low", "medium", "high", "blocked"] }
+      },
+      "additionalProperties": true
+    },
+    "productClaimEvidence": {
+      "type": "object",
+      "required": ["claim_id", "claim_text", "claim_type", "evidence_ids", "user_approval_state", "risk"],
+      "properties": {
+        "claim_id": { "type": "string" },
+        "claim_text": { "type": "string" },
+        "claim_type": { "type": "string" },
+        "evidence_ids": { "type": "array", "items": { "type": "string" } },
+        "user_approval_state": { "type": "string", "enum": ["approved", "needs_review", "rejected"] },
+        "risk": { "type": "string", "enum": ["low", "medium", "high", "policy_sensitive"] }
+      },
+      "additionalProperties": true
+    },
+    "toolCapability": {
+      "type": "object",
+      "required": ["tool_id", "surface", "supported_node_types"],
+      "properties": {
+        "tool_id": { "type": "string" },
+        "surface": { "$ref": "#/$defs/productionSurface" },
+        "supported_node_types": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
+        "mvp_adapter": { "type": "boolean" }
+      },
+      "additionalProperties": true
+    },
+    "providerCapability": {
+      "type": "object",
+      "required": ["provider_id", "model_id", "supported_node_types"],
+      "properties": {
+        "provider_id": { "type": "string" },
+        "model_id": { "type": "string" },
+        "supported_node_types": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
+        "reference_unit_limit": { "type": "integer", "minimum": 0 },
+        "source_video_limit": { "type": "integer", "minimum": 0 },
+        "audio_id_limit": { "type": "integer", "minimum": 0 }
+      },
+      "additionalProperties": true
+    },
+    "productionSurface": {
+      "type": "string",
+      "enum": ["production_workspace", "production_skill", "production_asset_drawer", "production_qa", "production_gate", "production_review", "production_timeline", "video_shot", "image", "video", "audio", "character_wizard", "audio_asset_wizard", "caption_editor", "storyboard_review", "video_edit", "render_surface", "publish_export"]
+    },
+    "productionSpace": {
+      "type": "object",
+      "required": ["id", "version", "brief", "shots", "flowNodes", "flowEdges"],
+      "properties": {
+        "id": { "type": "string" },
+        "version": { "type": "integer", "minimum": 1 },
+        "brief": { "$ref": "#/$defs/productionBrief" },
+        "shots": { "type": "array", "items": { "type": "object" } },
+        "flowNodes": { "type": "array", "items": { "type": "object" } },
+        "flowEdges": { "type": "array", "items": { "type": "object" } }
+      },
+      "additionalProperties": true
+    }
+  }
 }
diff --git a/apps/web/skills/media-production-storyboard-planner/schemas/output.schema.json b/apps/web/skills/media-production-storyboard-planner/schemas/output.schema.json
index 68f7767f..fb866cea 100644
--- a/apps/web/skills/media-production-storyboard-planner/schemas/output.schema.json
+++ b/apps/web/skills/media-production-storyboard-planner/schemas/output.schema.json
@@ -1,26 +1,306 @@
 {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
-  "required": ["skill_name", "skill_version", "contract_version", "production_goal_summary", "production_bible", "creative_strategy", "storyboard_outline", "scene_timeline", "shot_plan", "asset_requirements", "provider_candidate_plan", "batch_execution_plan", "credit_time_estimate", "risks", "assumptions", "approval_checklist", "revision_targets", "next_actions"],
+  "required": [
+    "skill_name",
+    "skill_version",
+    "contract_version",
+    "production_goal_summary",
+    "production_bible",
+    "creative_strategy",
+    "production_space",
+    "shot_count_estimate",
+    "story_beats",
+    "shots",
+    "shot_sequence",
+    "shot_child_node_plan",
+    "canvas_nodes",
+    "canvas_edges",
+    "node_tool_bindings",
+    "node_config_suggestions",
+    "shot_product_usage",
+    "product_evidence_manifest",
+    "feature_115_import_warnings",
+    "unsupported_tool_requests",
+    "handoff_plan",
+    "credit_and_time_estimate",
+    "budget_summary",
+    "readiness_summary",
+    "warnings",
+    "approval_checklist",
+    "revision_targets",
+    "next_actions"
+  ],
   "properties": {
     "skill_name": { "const": "media-production-storyboard-planner" },
     "skill_version": { "type": "string" },
     "contract_version": { "type": "string" },
-    "production_goal_summary": { "type": "object" },
-    "production_bible": { "type": "object" },
-    "creative_strategy": { "type": "object" },
-    "storyboard_outline": { "type": "array", "items": { "type": "object" } },
-    "scene_timeline": { "type": "array", "items": { "type": "object" } },
-    "shot_plan": { "type": "array", "items": { "type": "object" } },
-    "asset_requirements": { "type": "array", "items": { "type": "object" } },
-    "provider_candidate_plan": { "type": "array", "items": { "type": "object" } },
-    "batch_execution_plan": { "type": "object" },
-    "credit_time_estimate": { "type": "object" },
-    "risks": { "type": "array", "items": { "type": "object" } },
-    "assumptions": { "type": "array", "items": { "type": "string" } },
-    "approval_checklist": { "type": "array", "items": { "type": "object" } },
-    "revision_targets": { "type": "array", "items": { "type": "object" } },
+    "production_goal_summary": { "type": "object", "additionalProperties": true },
+    "production_bible": { "type": "object", "additionalProperties": true },
+    "creative_strategy": { "type": "object", "additionalProperties": true },
+    "production_space": { "$ref": "#/$defs/productionSpace" },
+    "shot_count_estimate": {
+      "type": "object",
+      "required": ["count", "rationale"],
+      "properties": {
+        "count": { "type": "integer", "minimum": 1 },
+        "rationale": { "type": "string" }
+      },
+      "additionalProperties": false
+    },
+    "story_beats": { "type": "array", "items": { "$ref": "#/$defs/storyBeat" } },
+    "shots": { "type": "array", "items": { "$ref": "#/$defs/productionShot" }, "minItems": 1 },
+    "shot_sequence": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
+    "shot_child_node_plan": { "type": "array", "items": { "$ref": "#/$defs/shotChildNodePlan" } },
+    "canvas_nodes": { "type": "array", "items": { "$ref": "#/$defs/productionFlowNode" }, "minItems": 1 },
+    "canvas_edges": { "type": "array", "items": { "$ref": "#/$defs/productionFlowEdge" } },
+    "node_tool_bindings": { "type": "array", "items": { "$ref": "#/$defs/nodeToolBinding" } },
+    "node_config_suggestions": { "type": "array", "items": { "$ref": "#/$defs/nodeConfigSuggestion" } },
+    "shot_product_usage": { "type": "array", "items": { "$ref": "#/$defs/shotProductUsage" } },
+    "product_evidence_manifest": { "type": "array", "items": { "$ref": "#/$defs/productEvidenceManifest" } },
+    "feature_115_import_warnings": { "type": "array", "items": { "$ref": "#/$defs/warning" } },
+    "unsupported_tool_requests": { "type": "array", "items": { "$ref": "#/$defs/warning" } },
+    "handoff_plan": { "type": "object", "additionalProperties": true },
+    "credit_and_time_estimate": { "$ref": "#/$defs/creditAndTimeEstimate" },
+    "budget_summary": { "$ref": "#/$defs/budgetSummary" },
+    "readiness_summary": { "$ref": "#/$defs/readinessSummary" },
+    "warnings": { "type": "array", "items": { "$ref": "#/$defs/warning" } },
+    "approval_checklist": { "type": "array", "items": { "$ref": "#/$defs/approvalItem" } },
+    "revision_targets": { "type": "array", "items": { "type": "object", "additionalProperties": true } },
     "next_actions": { "type": "array", "items": { "type": "string" } }
   },
-  "additionalProperties": false
+  "additionalProperties": false,
+  "$defs": {
+    "productionSpace": {
+      "type": "object",
+      "required": ["id", "version", "brief", "shots", "flowNodes", "flowEdges", "productEvidenceManifests", "warnings", "budgetSummary", "readinessSummary"],
+      "properties": {
+        "id": { "type": "string" },
+        "version": { "type": "integer", "minimum": 1 },
+        "brief": { "type": "object", "additionalProperties": true },
+        "shots": { "type": "array", "items": { "$ref": "#/$defs/productionShot" }, "minItems": 1 },
+        "flowNodes": { "type": "array", "items": { "$ref": "#/$defs/productionFlowNode" }, "minItems": 1 },
+        "flowEdges": { "type": "array", "items": { "$ref": "#/$defs/productionFlowEdge" } },
+        "productEvidenceManifests": { "type": "array", "items": { "$ref": "#/$defs/productEvidenceManifest" } },
+        "warnings": { "type": "array", "items": { "$ref": "#/$defs/warning" } },
+        "budgetSummary": { "$ref": "#/$defs/budgetSummary" },
+        "readinessSummary": { "$ref": "#/$defs/readinessSummary" }
+      },
+      "additionalProperties": true
+    },
+    "productionShot": {
+      "type": "object",
+      "required": ["id", "order", "title", "purpose", "duration_seconds", "node_ids", "readiness"],
+      "properties": {
+        "id": { "type": "string" },
+        "order": { "type": "integer", "minimum": 1 },
+        "title": { "type": "string" },
+        "purpose": { "type": "string" },
+        "duration_seconds": { "type": "number", "exclusiveMinimum": 0 },
+        "node_ids": { "type": "array", "items": { "type": "string" } },
+        "product_asset_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+        "claim_ids": { "type": "array", "items": { "type": "string" }, "default": [] },
+        "readiness": { "type": "string", "enum": ["ready", "warning", "revise", "block"] }
+      },
+      "additionalProperties": true
+    },
+    "productionFlowNode": {
+      "type": "object",
+      "required": ["id", "type", "label", "position", "data"],
+      "properties": {
+        "id": { "type": "string" },
+        "type": { "type": "string" },
+        "label": { "type": "string" },
+        "position": {
+          "type": "object",
+          "required": ["x", "y"],
+          "properties": {
+            "x": { "type": "number" },
+            "y": { "type": "number" }
+          },
+          "additionalProperties": false
+        },
+        "data": {
+          "type": "object",
+          "required": ["shotId", "readiness"],
+          "properties": {
+            "shotId": { "type": "string" },
+            "readiness": { "type": "string", "enum": ["ready", "warning", "revise", "block"] },
+            "toolBindingId": { "type": "string" },
+            "configSnapshotId": { "type": "string" },
+            "outputRefs": { "type": "array", "items": { "$ref": "#/$defs/nodeOutputRef" }, "default": [] }
+          },
+          "additionalProperties": true
+        }
+      },
+      "additionalProperties": true
+    },
+    "productionFlowEdge": {
+      "type": "object",
+      "required": ["id", "source", "target"],
+      "properties": {
+        "id": { "type": "string" },
+        "source": { "type": "string" },
+        "target": { "type": "string" },
+        "label": { "type": "string" },
+        "kind": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "nodeToolBinding": {
+      "type": "object",
+      "required": ["node_id", "surface", "mode", "adapterId", "canConfigure", "canGenerate", "canSaveToNode", "requiresApprovalBeforeGenerate", "configSchemaVersion", "outputSchemaVersion"],
+      "properties": {
+        "node_id": { "type": "string" },
+        "surface": { "$ref": "#/$defs/productionSurface" },
+        "mode": { "type": "string" },
+        "route": { "type": "string" },
+        "skillId": { "type": "string" },
+        "modelId": { "type": "string" },
+        "adapterId": { "type": "string" },
+        "canConfigure": { "type": "boolean" },
+        "canGenerate": { "type": "boolean" },
+        "canSaveToNode": { "type": "boolean" },
+        "requiresApprovalBeforeGenerate": { "type": "boolean" },
+        "configSchemaVersion": { "type": "string" },
+        "outputSchemaVersion": { "type": "string" }
+      },
+      "additionalProperties": false
+    },
+    "nodeConfigSuggestion": {
+      "type": "object",
+      "required": ["node_id", "surface", "mode", "config_snapshot"],
+      "properties": {
+        "node_id": { "type": "string" },
+        "surface": { "$ref": "#/$defs/productionSurface" },
+        "mode": { "type": "string" },
+        "config_snapshot": {
+          "type": "object",
+          "required": ["id", "nodeId", "nodeVersion", "surface", "mode", "configHash"],
+          "properties": {
+            "id": { "type": "string" },
+            "nodeId": { "type": "string" },
+            "nodeVersion": { "type": "integer", "minimum": 1 },
+            "surface": { "$ref": "#/$defs/productionSurface" },
+            "mode": { "type": "string" },
+            "prompt": { "type": "string" },
+            "referenceAssetIds": { "type": "array", "items": { "type": "string" }, "default": [] },
+            "productEvidenceRefs": { "type": "array", "items": { "type": "object", "additionalProperties": true }, "default": [] },
+            "dynamicFormValues": { "type": "object", "additionalProperties": true },
+            "providerPayloadPreview": { "type": "object", "additionalProperties": true },
+            "configHash": { "type": "string" }
+          },
+          "additionalProperties": true
+        }
+      },
+      "additionalProperties": false
+    },
+    "shotChildNodePlan": {
+      "type": "object",
+      "required": ["shot_id", "node_ids"],
+      "properties": {
+        "shot_id": { "type": "string" },
+        "node_ids": { "type": "array", "items": { "type": "string" } }
+      },
+      "additionalProperties": true
+    },
+    "shotProductUsage": {
+      "type": "object",
+      "required": ["shot_id", "product_asset_ids", "claim_ids", "risk"],
+      "properties": {
+        "shot_id": { "type": "string" },
+        "product_asset_ids": { "type": "array", "items": { "type": "string" } },
+        "claim_ids": { "type": "array", "items": { "type": "string" } },
+        "risk": { "type": "string", "enum": ["low", "medium", "high", "blocked"] }
+      },
+      "additionalProperties": true
+    },
+    "productEvidenceManifest": {
+      "type": "object",
+      "required": ["shot_id", "product_asset_ids", "claim_ids", "evidence_ids", "readiness"],
+      "properties": {
+        "shot_id": { "type": "string" },
+        "product_asset_ids": { "type": "array", "items": { "type": "string" } },
+        "claim_ids": { "type": "array", "items": { "type": "string" } },
+        "evidence_ids": { "type": "array", "items": { "type": "string" } },
+        "readiness": { "type": "string", "enum": ["ready", "ready_with_warnings", "needs_user_review", "insufficient_evidence", "blocked"] }
+      },
+      "additionalProperties": true
+    },
+    "storyBeat": {
+      "type": "object",
+      "required": ["id", "summary"],
+      "properties": {
+        "id": { "type": "string" },
+        "summary": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "warning": {
+      "type": "object",
+      "required": ["code", "message", "severity"],
+      "properties": {
+        "code": { "type": "string" },
+        "message": { "type": "string" },
+        "severity": { "type": "string", "enum": ["info", "warning", "blocker"] },
+        "shot_id": { "type": "string" },
+        "node_id": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "creditAndTimeEstimate": {
+      "type": "object",
+      "required": ["estimated_credits", "estimated_minutes"],
+      "properties": {
+        "estimated_credits": { "type": "number", "minimum": 0 },
+        "estimated_minutes": { "type": "number", "minimum": 0 }
+      },
+      "additionalProperties": true
+    },
+    "budgetSummary": {
+      "type": "object",
+      "required": ["status", "estimated_credits", "requires_credit_confirmation"],
+      "properties": {
+        "status": { "type": "string", "enum": ["within_budget", "near_limit", "over_budget", "unknown"] },
+        "estimated_credits": { "type": "number", "minimum": 0 },
+        "requires_credit_confirmation": { "type": "boolean" }
+      },
+      "additionalProperties": true
+    },
+    "readinessSummary": {
+      "type": "object",
+      "required": ["status", "blocking_issue_count", "warning_count"],
+      "properties": {
+        "status": { "type": "string", "enum": ["ready", "warning", "revise", "block"] },
+        "blocking_issue_count": { "type": "integer", "minimum": 0 },
+        "warning_count": { "type": "integer", "minimum": 0 }
+      },
+      "additionalProperties": true
+    },
+    "approvalItem": {
+      "type": "object",
+      "required": ["id", "label", "status"],
+      "properties": {
+        "id": { "type": "string" },
+        "label": { "type": "string" },
+        "status": { "type": "string", "enum": ["pass", "warning", "block", "pending"] }
+      },
+      "additionalProperties": true
+    },
+    "nodeOutputRef": {
+      "type": "object",
+      "required": ["id", "kind"],
+      "properties": {
+        "id": { "type": "string" },
+        "kind": { "type": "string" },
+        "url": { "type": "string" },
+        "configHash": { "type": "string" }
+      },
+      "additionalProperties": true
+    },
+    "productionSurface": {
+      "type": "string",
+      "enum": ["production_workspace", "production_skill", "production_asset_drawer", "production_qa", "production_gate", "production_review", "production_timeline", "video_shot", "image", "video", "audio", "character_wizard", "audio_asset_wizard", "caption_editor", "storyboard_review", "video_edit", "render_surface", "publish_export"]
+    }
+  }
 }
diff --git a/orchestra/backlog.md b/orchestra/backlog.md
index ce2d847f..01a5267f 100644
--- a/orchestra/backlog.md
+++ b/orchestra/backlog.md
@@ -1,25 +1,9 @@
 # Orchestra Backlog
 
-## Required Before Deep-Implement
+## Expected Deep-Implement Artifacts
+- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/deep_implement_config.json`
+- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`
+- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/usage.md`
 
-Wave 6 resolved the seven Wave 5 planning blockers by converting them into explicit planning contracts and release gates.
-
-Resolved items:
-
-1. `UI/UX Contract` blocks now exist for Production Workspace, React Flow Canvas, Video Shot Workspace, Node Drawer / Node Config Mode, Product Evidence Tray, Handoff/Execution, and Export/Archive/Delete surfaces.
-2. Mandatory browser evidence gate now points to `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`, requires command/screenshot/trace/manual evidence, and treats skipped checks as not-pass.
-3. Responsive matrices now cover 390x844, 768x1024, 1280x800, and 1440x900 with surface-specific behavior.
-4. Accessibility gates now cover keyboard-only journey, focus trap/restore, accessible names, contrast, dark/light readability, reduced motion, and axe/WCAG or documented equivalent.
-5. Canonical E2E journey proof now covers goal -> asset/product evidence -> fixture plan -> edit/reconnect/list fallback -> Image/Video/basic TTS config -> Save to Node -> approve/preview handoff -> zero provider-credit spend -> export preview.
-6. UI copy contract now covers live-disabled/deferred states, planner failed/partial/schema-invalid, provider-disabled, product blocked, invalid edge, stale conflict, permission denied, export success, and lifecycle confirmations.
-7. Visual/token strategy now requires existing Media Studio/shadcn/dashboard semantics, button hierarchy, semantic status colors, focus rings, dark/light readability, and compact operational density.
-
-No unresolved planning blockers remain from Wave 5. During implementation, Packet 10.5 must still produce real browser evidence before Feature 116 can be marked complete.
-
-## Recommended
-
-- Keep Kie Gemini Omni `audio_ids` fail-safe at one ID until provider docs or admin metadata safely prove a higher limit.
-- Confirm exact Feature 116 flag names during code implementation if reusing F84-F90 versus adding narrower controls.
-- Keep batch execution behind a later flag even after run-one-node and run-one-shot ship.
-- Add visual regression snapshots for canvas, Product Evidence Tray, Video Shot workspace, node drawer, disabled states, and conflict states.
-- Add Thai/English screenshot smoke for disabled/error/readiness states.
+## Deferred / Watch Items
+- Browser screenshot automation may depend on whether this repository already has a Playwright command. If unavailable, record manual evidence and residual risk rather than claiming automation passed.
diff --git a/orchestra/contracts.md b/orchestra/contracts.md
index 565672a3..a2333f1c 100644
--- a/orchestra/contracts.md
+++ b/orchestra/contracts.md
@@ -1,95 +1,117 @@
-# Contracts
+# Orchestra Contracts
 
-## Planning Contract
-
-This orchestra run is read-only for production code. It may write only orchestra session artifacts unless the conductor explicitly records a later planning-artifact patch. Subagents must not modify files.
-
-## Wave 1 Contract: Completeness Audit
+## Contract: Feature 116 Shared Production Space
 
 ### Shared Interface
-
-Each subagent returns a Result Report with:
-
-- `status`: `success`, `partial`, or `failed`
-- `files_changed`: empty list unless explicitly authorized
-- `files_inspected`: absolute paths
-- `findings`: blocking gaps, recommended gaps, and strengths
-- `blockers`: missing files or ambiguity that prevents a verdict
-- `quality_gate_results`: commands/checks run or explicitly skipped
-- `verdict`: `ready`, `ready_with_notes`, or `not_ready`
+- Shared module: `apps/web/shared/mediaProduction.ts`
+- Core types:
+  - `ProductionSpace`
+  - `ProductionShot`
+  - `ProductionFlowNode`
+  - `ProductionFlowEdge`
+  - `ProductionNodeConfigSnapshot`
+  - `ProductStoryboardAsset`
+  - `ProductionProductEvidenceManifest`
+- Helper contracts:
+  - `validateProductionSpace(space): ProductionSpaceValidationResult`
+  - `computeProductionSpaceReadiness(space): ProductionSpaceReadiness`
+  - `deriveProductionHandoffPayload(space, target): ProductionHandoffPayload`
+  - `doesProductionNodeConfigChangeInvalidateApproval(before, after): boolean`
 
 ### Ownership Boundaries
-
-| Agent | Read scope | Write scope |
-| --- | --- | --- |
-| Product/spec completeness | `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/**/*.md` | none |
-| Codebase integration | Feature 116 plan files plus SocratiCode-narrowed code touchpoints | none |
-| QA/TDD readiness | Feature 116 plan, section manifest, TDD plan, work packets, review artifacts | none |
+| File | Owner |
+| --- | --- |
+| `/home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.ts` | shared/backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.test.ts` | shared/backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/shared/geminiOmni.ts` | shared/backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/shared/geminiOmni.test.ts` | shared/backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/skills/media-production-storyboard-planner/**` | skills worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/skills/media-production-plan-verifier/**` | skills worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/skills/gemini-omni-video-director/**` | skills worker |
 
 ### Test Boundary
-
-- Product/spec completeness: manual artifact review only.
-- Codebase integration: SocratiCode-first mapping to existing code; no code edits.
-- QA/TDD readiness: deep-plan section checker and whitespace/planning gate recommendations.
+- shared/backend worker: Vitest unit tests for graph validation, readiness, approval invalidation, handoff derivation, product evidence validation, and Gemini Omni constraints.
+- skills worker: schema/fixture validation scripts for planner, verifier, and Gemini Omni director.
 
 ### Impact Boundary
-
 | Affected path/symbol | Handling |
 | --- | --- |
-| `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas` | in-scope-now, read-only audit |
-| `/home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.ts` | quality-gate-only via plan mapping; no edit |
-| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProduction.ts` | quality-gate-only via plan mapping; no edit |
-| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx` | quality-gate-only via plan mapping; no edit |
+| `apps/web/server/routers/mediaProduction.ts` | in-scope later wave |
+| `apps/web/client/src/pages/MediaStudio.tsx` | in-scope later wave |
+| `apps/web/client/src/features/media-production/**` | in-scope later wave |
+| `apps/web/shared/mediaProduction.ts` importers | quality-gate-only via TypeScript and targeted tests |
 
-### Dispatch Metadata
+## Contract: tRPC Production Space API
 
-- writer_count: 0
-- dispatch_mode: parallel
-- ownership_map: read-only disjoint review responsibilities
-- merge_owner: conductor
-- verification_owner: conductor
+### Shared Interface
+- Router: `trpc.mediaProduction`
+- Procedures:
+  - `getSpace({ productionRunId }) -> { space, version, run, latestPlan, latestVerification, latestApproval } | null`
+  - `saveSpace({ productionRunId, expectedVersion?, space, changedFields, idempotencyKey? }) -> { space, version, conflict?: false }`
+  - `saveBrief({ productionRunId, expectedVersion?, brief }) -> { space, version }`
+  - `saveShot({ productionRunId, expectedVersion?, shot }) -> { space, version }`
+  - `saveNodeConfig({ productionRunId, expectedVersion?, nodeId, configSnapshot }) -> { space, version }`
+  - `saveCanvasLayout({ productionRunId, expectedVersion?, layout }) -> { space, version }`
+  - `validateSpace({ productionRunId, space? }) -> ProductionSpaceValidationResult`
+  - `exportSpace({ productionRunId }) -> redacted export JSON`
+- Stale version behavior: throw `TRPCError({ code: "CONFLICT", message: "production_space_stale_version" })` without overwriting.
+
+### Ownership Boundaries
+| File | Owner |
+| --- | --- |
+| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/0183_production_space_node_canvas.sql` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/services/productionSpaceService.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/services/productionLegacyCompatibilityService.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/services/productionCanvasValidationService.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/services/productionNodeConfigService.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/services/productionHandoffProjectionService.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProduction.ts` | backend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaProduction.space.test.ts` | backend worker |
 
-## Wave 5 Contract: End-to-End UI/UX Completeness Audit
+### Test Boundary
+- backend: service and router tests for versioning, tenant/user isolation, stale writes, redacted export, and legacy adapter.
+- frontend: mocked tRPC contract tests only; no direct DB tests.
 
-### Shared Interface
+### Impact Boundary
+| Affected path/symbol | Handling |
+| --- | --- |
+| `mediaProductionRuns` existing router APIs | in-scope-now; existing APIs must remain compatible |
+| `apps/web/server/_core/rootRouter` router registration | quality-gate-only unless compile fails |
+| DB migrations | in-scope-now, no destructive changes |
 
-Each subagent returns a Result Report with:
+## Contract: Production UI Surfaces
 
-- `status`: `success`, `partial`, or `failed`
-- `files_changed`: empty list
-- `files_inspected`: absolute paths
-- `findings`: grouped as blocking, recommended, optional
-- `blockers`: gaps that prevent implementation-ready status
-- `verdict`: `ready`, `ready_with_notes`, or `not_ready`
+### Shared Interface
+- Components under `apps/web/client/src/features/media-production/components`.
+- Hooks under `apps/web/client/src/features/media-production/hooks`.
+- `MediaStudio.tsx` owns tab shell only: `production`, `video-shot`, `image`, `video`, `audio`.
+- UI must call tRPC contract above and never call provider generation during planning/config-only actions.
 
 ### Ownership Boundaries
-
-| Agent | Read scope | Write scope |
-| --- | --- | --- |
-| Product Journey | Feature 116 spec, UX/workflow sections, implementation plan, reviews | none |
-| Visual/UI | Feature 116 UI sections, UI/UX contract references, visual-ui-enhancement rubric | none |
-| System Consistency | Feature 116 codebase touchpoints, router/service/flags/media boundaries, architecture sections | none |
-| QA/TDD | Feature 116 TDD plan, section manifest, work packets, acceptance traceability | none |
+| File | Owner |
+| --- | --- |
+| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx` | frontend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/**` | frontend worker |
+| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/mediaStudioSkillMatching.ts` | frontend worker only if tab type needs `production`/`video-shot` |
+| `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md` | test/e2e worker |
 
 ### Test Boundary
-
-- Product Journey: manual journey/decision/recovery audit.
-- Visual/UI: UI/UX/a11y/responsive planning audit; browser evidence requirements review.
-- System Consistency: SocratiCode-first mapping to current code boundaries; no code edits.
-- QA/TDD: section checker, traceability, test coverage/gate review.
+- frontend: component/hook tests for exclusive Production tab, context asset add/drop equivalence, canvas/list fallback, shot workspace, Save to Node no-credit behavior, lifecycle disabled states.
+- test/e2e: deterministic browser/evidence notes or automated command if repo has E2E support.
 
 ### Impact Boundary
-
 | Affected path/symbol | Handling |
 | --- | --- |
-| `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas` | in-scope-now, read-only audit |
-| Media Studio Production workflow | quality-gate-only via plan/codebase mapping |
-| Feature flags and execution/handoff boundaries | quality-gate-only via plan/codebase mapping |
-
-### Dispatch Metadata
+| Existing Image/Video/Audio tabs | quality-gate-only plus targeted UI assertions |
+| Provider generation controls | in-scope-now; must not render in Production tab |
+| i18n labels | in-scope later wave if existing localization pattern supports it |
 
-- writer_count: 0
-- dispatch_mode: parallel
-- ownership_map: read-only review responsibilities
+## Dispatch Metadata
+- writer_count: max 2 per parallel writer wave
 - merge_owner: conductor
-- verification_owner: conductor
+- verification_owner: conductor + test-qa/security reviewers
+- Wave 1 dispatch_mode: parallel for shared/backend worker and skills worker, disjoint write scopes
+- Wave 2 dispatch_mode: sequential_exception, DB/router/service coupling
+- Wave 3 dispatch_mode: single frontend writer
+- Review/security dispatch_mode: parallel_batch, read-only
diff --git a/orchestra/decisions.md b/orchestra/decisions.md
index b8ba3f55..8df4f845 100644
--- a/orchestra/decisions.md
+++ b/orchestra/decisions.md
@@ -1,29 +1,9 @@
 # Orchestra Decisions
 
-[2026-05-22T08:23:53Z] DECISION: Run Feature 116 completeness review as read-only multi-agent audit.
-  Context: User explicitly requested subagents to inspect completeness of the plan.
-  Alternatives considered: Single-conductor review; rejected because the plan spans product, codebase integration, and QA/TDD concerns.
+[2026-05-22T10:10:00Z] DECISION: Treat Feature 116 as large/high-risk deep-implement with security-gate overlay.
+  Context: The feature modifies tenant-scoped tRPC persistence and user-facing Media Studio workflows.
+  Alternatives considered: Direct implementation without wave contracts was rejected because frontend/backend/schema surfaces are coupled.
 
-[2026-05-22T08:27:32Z] DECISION: Mark Feature 116 plan as not ready for deep-implement without targeted planning patches.
-  Context: Two of three read-only subagents returned `not_ready` due to implementation ambiguity in scheduler integration, handoff architecture, rollout flags, security tests, MVP scope, and migration tests.
-  Alternatives considered: Proceed with watchpoints only; rejected because deep-implement would need to guess codebase integration and security/TDD details.
-
-[2026-05-22T08:39:57Z] DECISION: Patch planning artifacts instead of production code.
-  Context: User requested completing all audit findings; all findings were planning gaps, not runtime bugs.
-  Alternatives considered: Start implementation immediately; rejected because the audited blockers were meant to be closed before deep-implement.
-
-[2026-05-22T08:41:33Z] DECISION: Mark Feature 116 planning package ready with implementation watchpoints.
-  Context: Read-only reviewer verified all prior blockers were addressed and returned no blockers.
-  Alternatives considered: Add another planning review round; rejected because gates passed and remaining notes are implementation-facing watchpoints.
-
-[2026-05-22T08:47:09Z] DECISION: Run deeper UI/UX and end-to-end journey audit before implementation.
-  Context: User explicitly requested subagents to verify system-wide consistency, UI, UX, and whether the plan can take a user to completed work clearly.
-  Alternatives considered: Reuse prior ready_with_notes verdict; rejected because the new request adds stronger UI/UX and end-to-end workflow criteria.
-
-[2026-05-22T08:50:48Z] DECISION: Mark Feature 116 plan not ready for deep-implement until UI/UX gates are patched.
-  Context: Visual/UI and QA/TDD agents found blocking gaps in UI/UX contracts, browser evidence, responsive matrix, accessibility gates, and canonical E2E journey proof.
-  Alternatives considered: Treat findings as implementation-time watchpoints; rejected because the user explicitly asked for confidence that the plan produces a clear, high-quality end-to-end user experience.
-
-[2026-05-22T09:07:01Z] DECISION: Patch all seven Wave 5 UI/UX blockers as planning release gates.
-  Context: User asked to complete all seven findings. The correct scope is planning artifacts, not production code, because the gaps were missing contracts and gates for deep-implement.
-  Alternatives considered: Leave items in backlog for implementation; rejected because deep-implement would still need to guess browser evidence, responsive, accessibility, copy, and token acceptance criteria.
+[2026-05-22T10:10:00Z] DECISION: Continue on protected branch `main`.
+  Context: User explicitly requested autonomous completion without further confirmation; deep-implement policy says protected branch warnings are non-blocking unless branch hygiene was requested.
+  Alternatives considered: Stop for branch creation; not selected.
diff --git a/orchestra/plan.md b/orchestra/plan.md
index d43b75a2..2cbf47d9 100644
--- a/orchestra/plan.md
+++ b/orchestra/plan.md
@@ -1,69 +1,74 @@
 # Orchestra Plan
 
 ## Task
-Review the completeness of the Feature 116 Production Director plan using sub-agents.
+Implement all sections of `specs/feature/116-production-director-node-canvas` using the deep-implement workflow with parallel sub-agents where safe.
 
 ## Classification
-- scope: medium
-- risk: low
-- affected_domains: planning artifacts, product/UX plan, codebase integration map, test/implementation readiness
+- scope: large
+- risk: high
+- affected_domains: frontend Media Studio UI, shared TypeScript contracts, tRPC router/services, Drizzle schema/migrations, skills schemas/fixtures, tests, release evidence
 - estimated_file_count: 30+
-- chosen_route: multi-agent-waves
-- task_summary: Read-only multi-perspective completeness audit of `specs/feature/116-production-director-node-canvas`.
+- chosen_route: deep-implement through multi-agent waves with security-gate overlay
+- task_summary: Build Feature 116 Production Director as a goal-first node canvas workspace with persistence, planning contracts, node config handoff, safeguards, evidence, and release gates.
 - bug_route: false
+- parallel_default: true
+- planned_agents: explorer, backend, frontend, test-qa, security-trpc, security-frontend, reviewer
+- dispatch_preference: parallel
 
 ## Task Classification
-- Scope: medium
-- Risk: low
-- Affected domains: Planning artifacts, Product UX, Architecture/codebase integration, QA/TDD readiness
+- Scope: large
+- Risk: high
+- Affected domains: frontend, backend tRPC, database, shared contracts, skills, tests, UI evidence
 - Estimated file count: 30+
-- Chosen route: multi-agent-waves
+- Chosen route: deep-implement + multi-agent-waves + security-gate
 - Bug route: false
-- Classification notes: The user explicitly requested subagents and the plan spans many planning files, sections, reviews, and implementation touchpoints. This is read-only planning review, so risk is low.
+- Classification notes: The request explicitly asks to deep-implement an existing deep-plan feature with 16 sections. It touches tRPC procedures, tenant-scoped persistence, UI workflows, and feature flags, so security review is required.
 
-## Activation Decision
-- Matched skill: orchestra, explicitly requested.
-- SocratiCode status: active and green for `/home/dev/projects/SmartSpecPro`.
-- Fallback: none needed.
-
-## Impact Preflight
-- Directly reviewed area: `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas`.
-- Directly changed files: orchestra session artifacts only.
-- Dependent files/tests to verify: deep-plan section checker for the planning directory; whitespace check for the planning directory and orchestra artifacts.
-- Risk-sensitive surfaces: planning mentions future tRPC procedures, migrations, tenant/user ownership, provider execution, credit reservation, Storyboard Review, Video Edit, and product evidence gates. No production code is modified in this audit.
-- Confidence: medium-high. SocratiCode found the canonical plan, section reviews, and current implementation touchpoints; subagents will independently check completeness.
+## SocratiCode Preflight
+- status: active, green index, watcher active
+- narrowed surfaces:
+  - `apps/web/shared/mediaProduction.ts`
+  - `apps/web/server/routers/mediaProduction.ts`
+  - `apps/web/drizzle/schema.ts`
+  - `apps/web/client/src/pages/MediaStudio.tsx`
+  - `apps/web/skills/media-production-storyboard-planner/*`
+  - `apps/web/skills/media-production-plan-verifier/*`
+  - `apps/web/skills/gemini-omni-video-director/*`
+- risk-sensitive surfaces: new/modified tRPC procedures, tenant/user ownership checks, Drizzle schema/migration, output export redaction, credit-spend boundaries, node execution/handoff flags.
 
 ## Wave Plan
 
-### Wave 1: Read-only subagent completeness audit
-- Product/spec completeness agent: verify product behavior, UX states, MVP boundary, acceptance traceability, and unresolved decisions.
-- Codebase integration agent: verify that plan touchpoints map to existing code and migration/handoff risks are captured.
-- QA/TDD readiness agent: verify section manifest, implementation packets, TDD coverage, gates, and missing implementation blockers.
+### Wave 0: Discovery And Setup
+- status: in_progress
+- agents: frontend explorer, backend explorer, test/gate explorer
+- output: concrete write scopes and gate commands
 
-### Wave 2: Conductor integration
-- Integrate agent reports, run available planning gates, record findings, and produce final completeness verdict.
+### Wave 1: Shared Contracts And Skill Fixtures
+- dependencies: Wave 0
+- agents: backend/shared worker, skills worker
+- notes: contracts must land before UI and router consume them.
 
-### Wave 3: Planning Patch Implementation
-- Patch Feature 116 planning artifacts to address all audit blockers and recommended watchpoints.
-- Scope: planning docs only; no production code changes.
-- Files updated: Feature 116 spec/deep-plan docs, implementation plan, section files, TDD plan, and final review note.
+### Wave 2: Persistence, Router, And Services
+- dependencies: Wave 1
+- agents: backend worker
+- notes: one writer because schema/router/service changes are coupled and security-sensitive.
 
-### Wave 4: Verification Review
-- Run deep-plan section checker.
-- Run whitespace checks for planning/orchestra files.
-- Dispatch a read-only reviewer to confirm blockers are closed.
+### Wave 3: Production UI Extraction And Canvas
+- dependencies: Wave 1 and Wave 2 contract shapes
+- agents: frontend worker
+- notes: UI consumes shared contracts and router hooks; `MediaStudio.tsx` edits must stay thin.
 
-### Wave 5: End-to-End UI/UX Completeness Audit
-- Product Journey Agent: verify that the plan gets a user from goal creation to finished output with understandable steps, recovery, and decisions.
-- Visual/UI Agent: verify visual hierarchy, component map, UI states, responsive behavior, accessibility, dark/light/token expectations, and browser evidence requirements.
-- System Consistency Agent: verify the UI/UX plan stays consistent with backend/router/services/flags/media-generation boundaries.
-- QA/TDD Agent: verify UI/UX and system acceptance criteria map to concrete tests/gates.
+### Wave 4: Shot Workspace, Handoff, Lifecycle, Evidence
+- dependencies: Wave 2 and Wave 3
+- agents: frontend/backend workers split only when write scopes are disjoint
 
-Route: read-only multi-agent review. No production code changes in this wave.
+### Wave 5: Gates, Reviews, Security, Convergence
+- dependencies: all implementation waves
+- agents: test-qa, security-trpc, security-frontend, reviewer
 
-### Wave 6: UI/UX Planning Completion
-- Patch the seven Wave 5 blockers directly into Feature 116 planning artifacts.
-- Scope: planning artifacts only; no production code changes.
-- Risk: low.
-- Route: conductor-owned direct patch wave, because the work touches shared planning files and does not require parallel writers.
-- Completion criteria: explicit surface UI/UX contracts, browser evidence artifact, responsive matrices, executable accessibility gates, canonical E2E journey proof, UI copy contract, visual/token strategy, and updated deep-implement packets.
+## Parallelization Preflight
+- candidate_agents: frontend, backend, skills, test-qa, security reviewers
+- same_wave_candidates: read-only explorers can run together; shared contracts and skill fixture writer can run together if disjoint; security reviewers can run together after implementation.
+- dependency_edges: shared contracts -> backend/router/UI; backend persistence -> UI save/handoff; UI implementation -> browser evidence; implementation -> security and review gates.
+- dispatch_mode: parallel_batch for read-only and disjoint writers, sequential_exception for schema/router/service DB wave.
+- sequential_reason: DB/schema/router wave is intentionally sequential because a single coherent tenant/version contract must be preserved.
diff --git a/orchestra/progress.md b/orchestra/progress.md
index 4ab16f77..fd413c03 100644
--- a/orchestra/progress.md
+++ b/orchestra/progress.md
@@ -1,170 +1,14 @@
 # Orchestra Progress
 
-[COMPLETE] wave-1-read-only-subagent-audit — Three read-only subagents returned completeness findings.
-[COMPLETE] wave-2-conductor-integration — Integrated findings and ran planning gates.
-[COMPLETE] wave-3-planning-patch-implementation — Patched Feature 116 planning artifacts to close scheduler, handoff, flags, security/TDD, MVP boundary, migration, and planner-failure UX gaps.
-[COMPLETE] wave-4-verification-review — Planning gates passed and read-only reviewer returned `ready_with_notes` with no blockers.
-[COMPLETE] wave-5-end-to-end-ui-ux-completeness-audit — Four read-only agents completed; overall verdict `not_ready` due to UI/UX and browser evidence blockers.
-[COMPLETE] wave-6-ui-ux-planning-completion — Patched Feature 116 planning artifacts to close all seven Wave 5 UI/UX and browser-evidence blockers.
-
-## Fresh Start Notes
-
-- Existing `orchestra/` directory had no `snapshot.json`; archived under `orchestra/archive/`.
-- SocratiCode status was green and used before targeted shell reads.
-- Worktree had unrelated existing dirty files; this audit does not modify them.
-
-## Wave 1 Results
-
-### Product/spec completeness
-- Status: success
-- Verdict: ready_with_notes
-- Blocking gaps: none
-- Watchpoints: MVP audio scope must stay bounded; warning acceptance needs role/permission detail before live execution; planner malformed-output UX state should be explicit.
-
-### Codebase integration
-- Status: success
-- Verdict: not_ready
-- Blocking gaps:
-  1. Execution scheduler integration is not mapped to existing media job submission, credit reservation/refund, cancellation, polling, and provider task lifecycle.
-  2. Video Edit handoff builder boundary is unresolved between current server insertion and client-side `storyboardVideoProject.ts` conversion helper.
-  3. Feature 116 rollout flags/kill switches need exact flag names, precedence, and phase behavior beyond current F84-F90 flags.
-
-### QA/TDD readiness
-- Status: success
-- Verdict: not_ready
-- Blocking gaps:
-  1. Mutating router tests need explicit cross-tenant, cross-user, unauthorized, forbidden, and permission-denied coverage.
-  2. MVP vs full matrix scope conflict remains between Section 12/16 and `implementation-plan.md` Phase 7 audio workflows.
-  3. Migration/backward-compatibility acceptance needs exact backfill, rollback/no-data-loss, and schema-version upgrade tests.
-
-## Quality Gates
-
-- PASS: `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas`
-- PASS: `git diff --check -- specs/feature/116-production-director-node-canvas orchestra`
-- SKIPPED: full app tests, because this was a read-only planning audit with no production code changes.
-
-## Wave 3 Patch Summary
-
-Closed blockers:
-
-1. Execution scheduler integration now maps to existing media generation, task status/cancellation, credit reservation/refund/reconciliation, provider polling/status, and output attachment.
-2. Storyboard Review / Video Edit handoff now requires a server-safe shared builder and forbids importing React/client-only helpers into server routers.
-3. Feature 116 flag truth table and kill-switch precedence are documented.
-4. Mutating router TDD now covers unauthenticated, missing tenant, cross-tenant, cross-user, forbidden/permission-denied, disabled flag, and stale-version cases.
-5. MVP boundary is normalized to Image, Video, and basic TTS adapters only.
-6. Migration/backcompat now includes backfill, rollback/read-safe, no-data-loss, schema-version upgrade, and unknown future schema tests.
-7. Planner failed, partial-output, and schema-invalid UX states are explicit.
-
-Files changed in planning package:
-
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/spec.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-spec.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-research.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-plan.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-plan-tdd.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation-plan.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-01-production-workspace-ux.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-06-node-catalog-and-tool-config.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-09-migration-and-backward-compatibility.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-10-execution-scheduler-and-delivery.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-12-mvp-scope-and-acceptance-traceability.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-14-data-lifecycle-observability-release.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-16-deep-implement-work-packets.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/reviews/final-completeness-review-round-10-2026-05-22.md`
-
-Wave 3 gates:
-
-- PASS: `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas`
-- PASS: `git diff --check -- specs/feature/116-production-director-node-canvas orchestra`
-- PASS: `rg -n "[ \t]+$" specs/feature/116-production-director-node-canvas orchestra -g '!orchestra/archive/**'`
-
-## Wave 4 Review
-
-- Reviewer verdict: `ready_with_notes`
-- Blockers: none
-- Remaining watchpoints:
-  - Confirm exact Feature 116 flag names during code implementation if reusing F84-F90 versus adding narrower controls.
-  - Keep batch execution behind a later flag after run-one-node/run-one-shot ship.
-  - Keep Gemini Omni `audio_ids` fail-safe at one ID until provider docs/admin metadata safely proves a higher limit.
-
-## Wave 5 Scope
-
-User requested a deeper audit that includes UI and UX and verifies the plan is coherent enough to guide users from goal to completed output. SocratiCode status is green.
-
-Advisory worktree state:
-
-- `specs/feature/116-production-director-node-canvas/` is currently untracked in git.
-- Existing orchestra artifacts are modified from prior waves.
-
-## Wave 5 Results
-
-### Product Journey Agent
-- Verdict: ready_with_notes
-- Blockers: none
-- Notes: Journey is coherent from goal to assets, planning, canvas, verification, approval, node config/save, handoff/execution/export. Recommended adding visible journey stepper, clearer disabled/live-deferred copy, non-product blocker recovery copy, export/archive UX copy, and friendly status labels.
-
-### Visual/UI Agent
-- Verdict: not_ready
-- Blockers:
-  1. Missing explicit UI/UX contract per major surface.
-  2. Browser evidence planning is too vague.
-  3. React Flow accessibility and keyboard fallback are under-specified.
-  4. Responsive matrix is incomplete beyond mobile.
-  5. Visual/token/dark-light strategy is absent.
-
-### System Consistency Agent
-- Verdict: ready_with_notes
-- Blockers: none
-- Notes: Plan respects current system boundaries and correctly blocks unsafe live behavior until contracts, flags, persistence, scheduler, and handoff builders exist.
-
-### QA/TDD Agent
-- Verdict: not_ready
-- Blockers:
-  1. Browser evidence is not a required release gate.
-  2. Responsive coverage lacks explicit viewport matrix/evidence.
-  3. Accessibility requirements are not fully executable gates.
-  4. Missing canonical E2E journey proof from goal to output/handoff/no-credit-spend.
-
-## Wave 5 Gates
-
-- PASS: `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas`
-- PASS: `git diff --check -- specs/feature/116-production-director-node-canvas orchestra`
-- SKIPPED: app tests/typecheck/browser automation because this wave was a read-only planning audit.
-
-## Wave 6 Patch Summary
-
-Closed all seven Wave 5 planning blockers:
-
-1. Added explicit UI/UX contracts for Production Workspace, React Flow Canvas, Video Shot Workspace, Node Drawer / Node Config Mode, Product Evidence Tray, Handoff/Execution, and Export/Archive/Delete.
-2. Added mandatory browser evidence gate and created `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`.
-3. Added responsive matrices for 390x844, 768x1024, 1280x800, and 1440x900.
-4. Added executable accessibility gates for keyboard-only journey, focus trap/restore, accessible names, contrast, dark/light readability, reduced motion, and axe/WCAG or documented equivalent.
-5. Added canonical E2E/browser journey proof from goal creation through handoff preview and zero provider-credit spend before generation confirmation.
-6. Added Thai/English UI copy contract for deferred/live-disabled, planner failed/partial/schema-invalid, product blocked, invalid edge, stale conflict, permission denied, export success, and lifecycle confirmations.
-7. Added visual/token strategy based on existing Media Studio/shadcn/dashboard vocabulary.
-
-Files changed in Wave 6:
-
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/spec.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-spec.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-plan.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/claude-plan-tdd.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation-plan.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-01-production-workspace-ux.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-04-react-flow-canvas.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-06-node-catalog-and-tool-config.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-07-video-shot-workspace.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-10-execution-scheduler-and-delivery.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-12-mvp-scope-and-acceptance-traceability.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-14-data-lifecycle-observability-release.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-15-product-image-storyboard-evidence-bridge.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-16-deep-implement-work-packets.md`
-- `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/reviews/final-completeness-review-round-11-ui-ux-2026-05-22.md`
-
-Wave 6 gates:
-
-- PASS: `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas`
-- PASS: `git diff --check -- specs/feature/116-production-director-node-canvas orchestra`
-- PASS: `rg -n "[ \t]+$" specs/feature/116-production-director-node-canvas orchestra -g '!orchestra/archive/**'`
-- SKIPPED: app tests/typecheck/browser automation until implementation, because this wave changes planning artifacts only.
+[IN-PROGRESS] wave-0-discovery-setup — SocratiCode green; deep-implement setup complete; read-only explorers dispatched for frontend, backend, and gates.
+[PENDING] wave-1-shared-contracts-skills — Shared production space contracts and skill fixtures.
+[PENDING] wave-2-backend-persistence-router — Drizzle schema, services, tRPC procedures, and tests.
+[PENDING] wave-3-frontend-workspace-canvas — Production workspace extraction, canvas, assets, shot workspace, node config mode.
+[PENDING] wave-4-handoff-lifecycle-evidence — Handoff payloads, lifecycle controls, UI evidence.
+[PENDING] wave-5-gates-security-review — Typecheck/tests/security/review convergence.
+
+## Notes
+- SocratiCode active: green index, watcher active.
+- Fresh Orchestra session started. Previous stale `orchestra/` contents archived under `orchestra/archive/`.
+- Deep-implement setup reported protected branch `main`; continuing by user instruction and skill autonomy rules.
+- Sub-agent tool available: `multi_agent_v1.spawn_agent`.
diff --git a/orchestra/risk_register.md b/orchestra/risk_register.md
index e6df4771..e6ddadac 100644
--- a/orchestra/risk_register.md
+++ b/orchestra/risk_register.md
@@ -1,6 +1,6 @@
-# Risk Register
+# Orchestra Risk Register
 
-- No security findings in production code. This session was read-only for production code.
-- Planning risk resolved in wave 3: Feature 116 now requires explicit TDD coverage for cross-tenant/cross-user/unauthenticated/forbidden/permission-denied router mutations before implementation completion.
-- Planning risk reopened in wave 5: UI/UX readiness is not yet sufficient for deep-implement because browser evidence, responsive matrix, executable accessibility gates, and canonical E2E journey proof are not mandatory release gates.
-- [RESOLVED 2026-05-22T09:07:01Z] Wave 6 converted the wave 5 UI/UX readiness risk into mandatory planning contracts and release gates. Residual implementation risk remains until Packet 10.5 produces real browser evidence; skipped browser checks are explicitly not pass results.
+## Open Risks
+- New/modified tRPC procedures require security review for auth, tenant isolation, stale version handling, and export redaction.
+- UI must prove planning/config-only flows do not reserve or spend provider-generation credits.
+- DB migration must be additive and non-destructive.
diff --git a/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md b/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
index 2cd17bc1..00ffa56a 100644
--- a/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
+++ b/specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
@@ -11,41 +11,41 @@ Skipped checks are not pass results. If automation is unavailable, mark the rele
 - Build/dev server:
   - Preferred: `npm --prefix apps/web run dev:no-watch`.
   - Browser gate: add or identify a deterministic command such as `npm --prefix apps/web run e2e:production-director`.
-- Date:
+- Date: 2026-05-22
 
 ## Required Canonical Journey
 
 | Step | Required action | Result | Evidence |
 | --- | --- | --- | --- |
-| 1 | Open Media Studio Production and create a new Production project. | pending |  |
-| 2 | Fill goal brief with output type, audience/platform, duration/aspect/language, and constraints. | pending |  |
+| 1 | Open Media Studio Production and create a new Production project. | partial | `ProductionWorkspace` is wired into `/media-studio` as the Production tab; browser automation is not available in repo scripts. |
+| 2 | Fill goal brief with output type, audience/platform, duration/aspect/language, and constraints. | partial | Title and summary controls are wired with accessible labels; extended fields remain in the legacy hidden block and should be promoted in a later UI pass. |
 | 3 | Add one normal asset and one Feature 115 product evidence fixture by click-to-add. | pending |  |
-| 4 | Create a fixture plan canvas. | pending |  |
+| 4 | Create a fixture plan canvas. | partial | Fixture `ProductionSpace` renders in React Flow when no live plan exists. |
 | 5 | Edit/reconnect a dependency through canvas or list fallback, including a non-pointer path. | pending |  |
-| 6 | Open a `video_shot` group in Video Shot workspace and save a shot edit. | pending |  |
+| 6 | Open a `video_shot` group in Video Shot workspace and save a shot edit. | partial | Video Shot tab renders from the same fixture/plan space; save mutations exist server-side but UI save form is not complete. |
 | 7 | Configure one Image node, one Video node, and one basic TTS node. | pending |  |
 | 8 | Use `Save to Node` and prove config/output attaches only to the active node. | pending |  |
 | 9 | Approve the plan after blockers resolve. | pending |  |
-| 10 | Preview Storyboard Review and Video Edit handoff while live handoff is disabled. | pending |  |
-| 11 | Verify zero provider-generation credit reservation/deduction before explicit generation confirmation. | pending |  |
-| 12 | Open Export preview and verify safe manifest exclusions. | pending |  |
+| 10 | Preview Storyboard Review and Video Edit handoff while live handoff is disabled. | partial | `previewHandoff` server procedure derives a non-mutating payload; live UI preview remains follow-up. |
+| 11 | Verify zero provider-generation credit reservation/deduction before explicit generation confirmation. | partial | New Production/Video Shot tabs hide prompt/generate/provider controls; backend additions do not call credit services. |
+| 12 | Open Export preview and verify safe manifest exclusions. | partial | `exportSpace` returns a redacted manifest; browser export UI remains follow-up. |
 
 ## Viewports
 
 | Viewport | Size | Result | Evidence |
 | --- | ---: | --- | --- |
-| mobile | 390x844 | pending |  |
-| tablet | 768x1024 | pending |  |
-| laptop | 1280x800 | pending |  |
-| desktop | 1440x900 | pending |  |
+| mobile | 390x844 | skipped | No Playwright/browser screenshot command exists in this repo. |
+| tablet | 768x1024 | skipped | No Playwright/browser screenshot command exists in this repo. |
+| laptop | 1280x800 | skipped | No Playwright/browser screenshot command exists in this repo. |
+| desktop | 1440x900 | skipped | No Playwright/browser screenshot command exists in this repo. |
 
 ## Surface Coverage
 
 | Surface | Required states | Result | Evidence |
 | --- | --- | --- | --- |
-| Production Workspace | no project, draft, loading, planner failed, partial, schema-invalid, plan ready, verifier blocked, approved, conflict, feature disabled | pending |  |
-| React Flow Canvas | empty, loaded, invalid edge, drawer open, list fallback, partial output, schema invalid, disabled feature | pending |  |
-| Video Shot Workspace | no project, no shot, stale shot, selected shot, locked shot, product blocked, conflict | pending |  |
+| Production Workspace | no project, draft, loading, planner failed, partial, schema-invalid, plan ready, verifier blocked, approved, conflict, feature disabled | partial | Workspace shell, fixture plan, safeguards, and no-credit copy implemented. |
+| React Flow Canvas | empty, loaded, invalid edge, drawer open, list fallback, partial output, schema invalid, disabled feature | partial | Canvas fixture implemented; drawer/list fallback remains follow-up. |
+| Video Shot Workspace | no project, no shot, stale shot, selected shot, locked shot, product blocked, conflict | partial | Selected-shot and empty states implemented; stale/conflict states remain follow-up. |
 | Node Drawer / Config Mode | valid config mode, standalone mode, loading snapshot, stale version, disabled adapter, generated output, permission denied | pending |  |
 | Product Evidence Tray | empty, ready, warning, blocked, claim/evidence link, role change, project/shot conflict | pending |  |
 | Handoff / Execution | preview-only handoff, disabled Storyboard Review, disabled Video Edit, run-one-node confirmation, no-credit-spend before confirmation, progress, failure/retry, cancellation, permission denied | pending |  |
@@ -55,28 +55,28 @@ Skipped checks are not pass results. If automation is unavailable, mark the rele
 
 | Check | Result | Evidence |
 | --- | --- | --- |
-| Console has no new errors | pending |  |
-| Primary keyboard path works | pending |  |
-| Text does not overflow or overlap | pending |  |
+| Console has no new errors | skipped | No browser automation available. |
+| Primary keyboard path works | partial | Buttons/inputs are reachable by native controls; canvas/list keyboard fallback remains follow-up. |
+| Text does not overflow or overlap | skipped | No screenshot verification available. |
 | Loading, empty, error, partial, disabled, conflict, success states render | pending |  |
 | Disabled, focus, hover, selected states are visible | pending |  |
 | Dark/light mode remains readable | pending |  |
-| Accessible names/labels are present for icon-only controls and status badges | pending |  |
+| Accessible names/labels are present for icon-only controls and status badges | partial | Production title/goal inputs now have `aria-label`; broader icon-only control sweep remains follow-up. |
 | Drawer/dialog focus trap and focus return work | pending |  |
 | Reduced-motion behavior is respected | pending |  |
 | Axe/WCAG or documented manual accessibility equivalent completed | pending |  |
-| Provider-generation credits are not reserved during planning/config-only flow | pending |  |
+| Provider-generation credits are not reserved during planning/config-only flow | partial | New Feature 116 backend/UI paths do not invoke provider generation or credit services before explicit generation. |
 
 ## Commands
 
-- Typecheck/lint:
-- Unit/UI tests:
-- Browser/screenshot:
-- Manual notes:
+- Typecheck/lint: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` passed; no lint script exists.
+- Unit/UI tests: `npm --prefix apps/web test -- shared/mediaProduction.test.ts shared/geminiOmni.test.ts` passed.
+- Browser/screenshot: skipped because no Playwright dependency/config/script or `e2e:production-director` command exists.
+- Manual notes: Production/Video Shot now hide prompt/generate/settings provider controls by conditional render; no live browser screenshot was captured.
 
 ## Required Artifacts
 
-- Playwright/browser report:
+- Playwright/browser report: skipped, unavailable in repo.
 - Mobile screenshots:
 - Tablet screenshots:
 - Laptop screenshots:
@@ -87,6 +87,6 @@ Skipped checks are not pass results. If automation is unavailable, mark the rele
 
 ## Residual Risk
 
-- Skipped checks and why:
-- Known limitations:
-- Follow-up owner:
+- Skipped checks and why: Browser/screenshot/a11y automation skipped because no deterministic browser test command exists.
+- Known limitations: Node drawer, full list fallback, product evidence tray UI, live export UI, and browser screenshots are not complete release evidence yet.
+- Follow-up owner: Feature 116 UI/e2e follow-up packet.
