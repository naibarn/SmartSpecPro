diff --git a/apps/web/client/src/pages/PresentationEditor.tsx b/apps/web/client/src/pages/PresentationEditor.tsx
index a7c1a40..8d0809f 100644
--- a/apps/web/client/src/pages/PresentationEditor.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.tsx
@@ -691,7 +691,7 @@ export default function PresentationEditor() {
   const [playbackPaused, setPlaybackPaused] = useState(false);
   const [exportMessage, setExportMessage] = useState<string>("");
   const [exportWarnings, setExportWarnings] = useState<PresentationExportWarning[]>([]);
-  const [lastExportId, setLastExportId] = useState<string | null>(null);
+  const [lastExportId, setLastExportId] = useState<number | null>(null);
   const playbackOverlayRef = useRef<HTMLDivElement | null>(null);
   const playbackStageHostRef = useRef<HTMLDivElement | null>(null);
   const [playbackStageHostSize, setPlaybackStageHostSize] = useState({ width: 0, height: 0 });
@@ -746,7 +746,7 @@ export default function PresentationEditor() {
       : [];
   }, [versionHistoryQuery.data]);
   const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
-    { exportId: lastExportId || "" },
+    { exportId: lastExportId ?? 0 },
     {
       enabled: Boolean(lastExportId),
       refetchInterval: 5000,
diff --git a/apps/web/server/routers/presentation.ts b/apps/web/server/routers/presentation.ts
index 9c75dd0..2b07394 100644
--- a/apps/web/server/routers/presentation.ts
+++ b/apps/web/server/routers/presentation.ts
@@ -288,7 +288,7 @@ export const presentationRouter = router({
 
   getExportStatus: protectedProcedure
     .input(z.object({
-      exportId: z.string().min(1).max(128),
+      exportId: z.number().int().positive(),
     }))
     .query(async ({ input, ctx }) => {
       try {
diff --git a/apps/web/server/services/presentationPlaybackExport.ts b/apps/web/server/services/presentationPlaybackExport.ts
index 048dcc2..7ecaacb 100644
--- a/apps/web/server/services/presentationPlaybackExport.ts
+++ b/apps/web/server/services/presentationPlaybackExport.ts
@@ -45,8 +45,7 @@ const MAX_THROTTLE_KEYS = 5_000;
 const MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY = 120;
 
 interface PresentationExportStateRecord {
-  exportId: string;
-  jobId: string;
+  exportId: number;
   createdAtMs: number;
 }
 
@@ -102,8 +101,8 @@ export interface TriggerPresentationExportInput {
 }
 
 const dedupeRegistry = new Map<string, PresentationExportStateRecord>();
-const statusRegistry = new Map<string, PresentationExportStatusStateRecord>();
-const resultRegistry = new Map<string, PresentationExportResultStateRecord>();
+const statusRegistry = new Map<number, PresentationExportStatusStateRecord>();
+const resultRegistry = new Map<number, PresentationExportResultStateRecord>();
 const userWindowRegistry = new Map<string, number[]>();
 const deckWindowRegistry = new Map<string, number[]>();
 
@@ -111,6 +110,12 @@ function nextId(prefix: string): string {
   return `${prefix}-${crypto.randomUUID()}`;
 }
 
+let exportIdSequence = 0;
+function nextExportId(): number {
+  exportIdSequence += 1;
+  return exportIdSequence;
+}
+
 function pruneWindow(entries: number[], nowMs: number, windowMs: number): number[] {
   const floor = nowMs - windowMs;
   return entries.filter((ts) => ts > floor);
@@ -451,15 +456,13 @@ export async function triggerPresentationExport(
     ensureRenderSchemaAccepted(renderSpec, resolved.acceptedRenderSchemaVersions);
 
     const queued = await resolved.enqueueExportJob(renderSpec, input.format);
-    const exportId = nextId("presentation-export");
+    const exportId = nextExportId();
     const status = presentationExportStatusResultSchema.parse({
       schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
       exportId,
-      jobId: queued.jobId,
       status: "queued",
       format: input.format,
       updatedAt: new Date(nowMs),
-      message: "Export queued",
       warnings: renderSpec.warnings,
     });
     statusRegistry.set(exportId, {
@@ -472,7 +475,6 @@ export async function triggerPresentationExport(
     });
     dedupeRegistry.set(dedupeKey, {
       exportId,
-      jobId: queued.jobId,
       createdAtMs: nowMs,
     });
 
@@ -489,7 +491,6 @@ export async function triggerPresentationExport(
     const result = presentationExportResultSchema.parse({
       schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
       exportId,
-      jobId: queued.jobId,
       deckId: input.deckId,
       format: input.format,
       deduped: false,
@@ -531,7 +532,7 @@ export async function triggerPresentationExport(
 }
 
 export function getPresentationExportStatus(
-  exportId: string,
+  exportId: number,
   actor?: PresentationActor,
 ): PresentationExportStatusResult {
   const defaults = getDefaultStateOptions(Date.now());
@@ -560,4 +561,5 @@ export function resetPresentationExportStateForTests(): void {
   resultRegistry.clear();
   userWindowRegistry.clear();
   deckWindowRegistry.clear();
+  exportIdSequence = 0;
 }
diff --git a/apps/web/shared/presentation/contracts.test.ts b/apps/web/shared/presentation/contracts.test.ts
index f0a0bed..16d0d8f 100644
--- a/apps/web/shared/presentation/contracts.test.ts
+++ b/apps/web/shared/presentation/contracts.test.ts
@@ -2,7 +2,19 @@ import fs from "fs";
 import path from "path";
 import { describe, expect, it } from "vitest";
 
-import { presentationSlideContentSchema } from "./contracts";
+import {
+  audioTrackInputSchema,
+  presentationExportStatusResultSchema,
+  presentationRenderSpecSchema,
+  presentationSlideContentSchema,
+  projectAudioTrackInputSchema,
+  resolvedAudioTrackSchema,
+  resolvedProjectAudioTrackSchema,
+} from "./contracts";
+import {
+  PRESENTATION_EXPORT_SCHEMA_VERSION,
+  PRESENTATION_RENDER_SCHEMA_VERSION,
+} from "./constants";
 import { normalizePresentationSlideContent } from "./normalizers";
 import { validatePresentationSlideContent } from "./validators";
 
@@ -50,3 +62,122 @@ describe("presentation canvas v2 contracts", () => {
     }
   });
 });
+
+describe("audio track and export contract schemas", () => {
+  it("audioTrackInputSchema parses valid input with libraryItemId", () => {
+    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.8, startAtMs: 0 });
+    expect(result.success).toBe(true);
+  });
+
+  it("audioTrackInputSchema rejects volume > 1.0", () => {
+    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 1.5, startAtMs: 0 });
+    expect(result.success).toBe(false);
+  });
+
+  it("audioTrackInputSchema rejects negative libraryItemId", () => {
+    const result = audioTrackInputSchema.safeParse({ libraryItemId: -1, volume: 0.5, startAtMs: 0 });
+    expect(result.success).toBe(false);
+  });
+
+  it("audioTrackInputSchema accepts null endAtMs (play to end)", () => {
+    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, startAtMs: 0, endAtMs: null });
+    expect(result.success).toBe(true);
+  });
+
+  it("projectAudioTrackInputSchema parses with loop and null fadeOutMs", () => {
+    const result = projectAudioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, loop: true, fadeOutMs: null });
+    expect(result.success).toBe(true);
+  });
+
+  it("resolvedAudioTrackSchema accepts url field", () => {
+    const result = resolvedAudioTrackSchema.safeParse({ url: "https://example.com/audio.mp3", volume: 0.8, startAtMs: 0 });
+    expect(result.success).toBe(true);
+  });
+
+  it("resolvedAudioTrackSchema rejects input without url (libraryItemId not accepted)", () => {
+    const result = resolvedAudioTrackSchema.safeParse({ libraryItemId: 1, volume: 0.8, startAtMs: 0 });
+    expect(result.success).toBe(false);
+  });
+
+  it("resolvedProjectAudioTrackSchema parses with url, loop, and null fadeOutMs", () => {
+    const result = resolvedProjectAudioTrackSchema.safeParse({
+      url: "https://cdn.example.com/bg.mp3",
+      volume: 0.3,
+      loop: true,
+      fadeOutMs: null,
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("presentationExportStatusResultSchema parses exportId as number", () => {
+    const result = presentationExportStatusResultSchema.safeParse({
+      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
+      exportId: 42,
+      status: "queued",
+      format: "png",
+      updatedAt: new Date(),
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("presentationExportStatusResultSchema rejects exportId as string", () => {
+    const result = presentationExportStatusResultSchema.safeParse({
+      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
+      exportId: "abc",
+      status: "queued",
+      format: "png",
+      updatedAt: new Date(),
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("presentationExportStatusResultSchema accepts status cancelled", () => {
+    const result = presentationExportStatusResultSchema.safeParse({
+      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
+      exportId: 7,
+      status: "cancelled",
+      format: "mp4",
+      updatedAt: new Date(),
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("presentationRenderSpecSchema accepts format jpg", () => {
+    const result = presentationRenderSpecSchema.safeParse({
+      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
+      deckId: 1,
+      format: "jpg",
+      width: 1920,
+      height: 1080,
+      fps: 30,
+      slides: [],
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("presentationRenderSpecSchema accepts format pdf", () => {
+    const result = presentationRenderSpecSchema.safeParse({
+      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
+      deckId: 1,
+      format: "pdf",
+      width: 1920,
+      height: 1080,
+      fps: 30,
+      slides: [],
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("presentationRenderSpecSchema rejects unknown format", () => {
+    const result = presentationRenderSpecSchema.safeParse({
+      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
+      deckId: 1,
+      format: "docx",
+      width: 1920,
+      height: 1080,
+      fps: 30,
+      slides: [],
+    });
+    expect(result.success).toBe(false);
+  });
+});
diff --git a/apps/web/shared/presentation/contracts.ts b/apps/web/shared/presentation/contracts.ts
index 923cc40..a3d29bd 100644
--- a/apps/web/shared/presentation/contracts.ts
+++ b/apps/web/shared/presentation/contracts.ts
@@ -250,6 +250,40 @@ export const presentationLineElementSchema = z.object({
   strokeWidth: z.number().finite().min(0).max(1_000),
 }).strict();
 
+// === Audio Track Schemas ===
+
+/** Validates tRPC input when a user attaches audio to a slide (references library item, URL resolved server-side) */
+export const audioTrackInputSchema = z.object({
+  libraryItemId: z.number().int().positive(),
+  volume: z.number().finite().min(0).max(1),
+  startAtMs: z.number().int().min(0),
+  endAtMs: z.number().int().min(0).nullable().optional(),
+});
+
+/** Resolved per-slide audio track sent to Python in the render spec (libraryItemId replaced by presigned URL) */
+export const resolvedAudioTrackSchema = z.object({
+  url: z.string().url(),
+  volume: z.number().finite().min(0).max(1),
+  startAtMs: z.number().int().min(0),
+  endAtMs: z.number().int().min(0).nullable().optional(),
+});
+
+/** Validates tRPC input for deck-level background audio */
+export const projectAudioTrackInputSchema = z.object({
+  libraryItemId: z.number().int().positive(),
+  volume: z.number().finite().min(0).max(1),
+  loop: z.boolean(),
+  fadeOutMs: z.number().int().min(0).nullable().optional(),
+});
+
+/** Resolved deck-level audio track sent to Python in the render spec */
+export const resolvedProjectAudioTrackSchema = z.object({
+  url: z.string().url(),
+  volume: z.number().finite().min(0).max(1),
+  loop: z.boolean(),
+  fadeOutMs: z.number().int().min(0).nullable().optional(),
+});
+
 export const presentationSlideElementSchema = z.discriminatedUnion("type", [
   presentationTextElementSchema,
   presentationImageElementSchema,
@@ -271,6 +305,8 @@ export const presentationSlideshowSlideSchema = z.object({
   title: z.string().min(1).max(255),
   durationMs: z.number().int().min(250).max(120_000),
   transition: presentationTransitionSchema,
+  /** Resolved audio track for this slide. Only present in getPlayDeck response, not in export flows. */
+  audioTrack: resolvedAudioTrackSchema.nullable().optional(),
 });
 
 export const presentationSlideshowPayloadSchema = z.object({
@@ -278,16 +314,23 @@ export const presentationSlideshowPayloadSchema = z.object({
   deckId: z.number().int().positive(),
   generatedAt: z.coerce.date(),
   slides: z.array(presentationSlideshowSlideSchema).max(500),
+  /** Resolved deck-level audio. Only present in getPlayDeck response. */
+  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
 });
 
 export const presentationRenderSpecSchema = z.object({
   schemaVersion: z.literal(PRESENTATION_RENDER_SCHEMA_VERSION),
   deckId: z.number().int().positive(),
-  format: z.enum(["png", "mp4"]),
+  /** Export format — png and jpg produce zip archives of per-slide images */
+  format: z.enum(["png", "jpg", "pdf", "mp4"]),
   width: z.number().int().positive(),
   height: z.number().int().positive(),
   fps: z.number().int().positive(),
+  /** Quality preset — only meaningful for mp4 and jpg formats */
+  quality: z.enum(["draft", "standard", "high"]).optional(),
   slides: z.array(presentationSlideshowSlideSchema).max(500),
+  /** Resolved deck-level audio for mixing into the exported video */
+  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
   warnings: presentationExportWarningsSchema.default([]),
 });
 
@@ -296,14 +339,15 @@ export const presentationExportStatusSchema = z.enum([
   "processing",
   "done",
   "error",
+  "cancelled",
 ]);
 
 export const presentationExportResultSchema = z.object({
   schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
-  exportId: z.string().min(1).max(128),
-  jobId: z.string().min(1).max(128),
+  /** DB primary key of the presentation_exports row */
+  exportId: z.number().int().positive(),
   deckId: z.number().int().positive(),
-  format: z.enum(["png", "mp4"]),
+  format: z.enum(["png", "jpg", "pdf", "mp4"]),
   deduped: z.boolean(),
   status: presentationExportStatusSchema,
   message: z.string().min(1).max(400).optional(),
@@ -313,12 +357,18 @@ export const presentationExportResultSchema = z.object({
 
 export const presentationExportStatusResultSchema = z.object({
   schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
-  exportId: z.string().min(1).max(128),
-  jobId: z.string().min(1).max(128),
+  exportId: z.number().int().positive(),
   status: presentationExportStatusSchema,
-  format: z.enum(["png", "mp4"]),
+  format: z.enum(["png", "jpg", "pdf", "mp4"]),
+  /** Progress percentage 0–100 */
+  progressPct: z.number().int().min(0).max(100).default(0),
+  /** Human-readable current stage, e.g. "Rendering slide 3 of 10" */
+  stage: z.string().max(120).nullable().optional(),
+  /** Presigned download URL. Only present when status is "done". */
+  downloadUrl: z.string().url().nullable().optional(),
+  /** Error description. Only present when status is "error". */
+  errorMessage: z.string().max(1000).nullable().optional(),
   updatedAt: z.coerce.date(),
-  message: z.string().min(1).max(400).optional(),
   warnings: presentationExportWarningsSchema.default([]),
 });
 
@@ -340,6 +390,13 @@ export type PresentationExportResult = z.infer<typeof presentationExportResultSc
 export type PresentationExportStatusResult = z.infer<typeof presentationExportStatusResultSchema>;
 export type { PresentationExportWarning };
 
+export const presentationPlayDeckPayloadSchema = presentationSlideshowPayloadSchema;
+export type AudioTrackInput = z.infer<typeof audioTrackInputSchema>;
+export type ResolvedAudioTrack = z.infer<typeof resolvedAudioTrackSchema>;
+export type ProjectAudioTrackInput = z.infer<typeof projectAudioTrackInputSchema>;
+export type ResolvedProjectAudioTrack = z.infer<typeof resolvedProjectAudioTrackSchema>;
+export type PresentationPlayDeckPayload = z.infer<typeof presentationPlayDeckPayloadSchema>;
+
 export function isPresentationItemType(itemType: string): boolean {
   return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
 }
