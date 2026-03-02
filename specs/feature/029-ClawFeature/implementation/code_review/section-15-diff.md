diff --git a/apps/web/client/src/components/library/DocumentGridList.tsx b/apps/web/client/src/components/library/DocumentGridList.tsx
index 5b98fb1..68398b4 100644
--- a/apps/web/client/src/components/library/DocumentGridList.tsx
+++ b/apps/web/client/src/components/library/DocumentGridList.tsx
@@ -2,6 +2,7 @@ import type { KeyboardEvent } from "react";
 
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
+import { Checkbox } from "@/components/ui/checkbox";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { resolveDocumentPreviewType } from "@/lib/documentManagementUi";
 import { cn } from "@/lib/utils";
@@ -10,6 +11,7 @@ import { getDocumentAccessLabel, type DocumentLibraryItem } from "@/lib/document
 import {
   FileText,
   FileType2,
+  Folder,
   Image as ImageIcon,
   Loader2,
   Music2,
@@ -27,6 +29,10 @@ interface DocumentGridListProps {
   onSelect: (item: DocumentLibraryItem) => void;
   onOpen?: (item: DocumentLibraryItem) => void;
   onDelete?: (item: DocumentLibraryItem) => void;
+  onFolderOpen?: (item: DocumentLibraryItem) => void;
+  /** IDs currently selected for multi-select batch operations */
+  selectedIds?: Set<number>;
+  onSelectionChange?: (ids: Set<number>) => void;
 }
 
 export default function DocumentGridList({
@@ -38,14 +44,32 @@ export default function DocumentGridList({
   onSelect,
   onOpen,
   onDelete,
+  onFolderOpen,
+  selectedIds,
+  onSelectionChange,
 }: DocumentGridListProps) {
-  function handleCardKeyDown(
-    event: KeyboardEvent<HTMLDivElement>,
-    item: DocumentLibraryItem,
-  ) {
+  const isMultiSelectMode = Boolean(onSelectionChange);
+
+  function toggleSelection(id: number, event: React.MouseEvent | React.KeyboardEvent) {
+    event.stopPropagation();
+    if (!onSelectionChange || !selectedIds) return;
+    const next = new Set(selectedIds);
+    if (next.has(id)) {
+      next.delete(id);
+    } else {
+      next.add(id);
+    }
+    onSelectionChange(next);
+  }
+
+  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>, item: DocumentLibraryItem) {
     if (event.key === "Enter" || event.key === " ") {
       event.preventDefault();
-      onSelect(item);
+      if (item.item_type === "folder" && onFolderOpen) {
+        onFolderOpen(item);
+      } else {
+        onSelect(item);
+      }
     }
   }
 
@@ -79,6 +103,14 @@ export default function DocumentGridList({
   }
 
   function renderCardPreview(item: DocumentLibraryItem) {
+    if (item.item_type === "folder") {
+      return (
+        <div className="flex h-24 w-32 items-center justify-center rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 lg:h-28 lg:w-40">
+          <Folder className="h-10 w-10 text-amber-400" />
+        </div>
+      );
+    }
+
     const previewType = resolveDocumentPreviewType(item);
     const imageLikeUrl = item.thumbnail_url || item.source_url;
 
@@ -157,20 +189,42 @@ export default function DocumentGridList({
     <ScrollArea className={cn("h-full min-h-0 rounded-lg", className)}>
       <div className="space-y-3 pr-1.5">
         {items.map((item) => {
+          const isFolder = item.item_type === "folder";
+          const isChecked = selectedIds?.has(item.id) ?? false;
           const statusMeta = getLibraryStatusMeta(item.status);
+
           return (
             <div
               key={item.id}
               role="button"
               tabIndex={0}
-              onClick={() => onSelect(item)}
+              onClick={() => {
+                if (isFolder && onFolderOpen) {
+                  onFolderOpen(item);
+                } else {
+                  onSelect(item);
+                }
+              }}
               onKeyDown={(event) => handleCardKeyDown(event, item)}
               className={cn(
                 "cursor-pointer rounded-2xl border bg-white/95 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30",
-                selectedId === item.id ? "border-sky-300 bg-sky-50/70" : "border-slate-200",
+                selectedId === item.id && !isFolder ? "border-sky-300 bg-sky-50/70" : "border-slate-200",
+                isChecked && "border-sky-400 bg-sky-50/50 ring-1 ring-sky-300",
+                isFolder && "border-amber-200 bg-amber-50/40 hover:border-amber-300",
               )}
             >
               <div className="flex gap-3">
+                {/* Checkbox for multi-select — always reserve space when mode is active */}
+                {isMultiSelectMode && (
+                  <div className="flex shrink-0 items-start pt-1">
+                    <Checkbox
+                      checked={isChecked}
+                      onClick={(e) => toggleSelection(item.id, e)}
+                      aria-label={`Select ${item.title}`}
+                    />
+                  </div>
+                )}
+
                 <div className="shrink-0">
                   {renderCardPreview(item)}
                 </div>
@@ -179,37 +233,42 @@ export default function DocumentGridList({
                   <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3">
                     <div className="min-w-0 space-y-1.5">
                       <div className="line-clamp-2 text-[15px] font-semibold leading-5 text-slate-900" title={item.title}>
+                        {isFolder && <Folder className="mr-1.5 inline h-4 w-4 text-amber-500" />}
                         {item.title}
                       </div>
                       <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                         <FileText className="h-3.5 w-3.5" />
-                        <span className="uppercase tracking-wide">{item.item_type}</span>
-                      </div>
-                      <div className="flex flex-wrap items-center gap-2">
-                        <Badge variant="outline" className="text-xs">
-                          {getDocumentAccessLabel(item.access_source)}
-                        </Badge>
+                        <span className="uppercase tracking-wide">{isFolder ? "Folder" : item.item_type}</span>
                       </div>
+                      {!isFolder && (
+                        <div className="flex flex-wrap items-center gap-2">
+                          <Badge variant="outline" className="text-xs">
+                            {getDocumentAccessLabel(item.access_source)}
+                          </Badge>
+                        </div>
+                      )}
                     </div>
 
                     <div className="flex items-start justify-between gap-2 sm:flex-col sm:items-end">
-                      <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
+                      {!isFolder && <Badge className={statusMeta.className}>{statusMeta.label}</Badge>}
                       <div className="flex items-center gap-1.5">
-                        <Button
-                          size="sm"
-                          variant="outline"
-                          className="h-8 rounded-lg px-3"
-                          onClick={(event) => {
-                            event.stopPropagation();
-                            if (onOpen) {
-                              onOpen(item);
-                              return;
-                            }
-                            onSelect(item);
-                          }}
-                        >
-                          Open
-                        </Button>
+                        {!isFolder && (
+                          <Button
+                            size="sm"
+                            variant="outline"
+                            className="h-8 rounded-lg px-3"
+                            onClick={(event) => {
+                              event.stopPropagation();
+                              if (onOpen) {
+                                onOpen(item);
+                                return;
+                              }
+                              onSelect(item);
+                            }}
+                          >
+                            Open
+                          </Button>
+                        )}
                         {onDelete && (
                           <Button
                             size="sm"
@@ -228,13 +287,15 @@ export default function DocumentGridList({
                     </div>
                   </div>
 
-                  <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
-                    Updated:
-                    {" "}
-                    <span className="font-medium text-slate-700">
-                      {new Date(item.updated_at).toLocaleString()}
-                    </span>
-                  </div>
+                  {!isFolder && (
+                    <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
+                      Updated:
+                      {" "}
+                      <span className="font-medium text-slate-700">
+                        {new Date(item.updated_at).toLocaleString()}
+                      </span>
+                    </div>
+                  )}
                 </div>
               </div>
             </div>
diff --git a/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx b/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx
index 374f0f7..b3e982a 100644
--- a/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx
+++ b/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx
@@ -225,4 +225,18 @@ describe("SlideAudioPanel", () => {
     // AudioPickerDialog is now open, useQuery is called with audio filter
     expect(capturedInput?.filters?.itemType).toBe("audio");
   });
+
+  it("end trim input unlocks when Play to end is turned off", () => {
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        slideAudioTrack={SLIDE_AUDIO_TRACK}
+      />,
+    );
+
+    const endInput = screen.getByLabelText("slide-audio-trim-end-seconds") as HTMLInputElement;
+    expect(endInput.disabled).toBe(true);
+    fireEvent.click(screen.getByRole("switch", { name: /play to end/i }));
+    expect(endInput.disabled).toBe(false);
+  });
 });
diff --git a/apps/web/client/src/components/presentation/SlideAudioPanel.tsx b/apps/web/client/src/components/presentation/SlideAudioPanel.tsx
index fd01e33..026fb39 100644
--- a/apps/web/client/src/components/presentation/SlideAudioPanel.tsx
+++ b/apps/web/client/src/components/presentation/SlideAudioPanel.tsx
@@ -57,6 +57,19 @@ function formatDuration(seconds: number): string {
   return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
 }
 
+const AUDIO_SLIDER_CLASS = [
+  "h-6",
+  "[&_[data-slot=slider-track]]:h-2",
+  "[&_[data-slot=slider-track]]:rounded-full",
+  "[&_[data-slot=slider-track]]:border",
+  "[&_[data-slot=slider-track]]:border-slate-400/80",
+  "[&_[data-slot=slider-track]]:bg-slate-200",
+  "[&_[data-slot=slider-range]]:bg-sky-500",
+  "[&_[data-slot=slider-thumb]]:size-5",
+  "[&_[data-slot=slider-thumb]]:border-sky-500",
+  "[&_[data-slot=slider-thumb]]:bg-white",
+].join(" ");
+
 function extractDurationSeconds(metadata: unknown): number | null {
   if (!metadata || typeof metadata !== "object") {
     return null;
@@ -141,7 +154,7 @@ function AudioTrimTimeline({
   const playDuration = Math.max(0, boundedEnd - boundedStart);
 
   return (
-    <div className="space-y-2 rounded-md border border-slate-200 p-2">
+    <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
       <div className="flex items-center justify-between">
         <Label className="text-xs font-medium">Trim</Label>
         <span className="text-[11px] text-muted-foreground">
@@ -152,20 +165,59 @@ function AudioTrimTimeline({
         min={0}
         max={maxSec}
         step={0.1}
-        value={playToEnd ? [boundedStart] : [boundedStart, boundedEnd]}
+        className={AUDIO_SLIDER_CLASS}
+        value={[boundedStart, boundedEnd]}
         onValueChange={(values) => {
-          if (!values.length) return;
+          if (values.length < 2) return;
+          const nextStart = clamp(values[0], 0, maxSec);
+          const nextEnd = clamp(values[1], nextStart, maxSec);
           if (playToEnd) {
-            onStartSecChange(clamp(values[0], 0, maxSec));
+            onStartSecChange(nextStart);
+            onEndSecChange(maxSec);
             return;
           }
-          const nextStart = clamp(values[0], 0, maxSec);
-          const nextEnd = clamp(values[1] ?? values[0], nextStart, maxSec);
           onStartSecChange(nextStart);
           onEndSecChange(nextEnd);
         }}
         aria-label={`${idPrefix}-trim-slider`}
       />
+      <div className="grid grid-cols-2 gap-2">
+        <div className="space-y-1">
+          <Label className="text-[11px] text-muted-foreground">Start (s)</Label>
+          <Input
+            type="number"
+            min={0}
+            max={maxSec}
+            step={0.1}
+            value={Number.isFinite(boundedStart) ? boundedStart.toFixed(1) : "0.0"}
+            onChange={(event) => {
+              const parsed = Number.parseFloat(event.target.value);
+              if (!Number.isFinite(parsed)) return;
+              onStartSecChange(clamp(parsed, 0, maxSec));
+            }}
+            className="h-7 bg-white text-xs"
+            aria-label={`${idPrefix}-trim-start-seconds`}
+          />
+        </div>
+        <div className="space-y-1">
+          <Label className="text-[11px] text-muted-foreground">End (s)</Label>
+          <Input
+            type="number"
+            min={boundedStart}
+            max={maxSec}
+            step={0.1}
+            value={Number.isFinite(boundedEnd) ? boundedEnd.toFixed(1) : "0.0"}
+            onChange={(event) => {
+              const parsed = Number.parseFloat(event.target.value);
+              if (!Number.isFinite(parsed) || playToEnd) return;
+              onEndSecChange(clamp(parsed, boundedStart, maxSec));
+            }}
+            disabled={playToEnd}
+            className="h-7 bg-white text-xs"
+            aria-label={`${idPrefix}-trim-end-seconds`}
+          />
+        </div>
+      </div>
       <div className="flex items-center gap-2">
         <Switch
           checked={playToEnd}
@@ -176,6 +228,11 @@ function AudioTrimTimeline({
           Play to end
         </Label>
       </div>
+      {playToEnd ? (
+        <p className="text-[11px] text-slate-500">
+          End trim is locked to audio end while Play to end is enabled.
+        </p>
+      ) : null}
       <div className="grid grid-cols-3 gap-1 text-[11px]">
         <span className="rounded bg-slate-100 px-1.5 py-0.5">Start {formatDuration(boundedStart)}</span>
         <span className="rounded bg-slate-100 px-1.5 py-0.5">End {formatDuration(boundedEnd)}</span>
@@ -529,6 +586,36 @@ export function SlideAudioPanel({
     return Math.round(deckEndSec * 1000);
   }
 
+  function handleSlidePlayToEndChange(next: boolean) {
+    setSlidePlayToEnd(next);
+    if (!next) {
+      setSlideEndSec((current) => {
+        const durationFallback = slideAudioDurationSec ?? 0;
+        const minEnd = slideStartSec + 0.5;
+        return Math.max(current, durationFallback, minEnd);
+      });
+      return;
+    }
+    if (slideAudioDurationSec != null) {
+      setSlideEndSec(slideAudioDurationSec);
+    }
+  }
+
+  function handleDeckPlayToEndChange(next: boolean) {
+    setDeckPlayToEnd(next);
+    if (!next) {
+      setDeckEndSec((current) => {
+        const durationFallback = deckAudioDurationSec ?? 0;
+        const minEnd = deckStartSec + 0.5;
+        return Math.max(current, durationFallback, minEnd);
+      });
+      return;
+    }
+    if (deckAudioDurationSec != null) {
+      setDeckEndSec(deckAudioDurationSec);
+    }
+  }
+
   // H2: build slide AudioTrackInput WITHOUT title — schema is .strict()
   function buildSlideAudioTrackInput(libraryItemId: number): AudioTrackInput {
     return {
@@ -710,7 +797,7 @@ export function SlideAudioPanel({
             </Button>
           </div>
         ) : (
-          <div className="space-y-3">
+          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
             <div className="flex items-center gap-2">
               <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
               <span className="text-sm truncate flex-1">
@@ -752,6 +839,7 @@ export function SlideAudioPanel({
                 <span className="text-xs text-muted-foreground">{slideVolumePct}%</span>
               </div>
               <Slider
+                className={AUDIO_SLIDER_CLASS}
                 min={0}
                 max={100}
                 step={1}
@@ -767,9 +855,14 @@ export function SlideAudioPanel({
               startSec={slideStartSec}
               endSec={slideEndSec}
               playToEnd={slidePlayToEnd}
-              onStartSecChange={setSlideStartSec}
+              onStartSecChange={(next) => {
+                setSlideStartSec(next);
+                if (!slidePlayToEnd) {
+                  setSlideEndSec((current) => Math.max(current, next));
+                }
+              }}
               onEndSecChange={setSlideEndSec}
-              onPlayToEndChange={setSlidePlayToEnd}
+              onPlayToEndChange={handleSlidePlayToEndChange}
             />
 
             {/* Actions */}
@@ -820,7 +913,7 @@ export function SlideAudioPanel({
             </Button>
           </div>
         ) : (
-          <div className="space-y-3">
+          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
             <div className="flex items-center gap-2">
               <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
               <span className="text-sm truncate flex-1">
@@ -862,6 +955,7 @@ export function SlideAudioPanel({
                 <span className="text-xs text-muted-foreground">{deckVolumePct}%</span>
               </div>
               <Slider
+                className={AUDIO_SLIDER_CLASS}
                 min={0}
                 max={100}
                 step={1}
@@ -877,9 +971,14 @@ export function SlideAudioPanel({
               startSec={deckStartSec}
               endSec={deckEndSec}
               playToEnd={deckPlayToEnd}
-              onStartSecChange={setDeckStartSec}
+              onStartSecChange={(next) => {
+                setDeckStartSec(next);
+                if (!deckPlayToEnd) {
+                  setDeckEndSec((current) => Math.max(current, next));
+                }
+              }}
               onEndSecChange={setDeckEndSec}
-              onPlayToEndChange={setDeckPlayToEnd}
+              onPlayToEndChange={handleDeckPlayToEndChange}
             />
 
             {/* Loop */}
diff --git a/apps/web/client/src/lib/documentManagementUi.ts b/apps/web/client/src/lib/documentManagementUi.ts
index 59f8e5f..0a1a2c8 100644
--- a/apps/web/client/src/lib/documentManagementUi.ts
+++ b/apps/web/client/src/lib/documentManagementUi.ts
@@ -32,6 +32,7 @@ export interface DocumentLibraryItem {
   status: "draft" | "ready" | "indexing" | "archived" | "failed";
   updated_at: string;
   created_at: string;
+  parent_id?: number | null;
 }
 
 export interface DocumentQueryState {
@@ -42,6 +43,7 @@ export interface DocumentQueryState {
   itemType?: string;
   status?: string;
   docId?: number;
+  folderId?: number | null;
 }
 
 export const DEFAULT_DOCUMENT_QUERY_STATE: DocumentQueryState = {
@@ -57,11 +59,14 @@ export function parseDocumentQueryState(search: string): DocumentQueryState {
   const sort = params.get("sort");
   const mode = params.get("mode");
   const docIdRaw = params.get("doc");
+  const folderIdRaw = params.get("folder");
   const query = params.get("q") || "";
   const itemType = params.get("type") || undefined;
   const status = params.get("status") || undefined;
   const docIdParsed = docIdRaw ? Number.parseInt(docIdRaw, 10) : NaN;
   const docId = Number.isFinite(docIdParsed) && docIdParsed > 0 ? docIdParsed : undefined;
+  const folderIdParsed = folderIdRaw ? Number.parseInt(folderIdRaw, 10) : NaN;
+  const folderId = Number.isFinite(folderIdParsed) && folderIdParsed > 0 ? folderIdParsed : null;
 
   return {
     scope:
@@ -78,6 +83,7 @@ export function parseDocumentQueryState(search: string): DocumentQueryState {
     itemType,
     status,
     docId,
+    folderId,
   };
 }
 
@@ -100,6 +106,9 @@ export function buildDocumentQueryString(state: DocumentQueryState): string {
   if (state.status) {
     params.set("status", state.status);
   }
+  if (state.folderId != null) {
+    params.set("folder", String(state.folderId));
+  }
   return params.toString();
 }
 
diff --git a/apps/web/client/src/main.tsx b/apps/web/client/src/main.tsx
index 7b80aa0..4c183de 100644
--- a/apps/web/client/src/main.tsx
+++ b/apps/web/client/src/main.tsx
@@ -12,6 +12,8 @@ import "./index.css";
 
 const CHUNK_RELOAD_MARKER = "__smartspec_chunk_reload_at__";
 const CHUNK_RELOAD_WINDOW_MS = 30_000;
+const SENTRY_EVENT_DEDUPE_WINDOW_MS = 30_000;
+const recentSentryEvents = new Map<string, number>();
 const CHUNK_ERROR_PATTERNS = [
   /Failed to fetch dynamically imported module/i,
   /Importing a module script failed/i,
@@ -19,6 +21,49 @@ const CHUNK_ERROR_PATTERNS = [
   /ChunkLoadError/i,
 ];
 
+function parseSampleRate(raw: unknown, fallback: number): number {
+  const parsed = Number(raw);
+  if (!Number.isFinite(parsed)) {
+    return fallback;
+  }
+  return Math.min(1, Math.max(0, parsed));
+}
+
+function shouldDropDuplicateSentryEvent(event: Sentry.Event): boolean {
+  const exceptionValue = event.exception?.values?.[0]?.value || "";
+  const exceptionType = event.exception?.values?.[0]?.type || "";
+  const key = [
+    event.message || "",
+    exceptionType,
+    exceptionValue,
+    event.transaction || "",
+  ]
+    .join("|")
+    .trim();
+
+  if (!key) {
+    return false;
+  }
+
+  const now = Date.now();
+  const lastSeenAt = recentSentryEvents.get(key);
+  recentSentryEvents.set(key, now);
+  if (lastSeenAt != null && now - lastSeenAt < SENTRY_EVENT_DEDUPE_WINDOW_MS) {
+    return true;
+  }
+
+  // Guard against unbounded growth in long-lived tabs
+  if (recentSentryEvents.size > 500) {
+    for (const [existingKey, seenAt] of recentSentryEvents) {
+      if (now - seenAt > SENTRY_EVENT_DEDUPE_WINDOW_MS) {
+        recentSentryEvents.delete(existingKey);
+      }
+    }
+  }
+
+  return false;
+}
+
 function isChunkLoadError(error: unknown): boolean {
   if (error instanceof Error) {
     return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
@@ -65,23 +110,44 @@ if (typeof window !== "undefined") {
   });
 }
 
-// Initialize Sentry for frontend error tracking (only when DSN is configured)
-if (import.meta.env.VITE_SENTRY_DSN) {
-  Sentry.init({
-    dsn: import.meta.env.VITE_SENTRY_DSN,
-    environment: import.meta.env.MODE || "production",
-    release: import.meta.env.VITE_RELEASE || undefined,
-    tracesSampleRate: 0.05,
-    replaysSessionSampleRate: 0.01,
-    replaysOnErrorSampleRate: 1.0,
-    integrations: [
-      Sentry.browserTracingIntegration(),
+// Initialize Sentry for frontend error tracking (only when enabled + DSN configured)
+const isSentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";
+const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
+const sentrySampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_SAMPLE_RATE, 0.2);
+const sentryTraceSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.02);
+const sentryReplaySessionSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE, 0);
+const sentryReplayOnErrorSampleRate = parseSampleRate(import.meta.env.VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE, 0.1);
+
+if (isSentryEnabled && sentryDsn) {
+  const integrations = [Sentry.browserTracingIntegration()];
+  if (sentryReplaySessionSampleRate > 0 || sentryReplayOnErrorSampleRate > 0) {
+    integrations.push(
       Sentry.replayIntegration({
         maskAllInputs: true,
         maskAllText: false,
       }),
+    );
+  }
+
+  Sentry.init({
+    dsn: sentryDsn,
+    environment: import.meta.env.MODE || "production",
+    release: import.meta.env.VITE_RELEASE || undefined,
+    sampleRate: sentrySampleRate,
+    tracesSampleRate: sentryTraceSampleRate,
+    replaysSessionSampleRate: sentryReplaySessionSampleRate,
+    replaysOnErrorSampleRate: sentryReplayOnErrorSampleRate,
+    integrations,
+    ignoreErrors: [
+      "Fullscreen API unavailable",
+      "ResizeObserver loop limit exceeded",
+      "ResizeObserver loop completed with undelivered notifications",
     ],
     beforeSend(event) {
+      if (shouldDropDuplicateSentryEvent(event)) {
+        return null;
+      }
+
       const scrubObj = (obj: Record<string, unknown>) => {
         for (const key of Object.keys(obj)) {
           if (/password|token|secret|apiKey/i.test(key)) {
diff --git a/apps/web/client/src/pages/DocumentManagement.tsx b/apps/web/client/src/pages/DocumentManagement.tsx
index 09482ff..13f5c07 100644
--- a/apps/web/client/src/pages/DocumentManagement.tsx
+++ b/apps/web/client/src/pages/DocumentManagement.tsx
@@ -6,10 +6,14 @@ import {
   ChevronsRight,
   ChevronDown,
   ChevronLeft,
+  ChevronRight,
   Eye,
   FilePlus2,
   FileText,
+  Folder,
   FolderOpen,
+  FolderPlus,
+  Home,
   ImagePlus,
   Info,
   Maximize2,
@@ -20,6 +24,8 @@ import {
   PanelRightOpen,
   Plus,
   Search,
+  Share2,
+  Trash2,
   Upload,
   Video,
   X,
@@ -31,6 +37,8 @@ import DocumentPreviewPanel from "@/components/library/DocumentPreviewPanel";
 import GoogleDriveBrowser from "@/components/library/GoogleDriveBrowser";
 import OneDriveBrowser from "@/components/library/OneDriveBrowser";
 import { TrashPanel } from "@/components/library/TrashPanel";
+import CreateFolderDialog from "@/components/library/CreateFolderDialog";
+import ShareLibraryDialog from "@/components/library/ShareLibraryDialog";
 import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
@@ -136,6 +144,10 @@ export default function DocumentManagement() {
   const [libraryPanelWidth, setLibraryPanelWidth] = useState(440);
   const [previewPanelWidth, setPreviewPanelWidth] = useState(430);
   const [importingDriveFileId, setImportingDriveFileId] = useState<string | null>(null);
+  const [uploadingCount, setUploadingCount] = useState(0);
+  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
+  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
+  const [isShareLibraryOpen, setIsShareLibraryOpen] = useState(false);
   const [mobileTab, setMobileTab] = useState<"library" | "editor" | "preview">("library");
   const [isLibraryHeaderCollapsed, setIsLibraryHeaderCollapsed] = useState(true);
   const [openEditorTabs, setOpenEditorTabs] = useState<DocumentEditorTab[]>(() => {
@@ -243,7 +255,8 @@ export default function DocumentManagement() {
       itemType: queryState.itemType || undefined,
       status: queryState.status as any,
     },
-  }), [debouncedQuery, listScope, queryState.sort, queryState.itemType, queryState.status]);
+    folderId: listScope === "my_library" ? (queryState.folderId ?? null) : undefined,
+  }), [debouncedQuery, listScope, queryState.sort, queryState.itemType, queryState.status, queryState.folderId]);
 
   const { data: documentData, isLoading: listLoading, error: listError } = trpc.library.listDocuments.useQuery(listInput, {
     enabled: shouldListDocuments,
@@ -283,8 +296,17 @@ export default function DocumentManagement() {
   const createPresentationDeckMutation = trpc.presentation.createDeck.useMutation();
   const updateItemMutation = trpc.library.updateItem.useMutation();
   const deleteItemMutation = trpc.library.deleteItem.useMutation();
+  const deleteItemsMutation = trpc.library.deleteItems.useMutation();
   const importDriveFileMutation = trpc.googleDrive.importDriveFile.useMutation();
 
+  // Folder path / breadcrumb (only when inside a folder)
+  const currentFolderId = queryState.folderId ?? null;
+  const folderPathQuery = trpc.library.getFolderPath.useQuery(
+    { folderId: currentFolderId! },
+    { enabled: currentFolderId != null },
+  );
+  const folderPath = folderPathQuery.data ?? [];
+
   function isEditorTabDirty(tabId: number): boolean {
     const draft = markdownDraftByDocId[tabId];
     if (!draft) return false;
@@ -757,24 +779,106 @@ export default function DocumentManagement() {
     }
   }
 
-  async function handleUploadFile(file: File) {
+  function handleFolderOpen(item: DocumentLibraryItem) {
+    setSelectedItemIds(new Set());
+    setSelectedId(null);
+    setQueryState((prev) => ({
+      ...prev,
+      folderId: item.id,
+      scope: "my_library",
+      docId: undefined,
+    }));
+  }
+
+  function navigateToFolder(folderId: number | null) {
+    setSelectedItemIds(new Set());
+    setSelectedId(null);
+    setQueryState((prev) => ({ ...prev, folderId, docId: undefined }));
+  }
+
+  async function handleDeleteItemWithFolderCheck(item: DocumentLibraryItem) {
+    if (item.item_type === "folder") {
+      // Check child count before deleting folder
+      try {
+        const result = await trpcUtils.client.library.getFolderChildCount.query({ folderId: item.id });
+        if (result.count > 0) {
+          const confirmed = window.confirm(
+            `The folder "${item.title}" contains ${result.count} item(s). Deleting this folder will also move all its contents to trash. Continue?`,
+          );
+          if (!confirmed) return;
+        }
+      } catch {
+        // fall through — let the delete proceed
+      }
+    }
+    handleDeleteItem(item);
+  }
+
+  async function handleBatchDelete() {
+    if (selectedItemIds.size === 0) return;
+    const confirmed = window.confirm(
+      `Move ${selectedItemIds.size} item(s) to trash?`,
+    );
+    if (!confirmed) return;
+
     try {
-      const fileBase64 = await fileToBase64(file);
-      const result = await uploadFileMutation.mutateAsync({
-        fileName: file.name,
-        fileType: file.type || "application/octet-stream",
-        fileBase64,
-        title: file.name,
-      });
+      const result = await deleteItemsMutation.mutateAsync({ ids: Array.from(selectedItemIds) });
+      toast.success(`${result.deleted} item(s) moved to trash.`);
+      setSelectedItemIds(new Set());
+      await trpcUtils.library.listDocuments.invalidate();
+    } catch (err) {
+      toast.error(err instanceof Error ? err.message : "Batch delete failed");
+    }
+  }
+
+  async function handleUploadFiles(files: File[]) {
+    if (files.length === 0) return;
+    setUploadingCount((n) => n + files.length);
+
+    const results = await Promise.allSettled(
+      files.map(async (file) => {
+        try {
+          const fileBase64 = await fileToBase64(file);
+          return await uploadFileMutation.mutateAsync({
+            fileName: file.name,
+            fileType: file.type || "application/octet-stream",
+            fileBase64,
+            title: file.name,
+            parentId: currentFolderId,
+          });
+        } finally {
+          setUploadingCount((n) => Math.max(0, n - 1));
+        }
+      }),
+    );
 
-      toast.success("File uploaded to library. Indexing started.");
+    const succeeded = results.filter(
+      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof uploadFileMutation.mutateAsync>>> =>
+        r.status === "fulfilled",
+    );
+    const failedCount = results.length - succeeded.length;
+
+    if (succeeded.length > 0) {
+      if (failedCount === 0) {
+        toast.success(
+          succeeded.length === 1
+            ? "File uploaded to library. Indexing started."
+            : `${succeeded.length} files uploaded to library. Indexing started.`,
+        );
+      } else {
+        toast.warning(`${succeeded.length} file(s) uploaded, ${failedCount} failed.`);
+      }
       setQueryState((prev) => ({ ...prev, scope: "my_library" }));
-      setPendingAutoSelectId(result.item.id);
-      setSelectedId(result.item.id);
-      setProvisionalSelectedItem(toProvisionalDocumentItem(result.item));
+      if (files.length === 1) {
+        const result = succeeded[0].value;
+        setPendingAutoSelectId(result.item.id);
+        setSelectedId(result.item.id);
+        setProvisionalSelectedItem(toProvisionalDocumentItem(result.item));
+      }
       await trpcUtils.library.listDocuments.invalidate();
-    } catch (error) {
-      toast.error(error instanceof Error ? error.message : "Upload failed");
+    } else {
+      const firstRejected = results[0] as PromiseRejectedResult;
+      toast.error(firstRejected.reason instanceof Error ? firstRejected.reason.message : "Upload failed");
     }
   }
 
@@ -1038,13 +1142,13 @@ export default function DocumentManagement() {
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end">
-                  <DropdownMenuItem onClick={() => imageInputRef.current?.click()} disabled={uploadFileMutation.isPending}>
+                  <DropdownMenuItem onClick={() => imageInputRef.current?.click()} disabled={uploadingCount > 0}>
                     <ImagePlus className="mr-2 h-4 w-4" /> Upload Image
                   </DropdownMenuItem>
-                  <DropdownMenuItem onClick={() => videoInputRef.current?.click()} disabled={uploadFileMutation.isPending}>
+                  <DropdownMenuItem onClick={() => videoInputRef.current?.click()} disabled={uploadingCount > 0}>
                     <Video className="mr-2 h-4 w-4" /> Upload Video
                   </DropdownMenuItem>
-                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={uploadFileMutation.isPending}>
+                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={uploadingCount > 0}>
                     <Upload className="mr-2 h-4 w-4" /> Upload File
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={handleCreateNewDocument} disabled={createItemMutation.isPending || saveMarkdownMutation.isPending}>
@@ -1063,7 +1167,7 @@ export default function DocumentManagement() {
                 variant="outline"
                 size="sm"
                 onClick={() => imageInputRef.current?.click()}
-                disabled={uploadFileMutation.isPending}
+                disabled={uploadingCount > 0}
               >
                 <ImagePlus className="mr-1 h-4 w-4" />
                 Upload Image
@@ -1072,7 +1176,7 @@ export default function DocumentManagement() {
                 variant="outline"
                 size="sm"
                 onClick={() => videoInputRef.current?.click()}
-                disabled={uploadFileMutation.isPending}
+                disabled={uploadingCount > 0}
               >
                 <Video className="mr-1 h-4 w-4" />
                 Upload Video
@@ -1081,7 +1185,7 @@ export default function DocumentManagement() {
                 variant="outline"
                 size="sm"
                 onClick={() => fileInputRef.current?.click()}
-                disabled={uploadFileMutation.isPending}
+                disabled={uploadingCount > 0}
               >
                 <Upload className="mr-1 h-4 w-4" />
                 Upload File
@@ -1112,39 +1216,53 @@ export default function DocumentManagement() {
         ref={imageInputRef}
         type="file"
         accept="image/*"
+        multiple
         className="hidden"
         onChange={async (event) => {
-          const file = event.target.files?.[0];
+          const files = Array.from(event.target.files ?? []);
           event.target.value = "";
-          if (!file) return;
-          await handleUploadFile(file);
+          await handleUploadFiles(files);
         }}
       />
       <input
         ref={videoInputRef}
         type="file"
         accept="video/*"
+        multiple
         className="hidden"
         onChange={async (event) => {
-          const file = event.target.files?.[0];
+          const files = Array.from(event.target.files ?? []);
           event.target.value = "";
-          if (!file) return;
-          await handleUploadFile(file);
+          await handleUploadFiles(files);
         }}
       />
       <input
         ref={fileInputRef}
         type="file"
         accept=".pdf,.md,.markdown,.txt,.csv,.json,.html,.htm,.xml,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp3,.wav,.m4a,.ogg"
+        multiple
         className="hidden"
         onChange={async (event) => {
-          const file = event.target.files?.[0];
+          const files = Array.from(event.target.files ?? []);
           event.target.value = "";
-          if (!file) return;
-          await handleUploadFile(file);
+          await handleUploadFiles(files);
         }}
       />
 
+      <CreateFolderDialog
+        open={isCreateFolderOpen}
+        onOpenChange={setIsCreateFolderOpen}
+        parentId={currentFolderId}
+        onCreated={(folderId) => {
+          // Optionally navigate into the new folder
+        }}
+      />
+
+      <ShareLibraryDialog
+        open={isShareLibraryOpen}
+        onOpenChange={setIsShareLibraryOpen}
+      />
+
       <main className={cn(
         isDesktopLayout ? "px-4 py-6 sm:px-6 lg:px-8" : "flex-1 min-h-0 overflow-hidden px-3 pt-3 pb-14",
       )}>
@@ -1222,6 +1340,81 @@ export default function DocumentManagement() {
                   </div>
                 ) : (
                   <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 gap-2">
+                    {/* Mobile folder breadcrumb + toolbar */}
+                    {queryState.scope === "my_library" && (
+                      <div className="shrink-0 space-y-1.5">
+                        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-600">
+                          <button
+                            type="button"
+                            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100"
+                            onClick={() => navigateToFolder(null)}
+                          >
+                            <Home className="h-3 w-3" />
+                            <span>Library</span>
+                          </button>
+                          {folderPath.map((seg, idx) => (
+                            <span key={seg.id} className="flex items-center gap-1">
+                              <ChevronRight className="h-3 w-3 text-slate-400" />
+                              <button
+                                type="button"
+                                className={cn(
+                                  "truncate max-w-[100px] rounded px-1 py-0.5 hover:bg-slate-100",
+                                  idx === folderPath.length - 1 && "font-semibold text-slate-900",
+                                )}
+                                onClick={() => navigateToFolder(seg.id)}
+                              >
+                                {seg.title}
+                              </button>
+                            </span>
+                          ))}
+                        </nav>
+                        <div className="flex items-center gap-1.5">
+                          <Button
+                            size="sm"
+                            variant="outline"
+                            className="h-7 gap-1 rounded-lg px-2 text-xs"
+                            onClick={() => setIsCreateFolderOpen(true)}
+                          >
+                            <FolderPlus className="h-3 w-3" />
+                            New Folder
+                          </Button>
+                          <Button
+                            size="sm"
+                            variant="outline"
+                            className="h-7 gap-1 rounded-lg px-2 text-xs"
+                            onClick={() => setIsShareLibraryOpen(true)}
+                          >
+                            <Share2 className="h-3 w-3" />
+                            Share
+                          </Button>
+                        </div>
+                      </div>
+                    )}
+
+                    {/* Mobile batch-delete bar */}
+                    {selectedItemIds.size > 0 && (
+                      <div className="shrink-0 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
+                        <span className="text-xs font-medium text-red-700">
+                          {selectedItemIds.size} selected
+                        </span>
+                        <div className="flex items-center gap-1.5">
+                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelectedItemIds(new Set())}>
+                            Clear
+                          </Button>
+                          <Button
+                            size="sm"
+                            variant="destructive"
+                            className="h-6 gap-1 text-xs"
+                            onClick={handleBatchDelete}
+                            disabled={deleteItemsMutation.isPending}
+                          >
+                            <Trash2 className="h-3 w-3" />
+                            Trash
+                          </Button>
+                        </div>
+                      </div>
+                    )}
+
                     <div className="shrink-0 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                       <div className="relative">
                         <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
@@ -1244,6 +1437,34 @@ export default function DocumentManagement() {
                           <SelectItem value="created_desc">Newest created first</SelectItem>
                         </SelectContent>
                       </Select>
+                      <Select
+                        value={queryState.itemType ?? "all"}
+                        onValueChange={(value) =>
+                          setQueryState((prev) => ({ ...prev, itemType: value === "all" ? undefined : value }))
+                        }
+                      >
+                        <SelectTrigger
+                          className={cn(
+                            "h-10 rounded-xl border-slate-300 bg-white",
+                            queryState.itemType && "border-sky-400 bg-sky-50 text-sky-700",
+                          )}
+                        >
+                          <SelectValue placeholder="All file types" />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="all">All file types</SelectItem>
+                          <SelectItem value="image">Images</SelectItem>
+                          <SelectItem value="video">Videos</SelectItem>
+                          <SelectItem value="audio">Audio</SelectItem>
+                          <SelectItem value="md">Markdown</SelectItem>
+                          <SelectItem value="document">Documents</SelectItem>
+                          <SelectItem value="spreadsheet">Spreadsheets</SelectItem>
+                          <SelectItem value="presentation">Presentations</SelectItem>
+                          <SelectItem value="pdf">PDF</SelectItem>
+                          <SelectItem value="text">Text files</SelectItem>
+                          <SelectItem value="file">Other</SelectItem>
+                        </SelectContent>
+                      </Select>
                     </div>
                     <div className="flex-1 overflow-y-auto">
                       {listError && (
@@ -1256,7 +1477,7 @@ export default function DocumentManagement() {
                         selectedId={selectedId}
                         isLoading={listLoading}
                         className="h-auto"
-                        emptyMessage="No documents match the selected scope and filters."
+                        emptyMessage={currentFolderId ? "This folder is empty." : "No documents match the selected scope and filters."}
                         onSelect={(item) => {
                           setPendingAutoSelectId(null);
                           setProvisionalSelectedItem(null);
@@ -1267,7 +1488,10 @@ export default function DocumentManagement() {
                           setProvisionalSelectedItem(null);
                           openEditorTab(item, { scope: queryState.scope });
                         }}
-                        onDelete={handleDeleteItem}
+                        onDelete={handleDeleteItemWithFolderCheck}
+                        onFolderOpen={handleFolderOpen}
+                        selectedIds={selectedItemIds}
+                        onSelectionChange={setSelectedItemIds}
                       />
                     </div>
                   </div>
@@ -1484,6 +1708,88 @@ export default function DocumentManagement() {
                 </div>
               ) : (
                 <>
+                  {/* Folder breadcrumb + toolbar */}
+                  {queryState.scope === "my_library" && (
+                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
+                      {/* Breadcrumb */}
+                      <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-slate-600">
+                        <button
+                          type="button"
+                          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900"
+                          onClick={() => navigateToFolder(null)}
+                        >
+                          <Home className="h-3.5 w-3.5" />
+                          <span>Library</span>
+                        </button>
+                        {folderPath.map((seg, idx) => (
+                          <span key={seg.id} className="flex items-center gap-1">
+                            <ChevronRight className="h-3 w-3 text-slate-400" />
+                            <button
+                              type="button"
+                              className={cn(
+                                "truncate rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900",
+                                idx === folderPath.length - 1 && "font-semibold text-slate-900",
+                              )}
+                              onClick={() => navigateToFolder(seg.id)}
+                            >
+                              {seg.title}
+                            </button>
+                          </span>
+                        ))}
+                      </nav>
+                      {/* Folder action buttons */}
+                      <div className="flex shrink-0 items-center gap-1.5">
+                        <Button
+                          size="sm"
+                          variant="outline"
+                          className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
+                          onClick={() => setIsCreateFolderOpen(true)}
+                        >
+                          <FolderPlus className="h-3.5 w-3.5" />
+                          New Folder
+                        </Button>
+                        <Button
+                          size="sm"
+                          variant="outline"
+                          className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
+                          onClick={() => setIsShareLibraryOpen(true)}
+                        >
+                          <Share2 className="h-3.5 w-3.5" />
+                          Share
+                        </Button>
+                      </div>
+                    </div>
+                  )}
+
+                  {/* Batch-delete bar */}
+                  {selectedItemIds.size > 0 && (
+                    <div className="mb-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
+                      <span className="text-sm font-medium text-red-700">
+                        {selectedItemIds.size} item(s) selected
+                      </span>
+                      <div className="flex items-center gap-2">
+                        <Button
+                          size="sm"
+                          variant="ghost"
+                          className="h-7 text-xs text-slate-600"
+                          onClick={() => setSelectedItemIds(new Set())}
+                        >
+                          Clear
+                        </Button>
+                        <Button
+                          size="sm"
+                          variant="destructive"
+                          className="h-7 gap-1.5 text-xs"
+                          onClick={handleBatchDelete}
+                          disabled={deleteItemsMutation.isPending}
+                        >
+                          <Trash2 className="h-3.5 w-3.5" />
+                          Move to Trash
+                        </Button>
+                      </div>
+                    </div>
+                  )}
+
                   <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                     <div className="relative">
                       <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
@@ -1506,6 +1812,34 @@ export default function DocumentManagement() {
                         <SelectItem value="created_desc">Newest created first</SelectItem>
                       </SelectContent>
                     </Select>
+                    <Select
+                      value={queryState.itemType ?? "all"}
+                      onValueChange={(value) =>
+                        setQueryState((prev) => ({ ...prev, itemType: value === "all" ? undefined : value }))
+                      }
+                    >
+                      <SelectTrigger
+                        className={cn(
+                          "h-11 rounded-xl border-slate-300 bg-white",
+                          queryState.itemType && "border-sky-400 bg-sky-50 text-sky-700",
+                        )}
+                      >
+                        <SelectValue placeholder="All file types" />
+                      </SelectTrigger>
+                      <SelectContent>
+                        <SelectItem value="all">All file types</SelectItem>
+                        <SelectItem value="image">Images</SelectItem>
+                        <SelectItem value="video">Videos</SelectItem>
+                        <SelectItem value="audio">Audio</SelectItem>
+                        <SelectItem value="md">Markdown</SelectItem>
+                        <SelectItem value="document">Documents</SelectItem>
+                        <SelectItem value="spreadsheet">Spreadsheets</SelectItem>
+                        <SelectItem value="presentation">Presentations</SelectItem>
+                        <SelectItem value="pdf">PDF</SelectItem>
+                        <SelectItem value="text">Text files</SelectItem>
+                        <SelectItem value="file">Other</SelectItem>
+                      </SelectContent>
+                    </Select>
                   </div>
 
                   <div className="overflow-y-auto xl:h-[1000px]">
@@ -1519,7 +1853,7 @@ export default function DocumentManagement() {
                       selectedId={selectedId}
                       isLoading={listLoading}
                       className="h-auto"
-                      emptyMessage="No documents match the selected scope and filters."
+                      emptyMessage={currentFolderId ? "This folder is empty." : "No documents match the selected scope and filters."}
                       onSelect={(item) => {
                         setPendingAutoSelectId(null);
                         setProvisionalSelectedItem(null);
@@ -1530,7 +1864,10 @@ export default function DocumentManagement() {
                         setProvisionalSelectedItem(null);
                         openEditorTab(item, { scope: queryState.scope });
                       }}
-                      onDelete={handleDeleteItem}
+                      onDelete={handleDeleteItemWithFolderCheck}
+                      onFolderOpen={handleFolderOpen}
+                      selectedIds={selectedItemIds}
+                      onSelectionChange={setSelectedItemIds}
                     />
                   </div>
                 </>
diff --git a/apps/web/client/src/pages/PresentationEditor.test.tsx b/apps/web/client/src/pages/PresentationEditor.test.tsx
index 48e1dff..dc0a8c2 100644
--- a/apps/web/client/src/pages/PresentationEditor.test.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.test.tsx
@@ -893,6 +893,28 @@ describe("PresentationEditor", () => {
     await waitFor(() => {
       expect(screen.getByLabelText("Element X")).toHaveValue(11);
     });
+
+    // Redo using KeyZ physical code (non-English layout compatible)
+    fireEvent.keyDown(window, { key: "x", code: "KeyZ", ctrlKey: true, shiftKey: true });
+    await waitFor(() => {
+      expect(screen.getByLabelText("Element X")).toHaveValue(11);
+    });
+  });
+
+  it("supports copy/cut/paste hotkeys for selected canvas elements", async () => {
+    render(<PresentationEditor />);
+    expect(screen.getAllByRole("button", { name: /select canvas element/i })).toHaveLength(1);
+
+    fireEvent.keyDown(window, { key: "x", code: "KeyC", ctrlKey: true });
+    fireEvent.keyDown(window, { key: "x", code: "KeyV", ctrlKey: true });
+    await waitFor(() => {
+      expect(screen.getAllByRole("button", { name: /select canvas element/i })).toHaveLength(2);
+    });
+
+    fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
+    await waitFor(() => {
+      expect(screen.getAllByRole("button", { name: /select canvas element/i })).toHaveLength(1);
+    });
   });
 
   it("supports pointer drag to move selected elements on canvas", async () => {
diff --git a/apps/web/client/src/pages/PresentationEditor.tsx b/apps/web/client/src/pages/PresentationEditor.tsx
index 3d68599..1782e37 100644
--- a/apps/web/client/src/pages/PresentationEditor.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.tsx
@@ -75,13 +75,16 @@ import { toast } from "sonner";
 import {
   createElement,
   ensureSlideContent,
+  resizeCanvas,
   type ArrangeDirection,
+  type PresentationElement,
   type PresentationElementType,
   type PresentationSlideContent,
 } from "@/lib/presentationEditorState";
 import { SelectionEngine } from "@/presentation-canvas/selection/SelectionEngine";
 import { CommandBus } from "@/presentation-canvas/commands/CommandBus";
 import { useMobileGestures } from "@/presentation-canvas/mobile/useMobileGestures";
+import { AudioTrackPlayer } from "@/presentation-canvas/play/AudioTrackPlayer";
 import { ExportDialog } from "@/components/presentation/ExportDialog";
 import { ImportPresentationDialog } from "@/components/presentation/ImportPresentationDialog";
 import { AIDraftModal } from "@/components/presentation/AIDraftModal";
@@ -138,6 +141,8 @@ const MIN_DESKTOP_ZOOM = 0.5;
 const MAX_DESKTOP_ZOOM = 2;
 const DESKTOP_ZOOM_STEP = 0.1;
 const MIN_SLIDE_DURATION_MS = 250;
+const UNSAVED_PRESENTATION_WARNING =
+  "คุณมีการแก้ไขสไลด์ที่ยังไม่ได้บันทึก หากออกตอนนี้ข้อมูลที่แก้ไขจะหายไป ต้องการออกจากโปรเจกต์หรือไม่?";
 
 interface LibraryResultItemLike {
   id?: number;
@@ -748,6 +753,9 @@ export default function PresentationEditor() {
   const [commandState, setCommandState] = useState<CanvasCommandState>(() =>
     createCanvasCommandState({ elements: [] }),
   );
+  const slideDraftCacheRef = useRef<Map<number, PresentationSlideContent>>(new Map());
+  const elementClipboardRef = useRef<PresentationElement[]>([]);
+  const clipboardPasteCountRef = useRef(0);
   const commandBusRef = useRef(
     new CommandBus<CanvasCommandState>(createCanvasCommandState({ elements: [] })),
   );
@@ -763,6 +771,9 @@ export default function PresentationEditor() {
   const [lastExportId, setLastExportId] = useState<number | null>(null);
   const playbackOverlayRef = useRef<HTMLDivElement | null>(null);
   const playbackStageHostRef = useRef<HTMLDivElement | null>(null);
+  const previewAudioPlayerRef = useRef<AudioTrackPlayer | null>(null);
+  const previewAudioSlideIndexRef = useRef<number | null>(null);
+  const previewAudioDeckSignatureRef = useRef<string | null>(null);
   const [playbackStageHostSize, setPlaybackStageHostSize] = useState({ width: 0, height: 0 });
   const [isPlaybackFullscreen, setIsPlaybackFullscreen] = useState(false);
   const [projectTitleDraft, setProjectTitleDraft] = useState("");
@@ -780,6 +791,7 @@ export default function PresentationEditor() {
   const [isAIDraftModalOpen, setIsAIDraftModalOpen] = useState(false);
   const [timingDurationSecInput, setTimingDurationSecInput] = useState<string>("3");
   const [timingApplyAllPending, setTimingApplyAllPending] = useState(false);
+  const [canvasApplyAllPending, setCanvasApplyAllPending] = useState(false);
   const [libraryTab, setLibraryTab] = useState<AssetLibraryTab>("slides");
   const [librarySearchQuery, setLibrarySearchQuery] = useState("");
   const [selectedSavedVersionId, setSelectedSavedVersionId] = useState<number | null>(null);
@@ -831,6 +843,14 @@ export default function PresentationEditor() {
       refetchInterval: 5000,
     },
   );
+  const playDeckPreviewQuery = trpc.presentation.getPlayDeck.useQuery(
+    { itemId: docId || 0 },
+    {
+      enabled: Boolean(docId),
+      refetchOnWindowFocus: false,
+      staleTime: 30_000,
+    },
+  );
 
   const imageLibraryQuery = trpc.library.listDocuments.useQuery(
     {
@@ -901,11 +921,39 @@ export default function PresentationEditor() {
       && draftSignature !== persistedSlideSignature,
     )
   ), [draftSignature, persistedSlideSignature]);
+  const unsavedCachedSlideIds = (() => {
+    const result: number[] = [];
+    for (const [slideId, cachedContent] of slideDraftCacheRef.current.entries()) {
+      if (slideId === selectedSlideId) {
+        continue;
+      }
+      const persistedSlide = slides.find((slide) => slide.id === slideId);
+      if (!persistedSlide) {
+        continue;
+      }
+      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
+      if (JSON.stringify(persistedContent) !== JSON.stringify(ensureSlideContent(cachedContent))) {
+        result.push(slideId);
+      }
+    }
+    return result;
+  })();
+  const hasUnsavedSlideChanges = hasUnsavedSelectedSlideChanges || unsavedCachedSlideIds.length > 0;
   const isMobilePanMode = isMobileViewport && mobileGestures.state.mode === "pan_mode";
   const selectedElement = useMemo(
     () => draftContent.elements.find((element) => element.id === selectedElementId) || null,
     [draftContent.elements, selectedElementId],
   );
+  const selectedElements = useMemo(
+    () => draftContent.elements.filter((element) => selectedElementIds.includes(element.id)),
+    [draftContent.elements, selectedElementIds],
+  );
+  const selectionHasMixedTypes = useMemo(() => {
+    if (selectedElements.length <= 1) {
+      return false;
+    }
+    return new Set(selectedElements.map((element) => element.type)).size > 1;
+  }, [selectedElements]);
   const firstVideoSourceUrl = useMemo(() => {
     const firstVideo = draftContent.elements.find((element) => element.type === "video");
     if (!firstVideo || firstVideo.type !== "video") {
@@ -1045,9 +1093,10 @@ export default function PresentationEditor() {
   );
   const playbackSlides = useMemo(() => {
     return slides.map((slide) => {
+      const cachedContent = slideDraftCacheRef.current.get(slide.id);
       const content = selectedSlideId === slide.id
         ? draftContent
-        : ensureSlideContent(slide.slideContent);
+        : cachedContent ?? ensureSlideContent(slide.slideContent);
       return {
         slideId: slide.id,
         title: slide.title,
@@ -1072,6 +1121,24 @@ export default function PresentationEditor() {
     syncCommandState(commandBusRef.current.execute(command));
   }
 
+  function cacheSlideDraft(slideId: number | null, content: PresentationSlideContent) {
+    if (!slideId) return;
+    slideDraftCacheRef.current.set(slideId, ensureSlideContent(content));
+  }
+
+  function clearCachedSlideDraft(slideId: number | null) {
+    if (!slideId) return;
+    slideDraftCacheRef.current.delete(slideId);
+  }
+
+  function switchToSlide(nextSlideId: number) {
+    if (selectedSlideId === nextSlideId) {
+      return;
+    }
+    cacheSlideDraft(selectedSlideId, draftContent);
+    setSelectedSlideId(nextSlideId);
+  }
+
   useEffect(() => {
     deckVersionRef.current =
       deck && Number.isFinite(Number(deck.version))
@@ -1107,6 +1174,85 @@ export default function PresentationEditor() {
     setSelectedSlideId(slides[0].id);
   }, [selectedSlideId, slides]);
 
+  useEffect(() => {
+    if (!slides.length) {
+      slideDraftCacheRef.current.clear();
+      return;
+    }
+    const slidesById = new Map<number, (typeof slides)[number]>();
+    for (const slide of slides) {
+      slidesById.set(slide.id, slide);
+    }
+    for (const [slideId, cached] of slideDraftCacheRef.current.entries()) {
+      const persistedSlide = slidesById.get(slideId);
+      if (!persistedSlide) {
+        slideDraftCacheRef.current.delete(slideId);
+        continue;
+      }
+      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
+      if (JSON.stringify(persistedContent) === JSON.stringify(ensureSlideContent(cached))) {
+        slideDraftCacheRef.current.delete(slideId);
+      }
+    }
+  }, [slides]);
+
+  useEffect(() => {
+    if (!hasUnsavedSlideChanges || typeof window === "undefined") {
+      return;
+    }
+
+    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
+      event.preventDefault();
+      event.returnValue = "";
+    };
+
+    const handleDocumentClick = (event: MouseEvent) => {
+      if (event.defaultPrevented || event.button !== 0) {
+        return;
+      }
+      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
+        return;
+      }
+
+      const target = event.target as HTMLElement | null;
+      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
+      if (!anchor) {
+        return;
+      }
+      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
+        return;
+      }
+
+      const href = anchor.getAttribute("href");
+      if (!href || href.startsWith("#")) {
+        return;
+      }
+
+      const currentUrl = new URL(window.location.href);
+      const nextUrl = new URL(anchor.href, window.location.href);
+      const sameRoute = nextUrl.origin === currentUrl.origin
+        && nextUrl.pathname === currentUrl.pathname
+        && nextUrl.search === currentUrl.search;
+      if (sameRoute) {
+        return;
+      }
+
+      const confirmed = window.confirm(UNSAVED_PRESENTATION_WARNING);
+      if (confirmed) {
+        return;
+      }
+      event.preventDefault();
+      event.stopPropagation();
+    };
+
+    window.addEventListener("beforeunload", handleBeforeUnload);
+    document.addEventListener("click", handleDocumentClick, true);
+    return () => {
+      window.removeEventListener("beforeunload", handleBeforeUnload);
+      document.removeEventListener("click", handleDocumentClick, true);
+    };
+  }, [hasUnsavedSlideChanges]);
+
   useEffect(() => {
     const currentSeconds = resolveSlideDurationMs(draftContent) / 1000;
     setTimingDurationSecInput(currentSeconds.toFixed(1).replace(/\.0$/, ""));
@@ -1192,7 +1338,10 @@ export default function PresentationEditor() {
       return;
     }
 
-    const next = ensureSlideContent(selectedSlide.slideContent);
+    const cachedDraft = slideDraftCacheRef.current.get(selectedSlide.id);
+    const next = cachedDraft
+      ? ensureSlideContent(cachedDraft)
+      : ensureSlideContent(selectedSlide.slideContent);
     const nextSelected = next.elements[0]?.id ? [next.elements[0].id] : [];
     const nextState = createCanvasCommandState(next, nextSelected);
     commandBusRef.current.reset(nextState);
@@ -1203,8 +1352,15 @@ export default function PresentationEditor() {
   }, [selectedSlide?.id, selectedSlide?.version]);
 
   async function refreshDeck() {
+    const tasks: Array<Promise<unknown>> = [];
     if (typeof deckQuery.refetch === "function") {
-      await deckQuery.refetch();
+      tasks.push(deckQuery.refetch());
+    }
+    if (typeof playDeckPreviewQuery.refetch === "function") {
+      tasks.push(playDeckPreviewQuery.refetch());
+    }
+    if (tasks.length) {
+      await Promise.all(tasks);
     }
   }
 
@@ -1284,7 +1440,7 @@ export default function PresentationEditor() {
     if (created) {
       const createdSlideId = Number((created as any).id);
       if (Number.isFinite(createdSlideId) && createdSlideId > 0) {
-        setSelectedSlideId(createdSlideId);
+        switchToSlide(createdSlideId);
       }
       setLibraryTab("slides");
     }
@@ -1302,12 +1458,13 @@ export default function PresentationEditor() {
     ));
     const duplicatedSlideId = Number((duplicated as any)?.id);
     if (Number.isFinite(duplicatedSlideId) && duplicatedSlideId > 0) {
-      setSelectedSlideId(duplicatedSlideId);
+      switchToSlide(duplicatedSlideId);
     }
   }
 
   async function handleDeleteSlide() {
     if (!deck || !selectedSlide) return;
+    clearCachedSlideDraft(selectedSlide.id);
     await runDeckMutation(async (expectedVersion) => {
       await deleteSlideMutation.mutateAsync({
         deckId: deck.id,
@@ -1471,6 +1628,44 @@ export default function PresentationEditor() {
     );
   }
 
+  async function handleApplyCanvasPresetAllSlides(presetId: string) {
+    if (!deck || !slides.length || canvasApplyAllPending) {
+      return;
+    }
+    const preset = getCanvasPresetById(presetId);
+    if (!preset) {
+      toast.error("Invalid canvas preset.");
+      return;
+    }
+
+    setCanvasApplyAllPending(true);
+    try {
+      for (const slide of slides) {
+        const baseContent = slide.id === selectedSlide?.id
+          ? draftContent
+          : ensureSlideContent(slide.slideContent);
+        await updateSlideMutation.mutateAsync({
+          deckId: deck.id,
+          slideId: slide.id,
+          expectedVersion: slide.version,
+          saveMode: "manual",
+          title: slide.title,
+          slideContent: resizeCanvas(baseContent, {
+            preset: preset.id,
+            width: preset.width,
+            height: preset.height,
+          }),
+        });
+      }
+      await refreshDeck();
+      toast.success(`Applied canvas ${preset.label} to all slides.`);
+    } catch (error) {
+      toast.error(`Failed to apply canvas size to all slides: ${String((error as Error)?.message || error)}`);
+    } finally {
+      setCanvasApplyAllPending(false);
+    }
+  }
+
   function handleSelectElement(elementId: string, options?: { additive?: boolean }) {
     if (options?.additive) {
       const toggled = SelectionEngine.toggle(
@@ -1487,6 +1682,29 @@ export default function PresentationEditor() {
     executeCommand(selectElementsCommand([elementId]));
   }
 
+  function handleMarqueeSelect(
+    bounds: { x: number; y: number; width: number; height: number },
+    options?: { additive?: boolean },
+  ) {
+    const candidates = draftContent.elements.map((element) => ({
+      id: element.id,
+      x: element.x,
+      y: element.y,
+      width: element.width,
+      height: Math.max(2, element.height),
+    }));
+    const next = SelectionEngine.marquee(
+      { selectedIds: selectedElementIds, activeId: selectedElementId },
+      bounds,
+      candidates,
+      { additive: options?.additive },
+    );
+    const ordered = next.activeId && next.selectedIds.includes(next.activeId)
+      ? [next.activeId, ...next.selectedIds.filter((id) => id !== next.activeId)]
+      : next.selectedIds;
+    executeCommand(selectElementsCommand(ordered));
+  }
+
   function handlePatchSelectedElement(patch: Parameters<typeof patchSelectedElementCommand>[0]) {
     if (!isTouchActionAllowed(40)) {
       return;
@@ -1574,6 +1792,60 @@ export default function PresentationEditor() {
     );
   }
 
+  function cloneElementsForClipboard(elements: PresentationElement[]): PresentationElement[] {
+    return elements.map((element) => JSON.parse(JSON.stringify(element)) as PresentationElement);
+  }
+
+  function handleCopySelection() {
+    if (!selectedElementIds.length) {
+      return;
+    }
+    const selectedIdSet = new Set(selectedElementIds);
+    const ordered = draftContent.elements.filter((element) => selectedIdSet.has(element.id));
+    if (!ordered.length) {
+      return;
+    }
+    elementClipboardRef.current = cloneElementsForClipboard(ordered);
+    clipboardPasteCountRef.current = 0;
+  }
+
+  function handleCutSelection() {
+    if (!selectedElementIds.length) {
+      return;
+    }
+    handleCopySelection();
+    handleDeleteSelection();
+  }
+
+  function handlePasteSelection() {
+    const clipboardElements = elementClipboardRef.current;
+    if (!clipboardElements.length) {
+      return;
+    }
+    const offset = 16 * (clipboardPasteCountRef.current + 1);
+    executeCommand({
+      id: "paste-selection",
+      apply: (state) => {
+        const pasted = clipboardElements.map((source) => ({
+          ...source,
+          id: nextElementId(source.type as PresentationElementType),
+          x: source.x + offset,
+          y: source.y + offset,
+        }));
+        return {
+          ...state,
+          content: {
+            ...state.content,
+            elements: [...state.content.elements, ...pasted],
+          },
+          selectedElementIds: pasted.map((element) => element.id),
+          snapGuides: [],
+        };
+      },
+    });
+    clipboardPasteCountRef.current += 1;
+  }
+
   function handleDeleteSelection() {
     if (!isTouchActionAllowed(40)) {
       return;
@@ -1700,6 +1972,7 @@ export default function PresentationEditor() {
           ? returnedVersion
           : fallbackVersion + 1,
       );
+      clearCachedSlideDraft(selectedSlide.id);
       setConflictPolicy(registerSaveSuccess());
       setSaveState("saved");
     };
@@ -1741,6 +2014,7 @@ export default function PresentationEditor() {
             && isConflictSlideContentEqualDraft(conflict, draftContent)
           ) {
             setExpectedSlideVersion(latestConflictVersion);
+            clearCachedSlideDraft(selectedSlide.id);
             setConflictPolicy(registerSaveSuccess());
             setSaveState("saved");
             return "saved";
@@ -1932,7 +2206,7 @@ export default function PresentationEditor() {
       setRestoreDialogVersionId(null);
       const restoredSlideId = Number((restored as any)?.restoredSlideId);
       if (Number.isFinite(restoredSlideId) && restoredSlideId > 0) {
-        setSelectedSlideId(restoredSlideId);
+        switchToSlide(restoredSlideId);
       }
       setConflictPolicy(releaseStaleBlock());
       setSaveState("saved");
@@ -1947,6 +2221,7 @@ export default function PresentationEditor() {
     setPlaybackState("idle");
     setPlaybackPaused(false);
     setPlaybackSlideIndex(0);
+    previewAudioDeckSignatureRef.current = null;
     if (typeof document !== "undefined") {
       const fullscreenDoc = document as FullscreenCapableDocument;
       if (getCurrentFullscreenElement(fullscreenDoc)) {
@@ -2004,10 +2279,27 @@ export default function PresentationEditor() {
     );
     setPlaybackSlideIndex(startIndex);
     setPlaybackPaused(false);
+    previewAudioDeckSignatureRef.current = null;
+    void playDeckPreviewQuery.refetch();
     setPlaybackState("playing");
     setExportMessage(`Playing slideshow preview with ${slideCount} slides.`);
   }
 
+  function handleOpenPlayMode() {
+    if (!deck) {
+      return;
+    }
+    if (hasUnsavedSlideChanges && typeof window !== "undefined") {
+      const confirmed = window.confirm(
+        "Play Mode shows only saved content. Unsaved edits will not appear. Continue?",
+      );
+      if (!confirmed) {
+        return;
+      }
+    }
+    setLocation(`/presentation/${deck.libraryItemId}/play`);
+  }
+
   async function handleExport(format: "png" | "mp4") {
     if (!deck) return;
     setExportWarnings([]);
@@ -2058,36 +2350,63 @@ export default function PresentationEditor() {
       const hasSelection = selectedElementIds.length > 0;
       const isPrimaryModifier = event.metaKey || event.ctrlKey;
       const key = event.key.toLowerCase();
+      const code = event.code;
+      const isCopyShortcut = isPrimaryModifier && (key === "c" || code === "KeyC");
+      const isCutShortcut = isPrimaryModifier && (key === "x" || code === "KeyX");
+      const isPasteShortcut = isPrimaryModifier && (key === "v" || code === "KeyV");
+      const isUndoShortcut = isPrimaryModifier
+        && !event.shiftKey
+        && (key === "z" || code === "KeyZ");
+      const isRedoShortcut = isPrimaryModifier
+        && (
+          ((key === "z" || code === "KeyZ") && event.shiftKey)
+          || key === "y"
+          || code === "KeyY"
+        );
+
+      if (isCopyShortcut && hasSelection) {
+        event.preventDefault();
+        handleCopySelection();
+        return;
+      }
+
+      if (isCutShortcut && hasSelection) {
+        event.preventDefault();
+        handleCutSelection();
+        return;
+      }
+
+      if (isPasteShortcut) {
+        event.preventDefault();
+        handlePasteSelection();
+        return;
+      }
 
-      if (isPrimaryModifier && (key === "=" || key === "+")) {
+      if (isPrimaryModifier && (key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd")) {
         event.preventDefault();
         updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP);
         return;
       }
 
-      if (isPrimaryModifier && key === "-") {
+      if (isPrimaryModifier && (key === "-" || code === "Minus" || code === "NumpadSubtract")) {
         event.preventDefault();
         updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP);
         return;
       }
 
-      if (isPrimaryModifier && key === "0") {
+      if (isPrimaryModifier && (key === "0" || code === "Digit0" || code === "Numpad0")) {
         event.preventDefault();
         updateDesktopZoom(1);
         return;
       }
 
-      if (isPrimaryModifier && key === "z") {
+      if (isUndoShortcut) {
         event.preventDefault();
-        if (event.shiftKey) {
-          handleRedo();
-        } else {
-          handleUndo();
-        }
+        handleUndo();
         return;
       }
 
-      if (isPrimaryModifier && key === "y") {
+      if (isRedoShortcut) {
         event.preventDefault();
         handleRedo();
         return;
@@ -2129,7 +2448,20 @@ export default function PresentationEditor() {
     return () => {
       window.removeEventListener("keydown", onKeyDown);
     };
-  }, [desktopViewport.scale, isMobileViewport, playbackState, selectedElementIds, handleDeleteSelection, handleDuplicateSelection, handleMoveSelection, handleRedo, handleUndo]);
+  }, [
+    desktopViewport.scale,
+    isMobileViewport,
+    playbackState,
+    selectedElementIds,
+    handleCopySelection,
+    handleCutSelection,
+    handleDeleteSelection,
+    handleDuplicateSelection,
+    handleMoveSelection,
+    handlePasteSelection,
+    handleRedo,
+    handleUndo,
+  ]);
 
   useEffect(() => {
     if (playbackState !== "playing" || playbackPaused) {
@@ -2192,6 +2524,61 @@ export default function PresentationEditor() {
     };
   }, [playbackState, playbackSlides.length]);
 
+  useEffect(() => {
+    if (playbackState !== "playing") {
+      previewAudioPlayerRef.current?.destroy();
+      previewAudioPlayerRef.current = null;
+      previewAudioSlideIndexRef.current = null;
+      previewAudioDeckSignatureRef.current = null;
+      return;
+    }
+
+    const playDeck = playDeckPreviewQuery.data;
+    if (!playDeck) {
+      return;
+    }
+
+    const nextAudioSignature = JSON.stringify({
+      projectAudioTrack: playDeck.projectAudioTrack ?? null,
+      slideAudioTracks: playDeck.slides.map((slide) => slide.audioTrack ?? null),
+    });
+    const shouldRecreatePlayer =
+      !previewAudioPlayerRef.current
+      || previewAudioDeckSignatureRef.current !== nextAudioSignature;
+    if (shouldRecreatePlayer) {
+      previewAudioPlayerRef.current?.destroy();
+      previewAudioPlayerRef.current = new AudioTrackPlayer(playDeck.projectAudioTrack ?? null);
+      previewAudioDeckSignatureRef.current = nextAudioSignature;
+      previewAudioSlideIndexRef.current = null;
+    }
+
+    const player = previewAudioPlayerRef.current;
+    if (!player) {
+      return;
+    }
+
+    if (previewAudioSlideIndexRef.current !== playbackSlideIndex) {
+      const audioTrack = (playDeck.slides[playbackSlideIndex] as any)?.audioTrack ?? null;
+      player.onSlideEnter(audioTrack);
+      previewAudioSlideIndexRef.current = playbackSlideIndex;
+    }
+
+    if (playbackPaused) {
+      player.pause();
+    } else {
+      player.resume();
+    }
+  }, [playDeckPreviewQuery.data, playbackPaused, playbackSlideIndex, playbackState]);
+
+  useEffect(() => {
+    return () => {
+      previewAudioPlayerRef.current?.destroy();
+      previewAudioPlayerRef.current = null;
+      previewAudioSlideIndexRef.current = null;
+      previewAudioDeckSignatureRef.current = null;
+    };
+  }, []);
+
   const deckNotFound = Boolean(deckQuery.error && isNotFoundError(deckQuery.error));
 
   useEffect(() => {
@@ -2272,10 +2659,17 @@ export default function PresentationEditor() {
   }, [playbackState, isPlaybackFullscreen]);
 
   function handleBackToPresentationLibrary() {
+    if (hasUnsavedSlideChanges && typeof window !== "undefined") {
+      const confirmed = window.confirm(UNSAVED_PRESENTATION_WARNING);
+      if (!confirmed) {
+        return;
+      }
+    }
     setLocation("/presentations");
   }
 
   async function handleReloadLatestSlide() {
+    clearCachedSlideDraft(selectedSlideId);
     await refreshDeck();
     setConflictPolicy(releaseStaleBlock());
     setSaveState("idle");
@@ -2391,8 +2785,11 @@ export default function PresentationEditor() {
     <div className="flex h-full min-h-0 flex-col">
       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
         {slides.map((slide) => {
+          const cachedContent = slideDraftCacheRef.current.get(slide.id);
           const preview = summarizeSlidePreview(
-            selectedSlideId === slide.id ? draftContent : slide.slideContent,
+            selectedSlideId === slide.id
+              ? draftContent
+              : cachedContent ?? ensureSlideContent(slide.slideContent),
           );
           return (
             <button
@@ -2402,7 +2799,7 @@ export default function PresentationEditor() {
                 ? "border-sky-400 bg-sky-500/10 text-sky-800"
                 : "border-slate-300 bg-white hover:border-slate-400"
                 }`}
-              onClick={() => setSelectedSlideId(slide.id)}
+              onClick={() => switchToSlide(slide.id)}
               aria-label={`Select slide ${slide.orderIndex + 1}`}
               data-testid={`slide-preview-${slide.orderIndex + 1}`}
             >
@@ -2849,7 +3246,7 @@ export default function PresentationEditor() {
         >
           Element Borders: {showElementFrames ? "On" : "Off"}
         </Button>
-        <label className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
+        <div className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
           <Crop className="h-3 w-3" />
           <span>Canvas</span>
           <select
@@ -2864,7 +3261,18 @@ export default function PresentationEditor() {
               </option>
             ))}
           </select>
-        </label>
+          <Button
+            type="button"
+            size="sm"
+            variant="outline"
+            className="h-6 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100 hover:bg-slate-800"
+            onClick={() => void handleApplyCanvasPresetAllSlides(activeCanvasSize.preset)}
+            disabled={!slides.length || canvasApplyAllPending}
+            aria-label="Apply Canvas Aspect Ratio to All Slides"
+          >
+            {canvasApplyAllPending ? "Applying..." : "Apply All"}
+          </Button>
+        </div>
         <div className="flex items-center gap-0.5 rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5">
           <Button
             variant="ghost"
@@ -2895,11 +3303,25 @@ export default function PresentationEditor() {
         </div>
       </div>
       <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-1">
-        <Button onClick={handleUndo} aria-label="Undo Edit" variant="outline" size="sm" className="gap-1 text-xs">
+        <Button
+          onClick={handleUndo}
+          aria-label="Undo Edit"
+          title="Undo (Ctrl/Cmd+Z)"
+          variant="outline"
+          size="sm"
+          className="gap-1 text-xs"
+        >
           <Undo2 className="h-3.5 w-3.5" />
           Undo
         </Button>
-        <Button onClick={handleRedo} aria-label="Redo Edit" variant="outline" size="sm" className="gap-1 text-xs">
+        <Button
+          onClick={handleRedo}
+          aria-label="Redo Edit"
+          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
+          variant="outline"
+          size="sm"
+          className="gap-1 text-xs"
+        >
           <Redo2 className="h-3.5 w-3.5" />
           Redo
         </Button>
@@ -2955,7 +3377,7 @@ export default function PresentationEditor() {
       ) : null}
     </div>
   );
-  const autoDurationFromSlideAudioSec = useMemo(() => {
+  const autoDurationFromSlideAudioSec = (() => {
     if (!selectedSlideAudioTrack) {
       return null;
     }
@@ -2968,33 +3390,47 @@ export default function PresentationEditor() {
       return Math.max(0.25, selectedSlideAudioDurationSec - startSec);
     }
     return null;
-  }, [selectedSlideAudioDurationSec, selectedSlideAudioTrack]);
+  })();
   const autoDurationFromVideoSec = selectedSlideVideoDurationSec != null
     ? Math.max(0.25, selectedSlideVideoDurationSec)
     : null;
+  const autoDurationFromMediaSec = autoDurationFromSlideAudioSec ?? autoDurationFromVideoSec;
   const propertyEditorPanel = (
     <div className="space-y-3">
       {!isMobileViewport ? (
         <label className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
           <span className="font-medium">Canvas Size</span>
-          <select
-            aria-label="Canvas Aspect Ratio (Properties)"
-            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none"
-            value={activeCanvasSize.preset}
-            onChange={(event) => handleChangeCanvasPreset(event.target.value)}
-          >
-            {PRESENTATION_CANVAS_PRESETS.map((preset) => (
-              <option key={preset.id} value={preset.id}>
-                {preset.label}
-              </option>
-            ))}
-          </select>
+          <div className="flex items-center gap-1.5">
+            <select
+              aria-label="Canvas Aspect Ratio (Properties)"
+              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none"
+              value={activeCanvasSize.preset}
+              onChange={(event) => handleChangeCanvasPreset(event.target.value)}
+            >
+              {PRESENTATION_CANVAS_PRESETS.map((preset) => (
+                <option key={preset.id} value={preset.id}>
+                  {preset.label}
+                </option>
+              ))}
+            </select>
+            <Button
+              type="button"
+              size="sm"
+              variant="outline"
+              className="h-7 px-2 text-[11px]"
+              onClick={() => void handleApplyCanvasPresetAllSlides(activeCanvasSize.preset)}
+              disabled={!slides.length || canvasApplyAllPending}
+              aria-label="Apply Canvas Size to All Slides"
+            >
+              {canvasApplyAllPending ? "Applying..." : "Apply All"}
+            </Button>
+          </div>
         </label>
       ) : null}
       <div className="rounded-md border border-slate-300 bg-white p-2">
         <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Slide Timing</p>
         <p className="mt-1 text-[11px] text-slate-500">
-          Set seconds per slide, apply to current slide, or apply to all slides.
+          Set seconds per slide, apply to current slide/all slides, or fit to media end.
         </p>
         <div className="mt-2 flex items-center gap-2">
           <Input
@@ -3027,6 +3463,19 @@ export default function PresentationEditor() {
           >
             {timingApplyAllPending ? "Applying..." : "Apply All Slides"}
           </Button>
+          <Button
+            size="sm"
+            variant="ghost"
+            className="h-7 text-xs"
+            disabled={autoDurationFromMediaSec == null}
+            onClick={() => {
+              if (autoDurationFromMediaSec == null) return;
+              setTimingDurationSecInput(autoDurationFromMediaSec.toFixed(1).replace(/\.0$/, ""));
+              applyDurationToSelectedDraft(Math.round(autoDurationFromMediaSec * 1000));
+            }}
+          >
+            Auto: Play To End
+          </Button>
           <Button
             size="sm"
             variant="ghost"
@@ -3075,6 +3524,7 @@ export default function PresentationEditor() {
       <PropertyPanel
         selectedElement={selectedElement}
         selectedElementCount={selectedElementIds.length}
+        selectionHasMixedTypes={selectionHasMixedTypes}
         onPatchSelected={handlePatchSelectedElement}
         onPatchElementById={handlePatchElementById}
       />
@@ -3358,7 +3808,7 @@ export default function PresentationEditor() {
             onClick={() => void handleSaveSlide()}
             aria-label="Save Slide"
             size="sm"
-            className="gap-1"
+            className="gap-1 bg-sky-600 text-white hover:bg-sky-500"
             disabled={!deck || !selectedSlide || saveState === "pending"}
           >
             <Save className="h-3.5 w-3.5" />
@@ -3369,13 +3819,19 @@ export default function PresentationEditor() {
             aria-label="Save to Template"
             variant="outline"
             size="sm"
-            className="gap-1"
+            className="gap-1 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
             disabled={!deck || saveAsTemplateMutation.isPending || isProjectTitleSaving}
           >
             <BookMarked className="h-3.5 w-3.5" />
             <span className="hidden lg:inline">Template</span>
           </Button>
-          <Button onClick={handlePlaySlideshow} aria-label="Play Slideshow" variant="secondary" size="sm" className="gap-1">
+          <Button
+            onClick={handlePlaySlideshow}
+            aria-label="Play Slideshow"
+            variant="secondary"
+            size="sm"
+            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
+          >
             <Play className="h-3.5 w-3.5" />
             <span className="hidden sm:inline">Play</span>
           </Button>
@@ -3385,7 +3841,7 @@ export default function PresentationEditor() {
             title="Import a file to create a new presentation"
             variant="secondary"
             size="sm"
-            className="gap-1"
+            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
           >
             <Upload className="h-3.5 w-3.5" />
             <span className="hidden sm:inline">Import</span>
@@ -3396,7 +3852,7 @@ export default function PresentationEditor() {
               aria-label="Draft with AI"
               variant="secondary"
               size="sm"
-              className="gap-1"
+              className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
               disabled={!deck}
             >
               <Sparkles className="h-3.5 w-3.5" />
@@ -3408,18 +3864,18 @@ export default function PresentationEditor() {
             aria-label="Export"
             variant="secondary"
             size="sm"
-            className="gap-1"
+            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
             disabled={!isExportsEnabled || !deck}
           >
             <Download className="h-3.5 w-3.5" />
             <span className="hidden sm:inline">Export</span>
           </Button>
           <Button
-            onClick={() => setLocation(`/presentation/${deck.libraryItemId}/play`)}
+            onClick={handleOpenPlayMode}
             aria-label="Play Mode"
             variant="secondary"
             size="sm"
-            className="gap-1"
+            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
             disabled={!deck}
           >
             <Play className="h-3.5 w-3.5" />
@@ -3452,6 +3908,7 @@ export default function PresentationEditor() {
               onDragEnd={handleDragEnd}
               onArrangeSelection={handleArrangeSelection}
               onDropAsset={handleCanvasDropAsset}
+              onMarqueeSelect={handleMarqueeSelect}
             />
           )}
           canvasFooter={canvasFooter}
diff --git a/apps/web/client/src/pages/PresentationPlayMode.test.tsx b/apps/web/client/src/pages/PresentationPlayMode.test.tsx
index 7c48069..3b45ffc 100644
--- a/apps/web/client/src/pages/PresentationPlayMode.test.tsx
+++ b/apps/web/client/src/pages/PresentationPlayMode.test.tsx
@@ -80,6 +80,7 @@ vi.mock("@/contexts/AuthContext", () => ({
 
 const queryState = {
   playDeck: null as ReturnType<typeof buildPlayDeck> | null,
+  deckDetail: null as ReturnType<typeof buildDeckDetail> | null,
   isLoading: false,
   isError: false,
 };
@@ -95,6 +96,14 @@ vi.mock("@/lib/trpc", () => ({
           error: queryState.isError ? new Error("Not found") : null,
         })),
       },
+      getDeckByLibraryItem: {
+        useQuery: vi.fn(() => ({
+          data: queryState.deckDetail,
+          isLoading: queryState.isLoading,
+          isError: queryState.isError,
+          error: queryState.isError ? new Error("Not found") : null,
+        })),
+      },
     },
   },
 }));
@@ -111,27 +120,49 @@ function buildPlayDeck() {
     projectAudioTrack: null,
     slides: [
       {
-        id: 71,
+        slideId: 71,
         orderIndex: 0,
         title: "Intro",
         transition: "cut",
         durationMs: 3000,
-        slideContent: { elements: [] },
         audioTrack: null,
       },
       {
-        id: 72,
+        slideId: 72,
         orderIndex: 1,
         title: "Agenda",
         transition: "fade",
         durationMs: 3000,
-        slideContent: { elements: [] },
         audioTrack: null,
       },
     ],
   };
 }
 
+function buildDeckDetail() {
+  return {
+    deck: {
+      id: 7,
+      libraryItemId: 42,
+      title: "Test Deck",
+    },
+    slides: [
+      {
+        id: 71,
+        orderIndex: 0,
+        title: "Intro",
+        slideContent: { elements: [] },
+      },
+      {
+        id: 72,
+        orderIndex: 1,
+        title: "Agenda",
+        slideContent: { elements: [] },
+      },
+    ],
+  };
+}
+
 // ---------------------------------------------------------------------------
 // Import (after mocks)
 // ---------------------------------------------------------------------------
@@ -147,6 +178,7 @@ describe("PresentationPlayMode", () => {
     vi.clearAllMocks();
     capturedOnStateChange = null;
     queryState.playDeck = buildPlayDeck();
+    queryState.deckDetail = buildDeckDetail();
     queryState.isLoading = false;
     queryState.isError = false;
 
@@ -233,10 +265,10 @@ describe("PresentationPlayMode", () => {
     expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
   });
 
-  it("pressing Escape when not in fullscreen navigates back to /presentations", () => {
+  it("pressing Escape when not in fullscreen navigates back to editor route", () => {
     render(<PresentationPlayMode />);
     fireEvent.keyDown(window, { key: "Escape" });
-    expect(mockSetLocation).toHaveBeenCalledWith("/presentations");
+    expect(mockSetLocation).toHaveBeenCalledWith("/presentation-editor/42");
   });
 
   it("slide counter shows '1 / N' format", () => {
diff --git a/apps/web/client/src/pages/PresentationPlayMode.tsx b/apps/web/client/src/pages/PresentationPlayMode.tsx
index 563ab37..dfce37c 100644
--- a/apps/web/client/src/pages/PresentationPlayMode.tsx
+++ b/apps/web/client/src/pages/PresentationPlayMode.tsx
@@ -1,12 +1,14 @@
-import { useCallback, useEffect, useRef, useState } from "react";
+import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { useLocation, useRoute } from "wouter";
-import { Loader2, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
+import { ChevronLeft, Loader2, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { trpc } from "@/lib/trpc";
 import { PlaybackEngine, type PlaybackState } from "@/presentation-canvas/play/PlaybackEngine";
 import { AudioTrackPlayer } from "@/presentation-canvas/play/AudioTrackPlayer";
 import { CanvasStage } from "@/presentation-canvas";
 import { normalizeCanvasSize } from "@/presentation-canvas/constants";
+import { ensureSlideContent } from "@/lib/presentationEditorState";
+import { Button } from "@/components/ui/button";
 
 const PLAY_MODE_ROUTE = "/presentation/:itemId/play";
 
@@ -15,6 +17,13 @@ export default function PresentationPlayMode() {
   const [, routeParams] = useRoute(PLAY_MODE_ROUTE);
   const itemId = routeParams?.itemId ? parseInt(routeParams.itemId, 10) : null;
   const validItemId = itemId !== null && Number.isFinite(itemId) ? itemId : null;
+  const navigateBackToEditor = useCallback(() => {
+    if (validItemId) {
+      setLocation(`/presentation-editor/${validItemId}`);
+      return;
+    }
+    setLocation("/presentations");
+  }, [setLocation, validItemId]);
 
   // -------------------------------------------------------------------------
   // Data
@@ -24,6 +33,38 @@ export default function PresentationPlayMode() {
     { itemId: validItemId! },
     { enabled: Boolean(validItemId) },
   );
+  const deckDetailQuery = trpc.presentation.getDeckByLibraryItem.useQuery(
+    { libraryItemId: validItemId! },
+    { enabled: Boolean(validItemId) },
+  );
+
+  const playbackSlides = useMemo(() => {
+    if (!playDeck) {
+      return [];
+    }
+    const detailSlidesRaw = Array.isArray((deckDetailQuery.data as any)?.slides)
+      ? (deckDetailQuery.data as any).slides
+      : [];
+    const detailSlideMap = new Map<number, any>();
+    for (const detailSlide of detailSlidesRaw) {
+      const detailId = Number((detailSlide as any)?.id);
+      if (Number.isFinite(detailId) && detailId > 0) {
+        detailSlideMap.set(detailId, detailSlide);
+      }
+    }
+
+    return playDeck.slides.map((slide: any) => {
+      const resolvedSlideId = Number(slide.slideId ?? slide.id);
+      const detailSlide = Number.isFinite(resolvedSlideId)
+        ? detailSlideMap.get(resolvedSlideId)
+        : null;
+      return {
+        ...slide,
+        slideId: Number.isFinite(resolvedSlideId) ? resolvedSlideId : 0,
+        slideContent: detailSlide?.slideContent ?? slide.slideContent ?? { elements: [] },
+      };
+    });
+  }, [deckDetailQuery.data, playDeck]);
 
   // Detect feature-disabled errors (FORBIDDEN with FEATURE_DISABLED code)
   const isFeatureDisabled =
@@ -62,12 +103,12 @@ export default function PresentationPlayMode() {
   // -------------------------------------------------------------------------
 
   useEffect(() => {
-    if (!playDeck) return;
+    if (!playDeck || !playbackSlides.length) return;
 
     audioRef.current = new AudioTrackPlayer(playDeck.projectAudioTrack ?? null);
 
     engineRef.current = new PlaybackEngine(
-      playDeck.slides,
+      playbackSlides,
       (newState: PlaybackState, newIndex: number) => {
         setPlaybackState(newState);
         setCurrentIndex(newIndex);
@@ -77,7 +118,7 @@ export default function PresentationPlayMode() {
         }
         if (newState === "PLAYING") {
           // Enter the new slide (newIndex is now the new slide)
-          audioRef.current?.onSlideEnter((playDeck.slides[newIndex] as any)?.audioTrack ?? null);
+          audioRef.current?.onSlideEnter((playbackSlides[newIndex] as any)?.audioTrack ?? null);
           audioRef.current?.resume();
         }
         if (newState === "PAUSED") {
@@ -96,7 +137,7 @@ export default function PresentationPlayMode() {
       audioRef.current = null;
       if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
     };
-  }, [playDeck, resetHideTimer]);
+  }, [playDeck, playbackSlides, resetHideTimer]);
 
   // -------------------------------------------------------------------------
   // Keyboard shortcuts
@@ -131,8 +172,7 @@ export default function PresentationPlayMode() {
           if (document.fullscreenElement) {
             document.exitFullscreen();
           } else {
-            // M2: navigate back when not in fullscreen
-            setLocation("/presentations");
+            navigateBackToEditor();
           }
           break;
       }
@@ -140,13 +180,13 @@ export default function PresentationPlayMode() {
 
     window.addEventListener("keydown", handleKeyDown);
     return () => window.removeEventListener("keydown", handleKeyDown);
-  }, [playbackState, setLocation]);
+  }, [navigateBackToEditor, playbackState]);
 
   // -------------------------------------------------------------------------
   // Loading state
   // -------------------------------------------------------------------------
 
-  if (isLoading || (!playDeck && !isError && validItemId)) {
+  if (isLoading || deckDetailQuery.isLoading || (!playDeck && !isError && validItemId)) {
     return (
       <div className="fixed inset-0 bg-black flex items-center justify-center">
         <Loader2 className="h-12 w-12 text-white animate-spin" aria-label="Loading" role="status" />
@@ -165,7 +205,7 @@ export default function PresentationPlayMode() {
         <p className="text-gray-400 text-sm">This feature has not been enabled for your account.</p>
         <button
           className="text-white underline"
-          onClick={() => setLocation("/presentations")}
+          onClick={navigateBackToEditor}
           aria-label="Go back to presentations"
         >
           Go Back
@@ -174,13 +214,13 @@ export default function PresentationPlayMode() {
     );
   }
 
-  if (isError || !validItemId || !playDeck) {
+  if (isError || deckDetailQuery.isError || !validItemId || !playDeck) {
     return (
       <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
         <p className="text-white text-lg">Failed to load presentation.</p>
         <button
           className="text-white underline"
-          onClick={() => setLocation("/presentations")}
+          onClick={navigateBackToEditor}
           aria-label="Go back to presentations"
         >
           Go Back
@@ -193,7 +233,7 @@ export default function PresentationPlayMode() {
   // Empty slides
   // -------------------------------------------------------------------------
 
-  if (playDeck.slides.length === 0) {
+  if (playbackSlides.length === 0) {
     return (
       <div className="fixed inset-0 bg-black flex items-center justify-center">
         <p className="text-white">No slides in this presentation.</p>
@@ -205,8 +245,9 @@ export default function PresentationPlayMode() {
   // Render helpers
   // -------------------------------------------------------------------------
 
-  const currentSlide = playDeck.slides[currentIndex] ?? null;
-  const canvasSize = normalizeCanvasSize((currentSlide as any)?.slideContent?.canvas ?? null);
+  const currentSlide = playbackSlides[currentIndex] ?? null;
+  const normalizedSlideContent = ensureSlideContent((currentSlide as any)?.slideContent ?? { elements: [] });
+  const canvasSize = normalizeCanvasSize(normalizedSlideContent.canvas);
   // L1: respect slide transition type for CSS animation
   const transitionType = (currentSlide as any)?.transition ?? "fade";
   const isPlaying = playbackState === "PLAYING";
@@ -220,6 +261,18 @@ export default function PresentationPlayMode() {
       className="fixed inset-0 bg-black flex items-center justify-center"
       onMouseMove={resetHideTimer}
     >
+      <div className="fixed left-3 top-3 z-20">
+        <Button
+          size="sm"
+          variant="secondary"
+          className="gap-1 bg-black/60 text-white hover:bg-black/75"
+          onClick={navigateBackToEditor}
+          aria-label="Back to editor"
+        >
+          <ChevronLeft className="h-4 w-4" />
+          Back to Editor
+        </Button>
+      </div>
       {/* Slide canvas — key change triggers CSS fade on slide transition */}
       <div
         key={currentIndex}
@@ -229,21 +282,24 @@ export default function PresentationPlayMode() {
         )}
         style={{ opacity: playbackState === "SLIDE_TRANSITIONING" ? 0 : 1 }}
       >
-        {/* H2: showTransformDock=false + suppressTransformHandles=true for read-only play mode */}
-        {/* H3: no viewport prop — CanvasStage handles its own fit via ResizeObserver */}
-        <CanvasStage
-          elements={(currentSlide as any)?.slideContent?.elements ?? []}
-          canvasSize={canvasSize}
-          selectedElementIds={[]}
-          snapGuides={[]}
-          showTransformDock={false}
-          suppressTransformHandles={true}
-          onSelectElement={() => {}}
-          onMoveSelection={() => {}}
-          onResizeSelection={() => {}}
-          onRotateSelection={() => {}}
-          onArrangeSelection={() => {}}
-        />
+        <div className="h-full w-full p-3 md:p-5">
+          {/* H2: showTransformDock=false + suppressTransformHandles=true for read-only play mode */}
+          {/* H3: no viewport prop — CanvasStage handles its own fit via ResizeObserver */}
+          <CanvasStage
+            elements={normalizedSlideContent.elements}
+            canvasSize={canvasSize}
+            selectedElementIds={[]}
+            snapGuides={[]}
+            showElementFrames={false}
+            showTransformDock={false}
+            suppressTransformHandles={true}
+            onSelectElement={() => {}}
+            onMoveSelection={() => {}}
+            onResizeSelection={() => {}}
+            onRotateSelection={() => {}}
+            onArrangeSelection={() => {}}
+          />
+        </div>
       </div>
 
       {/* Controls overlay — auto-hides after 3s of inactivity */}
@@ -286,7 +342,7 @@ export default function PresentationPlayMode() {
 
         {/* Center: Slide counter */}
         <span className="text-white text-sm font-medium tabular-nums">
-          {currentIndex + 1} / {playDeck.slides.length}
+          {currentIndex + 1} / {playbackSlides.length}
         </span>
 
         {/* Right: Fullscreen toggle */}
diff --git a/apps/web/client/src/presentation-canvas/CanvasStage.tsx b/apps/web/client/src/presentation-canvas/CanvasStage.tsx
index a9812f1..dd7e7b2 100644
--- a/apps/web/client/src/presentation-canvas/CanvasStage.tsx
+++ b/apps/web/client/src/presentation-canvas/CanvasStage.tsx
@@ -37,6 +37,10 @@ interface CanvasStageProps {
   onArrangeSelection: (direction: ArrangeDirection) => void;
   onDragEnd?: () => void;
   onDropAsset?: (payload: CanvasStageDropAssetPayload) => void;
+  onMarqueeSelect?: (
+    bounds: { x: number; y: number; width: number; height: number },
+    options?: { additive?: boolean },
+  ) => void;
 }
 
 export const CANVAS_LIBRARY_ASSET_DRAG_MIME = "application/x-smartspec-canvas-library-asset-v1";
@@ -58,6 +62,34 @@ const MAX_STAGE_ZOOM = 2;
 const STAGE_ZOOM_STEP = 0.1;
 const TRANSFORM_DOCK_WIDTH = 228;
 
+interface MarqueeDragState {
+  pointerId: number;
+  startCanvasX: number;
+  startCanvasY: number;
+  currentCanvasX: number;
+  currentCanvasY: number;
+  additive: boolean;
+  captureTarget: HTMLDivElement;
+}
+
+function normalizeMarqueeBounds(
+  startX: number,
+  startY: number,
+  endX: number,
+  endY: number,
+): { x: number; y: number; width: number; height: number } {
+  const left = Math.min(startX, endX);
+  const right = Math.max(startX, endX);
+  const top = Math.min(startY, endY);
+  const bottom = Math.max(startY, endY);
+  return {
+    x: left,
+    y: top,
+    width: Math.max(0, right - left),
+    height: Math.max(0, bottom - top),
+  };
+}
+
 export function CanvasStage({
   elements,
   canvasSize,
@@ -75,6 +107,7 @@ export function CanvasStage({
   onArrangeSelection,
   onDragEnd,
   onDropAsset,
+  onMarqueeSelect,
 }: CanvasStageProps) {
   const [isDragOver, setIsDragOver] = useState(false);
   const [viewportSize, setViewportSize] = useState({ width: 1200, height: 680 });
@@ -88,6 +121,13 @@ export function CanvasStage({
     startOffsetY: number;
   } | null>(null);
   const panCaptureTargetRef = useRef<HTMLDivElement | null>(null);
+  const marqueeStateRef = useRef<MarqueeDragState | null>(null);
+  const [marqueeBounds, setMarqueeBounds] = useState<{
+    x: number;
+    y: number;
+    width: number;
+    height: number;
+  } | null>(null);
 
   const effectiveScale = viewport?.scale ?? 1;
   const offsetX = viewport?.offsetX ?? 0;
@@ -185,9 +225,40 @@ export function CanvasStage({
       }
     }
 
+    function clearMarqueeState(pointerId?: number) {
+      const marqueeState = marqueeStateRef.current;
+      if (marqueeState && (pointerId == null || marqueeState.pointerId === pointerId)) {
+        const captureTarget = marqueeState.captureTarget;
+        if (captureTarget && captureTarget.hasPointerCapture?.(marqueeState.pointerId)) {
+          captureTarget.releasePointerCapture?.(marqueeState.pointerId);
+        }
+        marqueeStateRef.current = null;
+      }
+      setMarqueeBounds(null);
+    }
+
     function handlePointerMove(event: PointerEvent) {
       const panState = panStateRef.current;
       if (!panState || panState.pointerId !== event.pointerId || !viewport || !onViewportChange) {
+        const marqueeState = marqueeStateRef.current;
+        if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
+          return;
+        }
+        const point = toCanvasCoordinates(
+          marqueeState.captureTarget,
+          event.clientX,
+          event.clientY,
+        );
+        marqueeState.currentCanvasX = point.x;
+        marqueeState.currentCanvasY = point.y;
+        setMarqueeBounds(
+          normalizeMarqueeBounds(
+            marqueeState.startCanvasX,
+            marqueeState.startCanvasY,
+            marqueeState.currentCanvasX,
+            marqueeState.currentCanvasY,
+          ),
+        );
         return;
       }
 
@@ -206,6 +277,17 @@ export function CanvasStage({
     }
 
     function handlePointerUp(event: PointerEvent) {
+      const marqueeState = marqueeStateRef.current;
+      if (marqueeState && marqueeState.pointerId === event.pointerId) {
+        const bounds = normalizeMarqueeBounds(
+          marqueeState.startCanvasX,
+          marqueeState.startCanvasY,
+          marqueeState.currentCanvasX,
+          marqueeState.currentCanvasY,
+        );
+        clearMarqueeState(event.pointerId);
+        onMarqueeSelect?.(bounds, { additive: marqueeState.additive });
+      }
       clearPanState(event.pointerId);
     }
 
@@ -215,11 +297,12 @@ export function CanvasStage({
 
     return () => {
       clearPanState();
+      clearMarqueeState();
       window.removeEventListener("pointermove", handlePointerMove);
       window.removeEventListener("pointerup", handlePointerUp);
       window.removeEventListener("pointercancel", handlePointerUp);
     };
-  }, [onViewportChange, viewport]);
+  }, [canvasHeight, canvasWidth, interactionScale, offsetX, offsetY, onMarqueeSelect, onViewportChange, viewport]);
 
   function parseDroppedAsset(raw: string): CanvasStageDroppedAsset | null {
     if (!raw) {
@@ -247,6 +330,20 @@ export function CanvasStage({
     }
   }
 
+  function toCanvasCoordinates(
+    container: HTMLDivElement,
+    clientX: number,
+    clientY: number,
+  ): { x: number; y: number } {
+    const rect = container.getBoundingClientRect();
+    const x = (clientX - rect.left - offsetX) / interactionScale;
+    const y = (clientY - rect.top - offsetY) / interactionScale;
+    return {
+      x: Math.max(0, Math.min(canvasWidth, x)),
+      y: Math.max(0, Math.min(canvasHeight, y)),
+    };
+  }
+
   function handleDragEnter(event: DragEvent<HTMLDivElement>) {
     if (!onDropAsset) {
       return;
@@ -316,16 +413,45 @@ export function CanvasStage({
     const isMiddleButton = event.button === 1;
     const isRightButton = event.button === 2;
     const isModifierPan = isLeftButton && event.altKey;
-    if (!viewport || !onViewportChange || viewport.scale <= 1) {
-      return;
-    }
     if (!isLeftButton && !isMiddleButton && !isRightButton) {
       return;
     }
 
     const target = event.target as HTMLElement | null;
     const clickedCanvasObject = Boolean(target?.closest("[data-canvas-object='true']"));
-    if (isLeftButton && clickedCanvasObject && !isModifierPan) {
+    if (isLeftButton && clickedCanvasObject && !isModifierPan && !event.shiftKey) {
+      return;
+    }
+
+    if (
+      isLeftButton
+      && !clickedCanvasObject
+      && !isModifierPan
+      && onMarqueeSelect
+      && (!viewport || viewport.scale <= 1 || event.shiftKey)
+    ) {
+      const point = toCanvasCoordinates(event.currentTarget, event.clientX, event.clientY);
+      marqueeStateRef.current = {
+        pointerId: event.pointerId,
+        startCanvasX: point.x,
+        startCanvasY: point.y,
+        currentCanvasX: point.x,
+        currentCanvasY: point.y,
+        additive: event.shiftKey,
+        captureTarget: event.currentTarget,
+      };
+      setMarqueeBounds({
+        x: point.x,
+        y: point.y,
+        width: 0,
+        height: 0,
+      });
+      event.currentTarget.setPointerCapture?.(event.pointerId);
+      event.preventDefault();
+      return;
+    }
+
+    if (!viewport || !onViewportChange || viewport.scale <= 1) {
       return;
     }
 
@@ -405,7 +531,7 @@ export function CanvasStage({
       <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
         {viewport ? (
           <p data-testid="canvas-stage-viewport">
-            viewport: {effectiveScale.toFixed(2)}x ({Math.round(offsetX)}, {Math.round(offsetY)})
+            viewport: {effectiveScale.toFixed(2)}x ({Math.round(offsetX)}, {Math.round(offsetY)}) · {Math.round(effectiveScale * 100)}%
           </p>
         ) : (
           <span />
@@ -500,6 +626,18 @@ export function CanvasStage({
                       canvasHeight={canvasHeight}
                       showElementFrames={showElementFrames}
                     />
+                    {marqueeBounds ? (
+                      <div
+                        data-testid="canvas-stage-marquee"
+                        className="pointer-events-none absolute border border-sky-500 bg-sky-400/20"
+                        style={{
+                          left: `${marqueeBounds.x}px`,
+                          top: `${marqueeBounds.y}px`,
+                          width: `${marqueeBounds.width}px`,
+                          height: `${marqueeBounds.height}px`,
+                        }}
+                      />
+                    ) : null}
                     {isDragOver ? (
                       <div className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-dashed border-sky-400 bg-sky-500/15 text-sm font-medium text-sky-700">
                         Drop media to insert
@@ -563,7 +701,7 @@ export function CanvasStage({
 
         {effectiveScale > 1 ? (
           <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
-            Scroll to zoom. Pan: drag empty area, Alt+drag, or right/middle-mouse drag.
+            Scroll to zoom. Pan: drag empty area, Alt+drag, or right/middle-mouse drag. Select: Shift+drag marquee.
           </p>
         ) : null}
       </div>
diff --git a/apps/web/client/src/presentation-canvas/commands/commands.test.ts b/apps/web/client/src/presentation-canvas/commands/commands.test.ts
index 5cb3795..636a814 100644
--- a/apps/web/client/src/presentation-canvas/commands/commands.test.ts
+++ b/apps/web/client/src/presentation-canvas/commands/commands.test.ts
@@ -123,7 +123,7 @@ describe("commands", () => {
     const bus = new CommandBus(
       createCanvasCommandState({
         elements: [
-          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827" },
+          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827", fontSize: 40 },
           { id: "b", type: "rect", x: 200, y: 120, width: 60, height: 30, fill: "#93c5fd" },
           { id: "c", type: "rect", x: 320, y: 180, width: 80, height: 20, fill: "#60a5fa" },
         ],
@@ -132,7 +132,7 @@ describe("commands", () => {
 
     bus.execute(resizeSelectionCommand(150, 80));
     const next = bus.getState().content.elements;
-    expect(next.find((element) => element.id === "a")).toMatchObject({ width: 150, height: 80 });
+    expect(next.find((element) => element.id === "a")).toMatchObject({ width: 150, height: 80, fontSize: 60 });
     expect(next.find((element) => element.id === "b")).toMatchObject({ width: 90, height: 60 });
     expect(next.find((element) => element.id === "c")).toMatchObject({ width: 120, height: 40 });
   });
diff --git a/apps/web/client/src/presentation-canvas/commands/commands.ts b/apps/web/client/src/presentation-canvas/commands/commands.ts
index c4976d8..b016a43 100644
--- a/apps/web/client/src/presentation-canvas/commands/commands.ts
+++ b/apps/web/client/src/presentation-canvas/commands/commands.ts
@@ -253,15 +253,21 @@ export function resizeSelectionCommand(
 
       const ratioX = nextWidth / Math.max(1, primary.width);
       const ratioY = nextHeight / Math.max(1, primary.height);
+      const textScaleRatio = Math.max(0.1, Math.min(ratioX, ratioY));
       const selected = new Set(state.selectedElementIds);
       const nextElements = state.content.elements.map((element) => {
         if (!selected.has(element.id)) {
           return element;
         }
+        const isTextElement = element.type === "text";
+        const currentFontSize = isTextElement && Number.isFinite(element.fontSize)
+          ? Number(element.fontSize)
+          : 48;
         return {
           ...element,
           width: Math.max(0, Math.round(element.width * ratioX)),
           height: Math.max(0, Math.round(element.height * ratioY)),
+          ...(isTextElement ? { fontSize: Math.max(6, Math.round(currentFontSize * textScaleRatio)) } : {}),
         } as PresentationElement;
       });
 
diff --git a/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx b/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx
index 1f22c53..0be3c61 100644
--- a/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx
+++ b/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx
@@ -22,6 +22,7 @@ import { cn } from "@/lib/utils";
 interface PropertyPanelProps {
   selectedElement: PresentationElement | null;
   selectedElementCount?: number;
+  selectionHasMixedTypes?: boolean;
   onPatchSelected: (patch: PresentationElementPatch) => void;
   onPatchElementById?: (elementId: string, patch: PresentationElementPatch) => void;
 }
@@ -523,6 +524,7 @@ function ToolbarButton({
 export function PropertyPanel({
   selectedElement,
   selectedElementCount = 0,
+  selectionHasMixedTypes = false,
   onPatchSelected,
   onPatchElementById,
 }: PropertyPanelProps) {
@@ -686,6 +688,7 @@ export function PropertyPanel({
   // Text-element specific derived values (safe to compute; guarded by type check below)
   const textEl = selectedElement.type === "text" ? selectedElement : null;
   const isMultiSelection = selectedElementCount > 1;
+  const isMixedTypeSelection = isMultiSelection && selectionHasMixedTypes;
   const currentFont = textEl?.fontFamily ?? "Inter, system-ui, sans-serif";
   const currentWeight = textEl?.fontWeight ?? "600";
   const currentFontLabel = FONT_FAMILIES.find((f) => f.value === currentFont)?.label ?? currentFont.split(",")[0];
@@ -713,6 +716,7 @@ export function PropertyPanel({
                 type="number"
                 className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                 value={value}
+                disabled={isMixedTypeSelection}
                 onChange={(e) => onPatchSelected({ [field]: parseNumberInput(e.target.value, value) } as PresentationElementPatch)}
               />
             </label>
@@ -724,14 +728,22 @@ export function PropertyPanel({
               type="number"
               className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
               value={selectedElement.rotation ?? 0}
+              disabled={isMixedTypeSelection}
               onChange={(e) => onPatchSelected({ rotation: parseNumberInput(e.target.value, selectedElement.rotation ?? 0) })}
             />
           </label>
         </div>
       </Section>
 
+      {isMixedTypeSelection ? (
+        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
+          Mixed object types selected. Property editing is disabled for safety.
+          Resize all selected objects directly on the canvas.
+        </div>
+      ) : null}
+
       {/* ── TEXT ELEMENT ── */}
-      {selectedElement.type === "text" && (
+      {!isMixedTypeSelection && selectedElement.type === "text" && (
         <>
           {/* Text Content */}
           <Section label="Content">
@@ -1187,7 +1199,7 @@ export function PropertyPanel({
       )}
 
       {/* ── IMAGE / SVG GRAPHIC ── */}
-      {selectedElement.type === "image" && (
+      {!isMixedTypeSelection && selectedElement.type === "image" && (
         <>
           {/* SVG Graphic color picker */}
           {(selectedElement as any).svgContent && (
@@ -1443,7 +1455,7 @@ export function PropertyPanel({
 
 
       {/* ── VIDEO ── */}
-      {selectedElement.type === "video" && (
+      {!isMixedTypeSelection && selectedElement.type === "video" && (
         <Section label="Video">
           {[
             { label: "Source URL", field: "src" as const, value: selectedElement.src },
@@ -1464,7 +1476,7 @@ export function PropertyPanel({
       )}
 
       {/* ── RECT ── */}
-      {selectedElement.type === "rect" && (
+      {!isMixedTypeSelection && selectedElement.type === "rect" && (
         <Section label="Rectangle">
           <ColorField label="Fill" textAriaLabel="Rectangle Fill" pickerAriaLabel="Rectangle Fill Picker" value={selectedElement.fill} fallback="#93c5fd" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
           <ColorField label="Stroke" textAriaLabel="Rectangle Border" pickerAriaLabel="Rectangle Border Picker" value={selectedElement.stroke || "#2563eb"} fallback="#2563eb" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
@@ -1476,7 +1488,7 @@ export function PropertyPanel({
       )}
 
       {/* ── LINE ── */}
-      {selectedElement.type === "line" && (
+      {!isMixedTypeSelection && selectedElement.type === "line" && (
         <Section label="Line">
           <ColorField label="Fill" textAriaLabel="Line Fill" pickerAriaLabel="Line Fill Picker" value={selectedElement.fill || "transparent"} fallback="#ffffff" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
           <ColorField label="Stroke" textAriaLabel="Line Stroke" pickerAriaLabel="Line Stroke Picker" value={selectedElement.stroke} fallback="#1f2937" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
diff --git a/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts b/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts
index 8b644ed..9d758f1 100644
--- a/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts
+++ b/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts
@@ -23,13 +23,35 @@ export class AudioTrackPlayer {
   private projectAudioRemainingMs: number | null = null;
   private projectAudioTimerStartedAt: number | null = null;
 
+  private seekAudioSafely(audio: HTMLAudioElement, timeSec: number): void {
+    const safeTimeSec = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
+    const applySeek = () => {
+      try {
+        audio.currentTime = safeTimeSec;
+      } catch {
+        // Ignore seek failures before metadata is ready; listener below will retry.
+      }
+    };
+
+    applySeek();
+    if (Number.isFinite(audio.duration) && audio.duration > 0) {
+      return;
+    }
+    const handleLoadedMetadata = () => {
+      applySeek();
+    };
+    if (typeof audio.addEventListener === "function") {
+      audio.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
+    }
+  }
+
   constructor(projectAudioTrack: ResolvedProjectAudioTrack | null) {
     if (projectAudioTrack !== null) {
       const audio = new Audio(projectAudioTrack.url);
       audio.volume = projectAudioTrack.volume;
       audio.loop = projectAudioTrack.loop;
       this.projectAudioStartAtSec = Math.max(0, (projectAudioTrack.startAtMs ?? 0) / 1000);
-      audio.currentTime = this.projectAudioStartAtSec;
+      this.seekAudioSafely(audio, this.projectAudioStartAtSec);
       if (projectAudioTrack.endAtMs != null) {
         const playDurationMs = projectAudioTrack.endAtMs - (projectAudioTrack.startAtMs ?? 0);
         if (playDurationMs > 0) {
@@ -63,7 +85,7 @@ export class AudioTrackPlayer {
 
     const audio = new Audio(slideAudioTrack.url);
     audio.volume = slideAudioTrack.volume;
-    audio.currentTime = slideAudioTrack.startAtMs / 1000;
+    this.seekAudioSafely(audio, slideAudioTrack.startAtMs / 1000);
     audio.play().catch(() => {});
     this.slideAudio = audio;
 
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 60c02ef..ffe1d56 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1658,6 +1658,8 @@ export const libraryItems = pgTable("library_items", {
   id: serial("id").primaryKey(),
   tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
   ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  // null = root-level; non-null = inside a folder (itemType="folder")
+  parentId: integer("parent_id").references((): AnyPgColumn => libraryItems.id, { onDelete: "cascade" }),
   itemType: varchar("item_type", { length: 32 }).notNull(),
   source: varchar("source", { length: 64 }).notNull(),
   title: varchar("title", { length: 255 }).notNull(),
@@ -1684,6 +1686,7 @@ export const libraryItems = pgTable("library_items", {
   index("library_items_source_item_type_idx").on(t.source, t.itemType),
   index("library_items_deleted_at_idx").on(t.deletedAt),
   index("library_items_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  index("library_items_parent_id_idx").on(t.parentId),
 ]);
 
 export type LibraryItem = typeof libraryItems.$inferSelect;
diff --git a/apps/web/package.json b/apps/web/package.json
index 9866d1e..a442e46 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -97,6 +97,7 @@
     "cookie": "^1.0.2",
     "cookie-parser": "^1.4.7",
     "date-fns": "^4.1.0",
+    "discord.js": "^14.25.1",
     "dockerode": "^4.0.2",
     "dompurify": "^3.3.1",
     "dotenv": "^17.2.2",
diff --git a/apps/web/server/routers/library.ts b/apps/web/server/routers/library.ts
index 3637c58..7502225 100644
--- a/apps/web/server/routers/library.ts
+++ b/apps/web/server/routers/library.ts
@@ -12,8 +12,11 @@ import { resolveTenantIdVarchar } from "../services/tenantContext";
 import { federatedSearch } from "../services/federatedSearch";
 import {
   createLibraryItem,
+  createLibraryFolder,
   getContentVersionById,
   getContentVersionHistory,
+  getLibraryFolderAncestors,
+  getLibraryFolderChildCount,
   getLibraryMarkdownContent,
   getLibraryItemById,
   getLibraryItemShares,
@@ -28,7 +31,9 @@ import {
   saveLibraryMarkdown,
   searchLibraryItems,
   shareLibraryItem,
+  shareLibraryToGroup,
   softDeleteLibraryItem,
+  batchSoftDeleteLibraryItems,
   updateLibrarySharePermission,
   uploadLibraryFile,
   replaceLibraryFile,
@@ -99,6 +104,7 @@ const uploadLibraryFileSchema = z.object({
   fileBase64: z.string().min(1).max(MAX_FILE_BASE64_LENGTH),
   title: z.string().min(1).max(255).optional(),
   visibility: visibilitySchema.optional(),
+  parentId: z.number().int().positive().nullable().optional(),
 });
 
 async function resolveLibraryTenantId(
@@ -179,6 +185,7 @@ export const libraryRouter = router({
         limit: z.number().int().min(1).max(50).optional(),
         offset: z.number().int().min(0).optional(),
         filters: documentFilterSchema,
+        folderId: z.number().int().positive().nullable().optional(),
       }).optional(),
     )
     .query(async ({ input, ctx }) => {
@@ -198,6 +205,7 @@ export const libraryRouter = router({
           limit: input?.limit,
           offset: input?.offset,
           filters: input?.filters,
+          folderId: input?.folderId,
         },
         actor,
       );
@@ -412,6 +420,7 @@ export const libraryRouter = router({
         sourceUrl: z.string().max(2048).optional(),
         thumbnailUrl: z.string().max(2048).optional(),
         sourceLink: sourceLinkSchema.optional(),
+        parentId: z.number().int().positive().nullable().optional(),
       }),
     )
     .mutation(async ({ input, ctx }) => {
@@ -941,6 +950,108 @@ export const libraryRouter = router({
       return { success: true };
     }),
 
+  // ─── Folder procedures ────────────────────────────────────────────────────
+
+  createFolder: protectedProcedure
+    .input(
+      z.object({
+        name: z.string().min(1).max(255),
+        parentId: z.number().int().positive().nullable().optional(),
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = { userId: ctx.user.id, tenantId: tenantIdResolved, role: ctx.user.role };
+
+      const result = await createLibraryFolder(input, actor);
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.createFolder",
+        requestType: "mutation",
+        requestPayload: { tenantId: tenantIdResolved, name: input.name, parentId: input.parentId },
+        responsePayload: { itemId: result.item.id },
+      });
+
+      return result;
+    }),
+
+  getFolderPath: protectedProcedure
+    .input(z.object({ folderId: z.number().int().positive() }))
+    .query(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      return getLibraryFolderAncestors(input.folderId, tenantIdResolved);
+    }),
+
+  /** Returns number of non-deleted direct children in a folder. */
+  getFolderChildCount: protectedProcedure
+    .input(z.object({ folderId: z.number().int().positive() }))
+    .query(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const cnt = await getLibraryFolderChildCount(input.folderId, tenantIdResolved);
+      return { count: cnt };
+    }),
+
+  /** Batch soft-delete multiple items at once. */
+  deleteItems: protectedProcedure
+    .input(
+      z.object({
+        ids: z.array(z.number().int().positive()).min(1).max(200),
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = { userId: ctx.user.id, tenantId: tenantIdResolved, role: ctx.user.role };
+
+      const deleted = await batchSoftDeleteLibraryItems(input.ids, actor);
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.deleteItems",
+        requestType: "mutation",
+        requestPayload: { tenantId: tenantIdResolved, ids: input.ids },
+        responsePayload: { deleted },
+      });
+
+      return { deleted };
+    }),
+
+  /** Share all owned library items with a specific group. */
+  shareLibrary: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().int().positive(),
+        permissionLevel: sharePermissionLevelSchema,
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      if (!shareOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
+        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many share operations. Please try again later." });
+      }
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = { userId: ctx.user.id, tenantId: tenantIdResolved, role: ctx.user.role };
+
+      const result = await shareLibraryToGroup(input, actor);
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.shareLibrary",
+        requestType: "mutation",
+        requestPayload: { tenantId: tenantIdResolved, groupId: input.groupId, permissionLevel: input.permissionLevel },
+        responsePayload: { shared: result.shared },
+      });
+
+      return result;
+    }),
+
   /**
    * Federated search across local DB, vector store, and Google Drive.
    */
diff --git a/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts b/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts
index 36fd4c3..30dfe1a 100644
--- a/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts
+++ b/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts
@@ -505,24 +505,56 @@ describe("Edge Cases", () => {
     }
   });
 
-  it("uses short-edge typography scaling so portrait canvas text is not undersized", () => {
-    const result = generateSlide(makeLayoutInput({
+  it("boosts portrait body font size so 9:16 content remains readable", () => {
+    const heroPortrait = generateSlide(makeLayoutInput({
       slideData: makeSlideData({ templateId: "hero_center" }),
       canvasWidth: 720,
       canvasHeight: 1280,
     }));
+    const heroLandscape = generateSlide(makeLayoutInput({
+      slideData: makeSlideData({ templateId: "hero_center" }),
+      canvasWidth: 1280,
+      canvasHeight: 720,
+    }));
+    const splitPortrait = generateSlide(makeLayoutInput({
+      slideData: makeSlideData({ templateId: "split_right_image" }),
+      canvasWidth: 720,
+      canvasHeight: 1280,
+    }));
+    const splitLandscape = generateSlide(makeLayoutInput({
+      slideData: makeSlideData({ templateId: "split_right_image" }),
+      canvasWidth: 1280,
+      canvasHeight: 720,
+    }));
 
-    const title = result.slideContent.elements.find(
-      (e) => e.type === "text" && e.text === "Test Slide Title",
+    const heroBodyPortrait = heroPortrait.slideContent.elements.find(
+      (e) => e.type === "text" && e.text === "First bullet point",
+    );
+    const heroBodyLandscape = heroLandscape.slideContent.elements.find(
+      (e) => e.type === "text" && e.text === "First bullet point",
     );
-    const body = result.slideContent.elements.find(
+    const splitBodyPortrait = splitPortrait.slideContent.elements.find(
       (e) => e.type === "text" && e.text === "First bullet point",
     );
-    expect(title).toBeDefined();
-    expect(body).toBeDefined();
-    if (title?.type === "text" && body?.type === "text") {
-      expect(title.fontSize).toBeGreaterThanOrEqual(40);
-      expect(body.fontSize).toBeGreaterThanOrEqual(18);
+    const splitBodyLandscape = splitLandscape.slideContent.elements.find(
+      (e) => e.type === "text" && e.text === "First bullet point",
+    );
+
+    expect(heroBodyPortrait).toBeDefined();
+    expect(heroBodyLandscape).toBeDefined();
+    expect(splitBodyPortrait).toBeDefined();
+    expect(splitBodyLandscape).toBeDefined();
+
+    if (
+      heroBodyPortrait?.type === "text"
+      && heroBodyLandscape?.type === "text"
+      && splitBodyPortrait?.type === "text"
+      && splitBodyLandscape?.type === "text"
+    ) {
+      expect(heroBodyPortrait.fontSize).toBeGreaterThanOrEqual(24);
+      expect(splitBodyPortrait.fontSize).toBeGreaterThanOrEqual(20);
+      expect(heroBodyPortrait.fontSize).toBeGreaterThan(heroBodyLandscape.fontSize ?? 0);
+      expect(splitBodyPortrait.fontSize).toBeGreaterThan(splitBodyLandscape.fontSize ?? 0);
     }
   });
 
diff --git a/apps/web/server/services/aiPresentationLayoutEngine.ts b/apps/web/server/services/aiPresentationLayoutEngine.ts
index 5462dff..9bd7069 100644
--- a/apps/web/server/services/aiPresentationLayoutEngine.ts
+++ b/apps/web/server/services/aiPresentationLayoutEngine.ts
@@ -93,6 +93,28 @@ function scaleFontSize(
   return Math.max(minSize, Math.round(baseSize * scale.typographyScale));
 }
 
+function getPortraitBodyFontBoost(
+  canvasWidth: number,
+  canvasHeight: number,
+): number {
+  if (canvasHeight <= canvasWidth) {
+    return 1;
+  }
+  const portraitRatio = canvasHeight / Math.max(1, canvasWidth);
+  return clamp(1 + ((portraitRatio - 1) * 0.35), 1, 1.35);
+}
+
+function scaleBodyFontSize(
+  baseSize: number,
+  scale: ScaleFactors,
+  canvasWidth: number,
+  canvasHeight: number,
+): number {
+  const scaled = scaleFontSize(baseSize, scale, 10);
+  const boost = getPortraitBodyFontBoost(canvasWidth, canvasHeight);
+  return Math.max(12, Math.round(scaled * boost));
+}
+
 function computeContentArea(
   canvasWidth: number,
   canvasHeight: number,
@@ -249,7 +271,7 @@ function makeImageOrPlaceholder(
 // ── Template Builders ──────────────────────────────────────
 
 function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
-  const { contentArea, slideData, preset, scale } = ctx;
+  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
   const elements: SlideElement[] = [];
 
   // 1. Full-canvas image or placeholder
@@ -302,7 +324,7 @@ function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
   );
 
   // 4. Body text
-  const bodyFontSize = scaleFontSize(28, scale);
+  const bodyFontSize = scaleBodyFontSize(28, scale, canvasWidth, canvasHeight);
   const bodyLineHeight = Math.round(44 * scale.scaleY);
   let bodyY = titleY + titleHeight + Math.round(20 * scale.scaleY);
   for (const line of slideData.body) {
@@ -327,7 +349,7 @@ function buildHeroCenter(ctx: TemplateContext): SlideElement[] {
 }
 
 function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
-  const { contentArea, slideData, preset, scale } = ctx;
+  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
   const elements: SlideElement[] = [];
   const halfWidth = contentArea.width * 0.5;
 
@@ -382,7 +404,7 @@ function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
   );
 
   // 4. Body text
-  const bodyFontSize = scaleFontSize(24, scale);
+  const bodyFontSize = scaleBodyFontSize(24, scale, canvasWidth, canvasHeight);
   const bodyLineHeight = Math.round(40 * scale.scaleY);
   let bodyY = titleY + titleHeight + Math.round(24 * scale.scaleY);
   for (const line of slideData.body) {
@@ -425,7 +447,7 @@ function buildSplitRightImage(ctx: TemplateContext): SlideElement[] {
 }
 
 function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
-  const { contentArea, slideData, preset, scale } = ctx;
+  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
   const elements: SlideElement[] = [];
   const halfWidth = contentArea.width * 0.5;
 
@@ -497,7 +519,7 @@ function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
   );
 
   // 5. Body text on right
-  const bodyFontSize = scaleFontSize(24, scale);
+  const bodyFontSize = scaleBodyFontSize(24, scale, canvasWidth, canvasHeight);
   const bodyLineHeight = Math.round(40 * scale.scaleY);
   let bodyY = titleY + titleHeight + Math.round(24 * scale.scaleY);
   for (const line of slideData.body) {
@@ -522,7 +544,7 @@ function buildSplitLeftImage(ctx: TemplateContext): SlideElement[] {
 }
 
 function buildFeatureBoxesRight(ctx: TemplateContext): SlideElement[] {
-  const { contentArea, slideData, preset, scale } = ctx;
+  const { contentArea, slideData, preset, scale, canvasWidth, canvasHeight } = ctx;
   const elements: SlideElement[] = [];
   const leftWidth = contentArea.width * 0.55;
   const rightWidth = contentArea.width * 0.45;
@@ -594,7 +616,7 @@ function buildFeatureBoxesRight(ctx: TemplateContext): SlideElement[] {
     // Card text
     const bodyText = slideData.body[i] ?? "";
     if (bodyText) {
-      const cardTextFontSize = scaleFontSize(20, scale);
+      const cardTextFontSize = scaleBodyFontSize(20, scale, canvasWidth, canvasHeight);
       elements.push(
         makeTextElement({
           x:
diff --git a/apps/web/server/services/libraryService.ts b/apps/web/server/services/libraryService.ts
index adc968e..bf590b7 100644
--- a/apps/web/server/services/libraryService.ts
+++ b/apps/web/server/services/libraryService.ts
@@ -1,6 +1,6 @@
 import crypto from "crypto";
 import { TRPCError } from "@trpc/server";
-import { and, count, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
+import { and, count, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
 
 import { getDb } from "../db";
 import { storagePut, storageGet, storageDelete } from "../storage";
@@ -69,6 +69,7 @@ export interface CreateLibraryItemInput {
   sourceUrl?: string | null;
   thumbnailUrl?: string | null;
   sourceLink?: LibrarySourceLinkInput;
+  parentId?: number | null;
 }
 
 export interface UpdateLibraryItemInput {
@@ -154,6 +155,7 @@ export interface UploadLibraryFileInput {
   fileBase64: string;
   title?: string;
   visibility?: LibraryVisibility;
+  parentId?: number | null;
 }
 
 export interface UploadLibraryFileResult {
@@ -229,6 +231,8 @@ export interface LibraryDocumentListInput {
   limit?: number;
   offset?: number;
   filters?: LibraryDocumentFilters;
+  /** null = root level, number = inside that folder. Only applied for my_library scope. */
+  folderId?: number | null;
 }
 
 export interface LibraryDocumentListItem {
@@ -242,6 +246,7 @@ export interface LibraryDocumentListItem {
   source_url: string | null;
   thumbnail_url: string | null;
   owner_user_id: number;
+  parent_id: number | null;
   metadata: Record<string, unknown>;
   access_source: LibraryDocumentAccessSource;
   permission_level: LibraryPermissionLevel;
@@ -960,6 +965,7 @@ export async function createLibraryItem(
     .values({
       tenantId: actorTenantId,
       ownerUserId: actor.userId,
+      parentId: input.parentId ?? null,
       itemType: input.itemType,
       source: input.source,
       title: input.title,
@@ -1166,6 +1172,7 @@ export async function uploadLibraryFile(
       description: null,
       status: "indexing",
       visibility: input.visibility ?? "private",
+      parentId: input.parentId ?? null,
       metadata: {
         file_name: fileName,
         file_type: fileType,
@@ -1966,10 +1973,21 @@ export async function listLibraryDocuments(
   const groupIds = userGroupsList.map(g => String(g.id));
   const groupIdNums = userGroupsList.map(g => g.id);
 
+  // For my_library scope, apply folder-level filtering (folderId: null = root, number = folder children)
+  const applyFolderFilter = (input.scope === "my_library" || input.scope === undefined || input.scope === "all")
+    && "folderId" in input;
+  const folderCondition = applyFolderFilter
+    ? (input.folderId == null ? isNull(libraryItems.parentId) : eq(libraryItems.parentId, input.folderId))
+    : undefined;
+
   const itemRows = await db
     .select()
     .from(libraryItems)
-    .where(and(eq(libraryItems.tenantId, actorTenantId), isNull(libraryItems.deletedAt)))
+    .where(and(
+      eq(libraryItems.tenantId, actorTenantId),
+      isNull(libraryItems.deletedAt),
+      folderCondition,
+    ))
     .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.createdAt), desc(libraryItems.id));
 
   console.log("[listLibraryDocuments] DB rows found:", itemRows.length, itemRows.map(r => ({ id: r.id, title: r.title, ownerUserId: r.ownerUserId, tenantId: r.tenantId, visibility: r.visibility, status: r.status })));
@@ -2047,6 +2065,7 @@ export async function listLibraryDocuments(
         source_url: item.sourceUrl,
         thumbnail_url: item.thumbnailUrl,
         owner_user_id: item.ownerUserId,
+        parent_id: item.parentId ?? null,
         metadata,
         access_source: accessSource,
         permission_level: item.ownerUserId === actor.userId
@@ -3247,3 +3266,194 @@ export async function removeGoogleDriveData(
 
   return { itemsDeleted: itemIds.length, chunksDeleted, linksDeleted };
 }
+
+// ─── Folder support ──────────────────────────────────────────────────────────
+
+export interface LibraryFolderAncestor {
+  id: number;
+  title: string;
+}
+
+/**
+ * Create a folder item (itemType="folder") in the library.
+ */
+export async function createLibraryFolder(
+  input: { name: string; parentId?: number | null },
+  actor: LibraryActor,
+  dbClient?: DbClient,
+): Promise<CreateLibraryItemResult> {
+  return createLibraryItem(
+    {
+      itemType: "folder",
+      source: "document_management",
+      title: input.name.trim(),
+      description: null,
+      status: "ready",
+      visibility: "private",
+      parentId: input.parentId ?? null,
+      metadata: { source_type: "folder" },
+    },
+    actor,
+    dbClient,
+  );
+}
+
+/**
+ * Returns the number of non-deleted direct children inside a folder.
+ */
+export async function getLibraryFolderChildCount(
+  folderId: number,
+  tenantId: LibraryTenantId,
+  dbClient?: DbClient,
+): Promise<number> {
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(tenantId);
+  const [row] = await db
+    .select({ cnt: count(libraryItems.id) })
+    .from(libraryItems)
+    .where(
+      and(
+        eq(libraryItems.tenantId, actorTenantId),
+        eq(libraryItems.parentId, folderId),
+        isNull(libraryItems.deletedAt),
+      ),
+    );
+  return Number(row?.cnt ?? 0);
+}
+
+/**
+ * Returns the ancestor chain from root to the given folder (for breadcrumb).
+ * The folder itself is included as the last element.
+ */
+export async function getLibraryFolderAncestors(
+  folderId: number,
+  tenantId: LibraryTenantId,
+  dbClient?: DbClient,
+): Promise<LibraryFolderAncestor[]> {
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(tenantId);
+
+  const ancestors: LibraryFolderAncestor[] = [];
+  let currentId: number | null = folderId;
+
+  // Walk up the tree (max 20 levels to prevent runaway loops)
+  for (let depth = 0; depth < 20 && currentId != null; depth++) {
+    const idToFetch: number = currentId;
+    const rows: Array<{ id: number; title: string; parentId: number | null }> = await db
+      .select({ id: libraryItems.id, title: libraryItems.title, parentId: libraryItems.parentId })
+      .from(libraryItems)
+      .where(and(eq(libraryItems.id, idToFetch), eq(libraryItems.tenantId, actorTenantId)))
+      .limit(1);
+
+    const row = rows[0];
+    if (!row) break;
+    ancestors.unshift({ id: row.id, title: row.title });
+    currentId = row.parentId ?? null;
+  }
+
+  return ancestors;
+}
+
+/**
+ * Batch soft-delete multiple library items.
+ * Returns how many were successfully deleted.
+ */
+export async function batchSoftDeleteLibraryItems(
+  itemIds: number[],
+  actor: LibraryActor,
+  dbClient?: DbClient,
+): Promise<number> {
+  if (itemIds.length === 0) return 0;
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
+  const now = new Date();
+
+  const result = await db
+    .update(libraryItems)
+    .set({ deletedAt: now, deletedBy: actor.userId, status: "archived", updatedAt: now })
+    .where(
+      and(
+        inArray(libraryItems.id, itemIds),
+        eq(libraryItems.tenantId, actorTenantId),
+        isNull(libraryItems.deletedAt),
+      ),
+    )
+    .returning({ id: libraryItems.id });
+
+  return result.length;
+}
+
+/**
+ * Share all items owned by the actor in the library with a specific group.
+ * Returns the number of items that were newly shared (or already had a share updated).
+ */
+export async function shareLibraryToGroup(
+  input: { groupId: number; permissionLevel: LibraryPermissionLevel },
+  actor: LibraryActor,
+  dbClient?: DbClient,
+): Promise<{ shared: number }> {
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
+
+  // Verify group exists and belongs to same tenant
+  const [group] = await db
+    .select({ id: userGroups.id })
+    .from(userGroups)
+    .where(
+      and(
+        eq(userGroups.id, input.groupId),
+        eq(userGroups.tenantId, actorTenantId),
+        isNull(userGroups.deletedAt),
+      ),
+    )
+    .limit(1);
+
+  if (!group) {
+    throw new Error("Group not found or does not belong to this tenant");
+  }
+
+  // Fetch all owned non-deleted items (exclude folders themselves since folder access implies child access)
+  const ownedItems = await db
+    .select({ id: libraryItems.id })
+    .from(libraryItems)
+    .where(
+      and(
+        eq(libraryItems.tenantId, actorTenantId),
+        eq(libraryItems.ownerUserId, actor.userId),
+        isNull(libraryItems.deletedAt),
+      ),
+    );
+
+  if (ownedItems.length === 0) return { shared: 0 };
+
+  const subjectId = String(input.groupId);
+  const now = new Date();
+
+  // Upsert permission rows for each item
+  const BATCH = 100;
+  let shared = 0;
+  for (let i = 0; i < ownedItems.length; i += BATCH) {
+    const batch = ownedItems.slice(i, i + BATCH);
+    await db
+      .insert(libraryPermissions)
+      .values(
+        batch.map((item) => ({
+          tenantId: actorTenantId,
+          libraryItemId: item.id,
+          subjectType: "group" as const,
+          subjectId,
+          permissionLevel: input.permissionLevel,
+          grantedByUserId: actor.userId,
+          createdAt: now,
+          updatedAt: now,
+        })),
+      )
+      .onConflictDoUpdate({
+        target: [libraryPermissions.libraryItemId, libraryPermissions.subjectType, libraryPermissions.subjectId],
+        set: { permissionLevel: input.permissionLevel, updatedAt: now },
+      });
+    shared += batch.length;
+  }
+
+  return { shared };
+}
diff --git a/apps/web/server/services/presentationPlaybackExport.test.ts b/apps/web/server/services/presentationPlaybackExport.test.ts
index 994cf76..9346b54 100644
--- a/apps/web/server/services/presentationPlaybackExport.test.ts
+++ b/apps/web/server/services/presentationPlaybackExport.test.ts
@@ -6,12 +6,15 @@ import { PRESENTATION_ERROR_CODE, PRESENTATION_EXPORT_SCHEMA_VERSION } from "@sh
 
 import { PresentationServiceError } from "./presentationService";
 import {
+  buildPlayDeckPayload,
   buildPresentationRenderSpec,
   buildSlideshowPayload,
   getPresentationExportStatus,
   resetPresentationExportStateForTests,
   triggerPresentationExport,
 } from "./presentationPlaybackExport";
+import { getDb } from "../db";
+import { storagePresignGet } from "../storage";
 
 // Default: no DB (same as real test environment without DATABASE_URL).
 // Individual tests can override getDb with vi.spyOn.
@@ -86,6 +89,8 @@ describe("presentationPlaybackExport", () => {
   beforeEach(() => {
     resetPresentationExportStateForTests();
     vi.clearAllMocks();
+    vi.mocked(getDb).mockResolvedValue(null);
+    vi.mocked(storagePresignGet).mockResolvedValue(null);
   });
 
   it("builds deterministic slideshow payload order and default durations", () => {
@@ -99,6 +104,70 @@ describe("presentationPlaybackExport", () => {
     expect(payload.slides.map((slide) => slide.transition)).toEqual(["cut", "fade"]);
   });
 
+  it("resolves /api/storage/files sourceUrl into a presigned audio URL for play deck payload", async () => {
+    const selectWhere = vi.fn().mockResolvedValue([
+      { id: 91, sourceUrl: "/api/storage/files/audio/project/theme.mp3" },
+    ]);
+    const selectFrom = vi.fn(() => ({ where: selectWhere }));
+    const dbMock = {
+      select: vi.fn(() => ({ from: selectFrom })),
+    } as any;
+    vi.mocked(getDb).mockResolvedValue(dbMock);
+    vi.mocked(storagePresignGet).mockResolvedValue({
+      key: "audio/project/theme.mp3",
+      url: "https://signed.example.com/audio/project/theme.mp3",
+    });
+
+    const detail = buildDeckDetail({
+      deck: {
+        ...buildDeckDetail().deck,
+        projectAudioTrack: {
+          libraryItemId: 91,
+          volume: 0.7,
+          startAtMs: 0,
+          endAtMs: null,
+          loop: false,
+          fadeOutMs: null,
+        },
+      },
+      slides: [
+        {
+          ...buildDeckDetail().slides[0],
+          id: 1,
+          orderIndex: 0,
+          audioTrack: {
+            libraryItemId: 91,
+            volume: 1,
+            startAtMs: 500,
+            endAtMs: 2500,
+          },
+        },
+      ],
+    });
+
+    const payload = await buildPlayDeckPayload(
+      detail as any,
+      {
+        schemaVersion: "presentation_slideshow_v1",
+        deckId: 101,
+        generatedAt: new Date("2026-02-22T10:00:00.000Z"),
+        slides: [
+          {
+            slideId: 1,
+            orderIndex: 0,
+            title: "First",
+            transition: "cut",
+            durationMs: 3000,
+          },
+        ],
+      } as any,
+    );
+
+    expect(storagePresignGet).toHaveBeenCalledWith("audio/project/theme.mp3", 3600);
+    expect(payload.slides[0]?.audioTrack?.url).toBe("https://signed.example.com/audio/project/theme.mp3");
+    expect(payload.projectAudioTrack?.url).toBe("https://signed.example.com/audio/project/theme.mp3");
+  });
+
   it("degrades unsupported transition inputs and emits stable warning codes", async () => {
     const deckDetail = buildDeckDetail({
       slides: [
diff --git a/apps/web/server/services/presentationPlaybackExport.ts b/apps/web/server/services/presentationPlaybackExport.ts
index 3c164bd..b742029 100644
--- a/apps/web/server/services/presentationPlaybackExport.ts
+++ b/apps/web/server/services/presentationPlaybackExport.ts
@@ -167,6 +167,73 @@ function resolvePythonBackendBaseUrl(): string {
   return candidate.replace(/\/+$/, "");
 }
 
+function extractStorageKeyFromSourceUrl(sourceUrl: string): string | null {
+  const trimmed = sourceUrl.trim();
+  if (!trimmed) {
+    return null;
+  }
+
+  const decodeKey = (raw: string): string | null => {
+    const cleaned = raw.replace(/^\/+/, "").trim();
+    if (!cleaned) {
+      return null;
+    }
+    try {
+      return decodeURIComponent(cleaned);
+    } catch {
+      return cleaned;
+    }
+  };
+
+  if (trimmed.startsWith("/api/storage/files/")) {
+    return decodeKey(trimmed.slice("/api/storage/files/".length));
+  }
+  if (trimmed.startsWith("/uploads/")) {
+    return decodeKey(trimmed.slice("/uploads/".length));
+  }
+  if (trimmed.startsWith("/")) {
+    return null;
+  }
+  if (/^https?:\/\//i.test(trimmed)) {
+    try {
+      const parsed = new URL(trimmed);
+      if (parsed.pathname.startsWith("/api/storage/files/")) {
+        return decodeKey(parsed.pathname.slice("/api/storage/files/".length));
+      }
+      if (parsed.pathname.startsWith("/uploads/")) {
+        return decodeKey(parsed.pathname.slice("/uploads/".length));
+      }
+      return null;
+    } catch {
+      return null;
+    }
+  }
+
+  return decodeKey(trimmed);
+}
+
+async function resolveAudioSourceUrl(sourceUrl: string | null): Promise<string | null> {
+  if (!sourceUrl) {
+    return null;
+  }
+  const trimmed = sourceUrl.trim();
+  if (!trimmed) {
+    return null;
+  }
+
+  const key = extractStorageKeyFromSourceUrl(trimmed);
+  if (!key) {
+    return trimmed;
+  }
+
+  try {
+    const presigned = await storagePresignGet(key, 3600);
+    return presigned?.url ?? trimmed;
+  } catch {
+    return trimmed;
+  }
+}
+
 function resolveRenderDimensions(input: BuildRenderSpecInput): { width: number; height: number } {
   if (input.width && input.height) {
     return { width: input.width, height: input.height };
@@ -414,12 +481,6 @@ async function resolveAudioUrls(
   renderSpec: PresentationRenderSpec,
   db: DrizzleDB,
 ): Promise<PresentationRenderSpec> {
-  async function resolveUrl(sourceUrl: string | null): Promise<string | null> {
-    if (!sourceUrl) return null;
-    const presigned = await storagePresignGet(sourceUrl, 3600);
-    return presigned?.url ?? sourceUrl;
-  }
-
   const resolvedSlides = await Promise.all(
     renderSpec.slides.map(async (slide) => {
       if (!slide.audioTrack) return slide;
@@ -437,7 +498,7 @@ async function resolveAudioUrls(
         .from(libraryItems)
         .where(eq(libraryItems.id, libraryItemId))
         .limit(1);
-      const url = await resolveUrl(item?.sourceUrl ?? null);
+      const url = await resolveAudioSourceUrl(item?.sourceUrl ?? null);
       if (!url) return slide;
       const resolved: ResolvedAudioTrack = {
         url,
@@ -463,7 +524,7 @@ async function resolveAudioUrls(
         .from(libraryItems)
         .where(eq(libraryItems.id, libraryItemId))
         .limit(1);
-      const url = await resolveUrl(item?.sourceUrl ?? null);
+      const url = await resolveAudioSourceUrl(item?.sourceUrl ?? null);
       if (url) {
         resolvedProjectAudioTrack = {
           url,
@@ -577,12 +638,6 @@ export async function buildPlayDeckPayload(
     return presentationPlayDeckPayloadSchema.parse(slideshowPayload);
   }
 
-  async function resolveUrl(sourceUrl: string | null): Promise<string | null> {
-    if (!sourceUrl) return null;
-    const presigned = await storagePresignGet(sourceUrl, 3600);
-    return presigned?.url ?? sourceUrl;
-  }
-
   // Collect all distinct libraryItemIds needed (slides + deck project audio) in one batch query.
   const dbSlideMap = new Map(detail.slides.map((s) => [s.id, s]));
   const slideItemIds = detail.slides
@@ -603,7 +658,7 @@ export async function buildPlayDeckPayload(
   await Promise.all(
     allItemIds.map(async (id) => {
       const item = itemMap.get(id);
-      urlCache.set(id, await resolveUrl(item?.sourceUrl ?? null));
+      urlCache.set(id, await resolveAudioSourceUrl(item?.sourceUrl ?? null));
     }),
   );
 
@@ -663,12 +718,6 @@ async function resolveSlideAudioData(
   slideAudioMap: Map<number, ResolvedAudioTrack>;
   resolvedProjectAudioTrack: ResolvedProjectAudioTrack | null;
 }> {
-  async function resolveUrl(sourceUrl: string | null): Promise<string | null> {
-    if (!sourceUrl) return null;
-    const presigned = await storagePresignGet(sourceUrl, 3600);
-    return presigned?.url ?? sourceUrl;
-  }
-
   // Collect all distinct libraryItemIds needed in one batch query.
   const slideItemIds = detail.slides
     .map((s) => s.audioTrack?.libraryItemId)
@@ -689,7 +738,7 @@ async function resolveSlideAudioData(
   await Promise.all(
     allItemIds.map(async (id) => {
       const item = itemMap.get(id);
-      urlCache.set(id, await resolveUrl(item?.sourceUrl ?? null));
+      urlCache.set(id, await resolveAudioSourceUrl(item?.sourceUrl ?? null));
     }),
   );
 
diff --git a/nginx/conf.d/dev-host.conf b/nginx/conf.d/dev-host.conf
index b8cca05..5720fe9 100644
--- a/nginx/conf.d/dev-host.conf
+++ b/nginx/conf.d/dev-host.conf
@@ -121,6 +121,22 @@ server {
         proxy_read_timeout 700s;
     }
 
+    # Channel webhooks — must come BEFORE /api/ (Node.js handles these, not Python)
+    # Handles: /webhooks/telegram/:connId, /webhooks/whatsapp/:connId, etc.
+    location /webhooks/ {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+
+        # Higher burst for platform webhook providers (Telegram, WhatsApp, LINE)
+        limit_req zone=api_limit burst=50 nodelay;
+        limit_conn conn_limit 30;
+    }
+
     # Python Backend API
     location /api/ {
         client_max_body_size 2G;  # Allow large uploads to Python backend
@@ -168,6 +184,20 @@ server {
         limit_conn conn_limit 30;
     }
 
+    # Voice WebSocket (section-06-voice) — must come BEFORE generic /ws
+    location /api/voice/stream {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Upgrade $http_upgrade;
+        proxy_set_header Connection "upgrade";
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+        proxy_read_timeout 300s;  # 5-minute voice session max
+        proxy_send_timeout 300s;
+    }
+
     # WebSocket support
     location /ws {
         proxy_pass http://web_host;
@@ -340,6 +370,56 @@ server {
         proxy_read_timeout 700s;
     }
 
+    # Voice WebSocket (section-06-voice) — must come BEFORE /api/
+    location /api/voice/stream {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Upgrade $http_upgrade;
+        proxy_set_header Connection "upgrade";
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+        proxy_read_timeout 300s;  # 5-minute voice session max
+        proxy_send_timeout 300s;
+    }
+
+    # Channel webhooks — must come BEFORE /api/ (Node.js handles these, not Python)
+    location /webhooks/ {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+
+        # Higher burst for platform webhook providers (Telegram, WhatsApp, LINE)
+        limit_req zone=api_limit burst=50 nodelay;
+        limit_conn conn_limit 30;
+    }
+
+    # Widget WebSocket (section-10-widget) — must come BEFORE /api/
+    location /widget/v1/ws {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Upgrade $http_upgrade;
+        proxy_set_header Connection "upgrade";
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+        proxy_read_timeout 600s;  # Widget sessions can be long-lived
+        proxy_send_timeout 600s;
+    }
+
+    # Widget static assets and init endpoint
+    location /widget/v1/ {
+        proxy_pass http://web_host;
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+    }
+
     location /api/ {
         client_max_body_size 2G;  # Allow large uploads to Python backend
         proxy_pass http://backend_host;
@@ -459,3 +539,43 @@ server {
         proxy_read_timeout 60s;
     }
 }
+
+# Artifact sandbox — isolated domain for untrusted code execution (section-04-canvas)
+# connect-src 'none' prevents sandboxed scripts from making any network requests
+server {
+    listen 80;
+    listen [::]:80;
+    server_name sandbox.smartaihub.app;
+    return 301 https://$host$request_uri;
+}
+
+server {
+    listen 443 ssl;
+    listen [::]:443 ssl;
+    http2 on;
+    server_name sandbox.smartaihub.app;
+
+    ssl_certificate /etc/nginx/ssl/smartaihub.app.crt;
+    ssl_certificate_key /etc/nginx/ssl/smartaihub.app.key;
+    ssl_protocols TLSv1.2 TLSv1.3;
+
+    # Defense-in-depth: strict CSP at Nginx level
+    # Even if the app forgets to set CSP, Nginx enforces it
+    add_header Content-Security-Policy "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-ancestors https://smartaihub.app;" always;
+    add_header X-Frame-Options "ALLOW-FROM https://smartaihub.app" always;
+    add_header X-Content-Type-Options "nosniff" always;
+    add_header Referrer-Policy "no-referrer" always;
+
+    location / {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+
+        client_max_body_size 1M;
+
+        limit_req zone=web_limit burst=10 nodelay;
+    }
+}
diff --git a/package-lock.json b/package-lock.json
index 466cbb2..b145241 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -157,6 +157,7 @@
         "cookie": "^1.0.2",
         "cookie-parser": "^1.4.7",
         "date-fns": "^4.1.0",
+        "discord.js": "^14.25.1",
         "dockerode": "^4.0.2",
         "dompurify": "^3.3.1",
         "dotenv": "^17.2.2",
@@ -6994,6 +6995,145 @@
       "integrity": "sha512-P5LUNhtbj6YfI3iJjw5EL9eUAG6OitD0W3fWQcpQjDRc/QIsL0tRNuO1PcDvPccWL1fSTXXdE1ds+l95DV/OFA==",
       "license": "MIT"
     },
+    "node_modules/@discordjs/builders": {
+      "version": "1.13.1",
+      "resolved": "https://registry.npmjs.org/@discordjs/builders/-/builders-1.13.1.tgz",
+      "integrity": "sha512-cOU0UDHc3lp/5nKByDxkmRiNZBpdp0kx55aarbiAfakfKJHlxv/yFW1zmIqCAmwH5CRlrH9iMFKJMpvW4DPB+w==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@discordjs/formatters": "^0.6.2",
+        "@discordjs/util": "^1.2.0",
+        "@sapphire/shapeshift": "^4.0.0",
+        "discord-api-types": "^0.38.33",
+        "fast-deep-equal": "^3.1.3",
+        "ts-mixer": "^6.0.4",
+        "tslib": "^2.6.3"
+      },
+      "engines": {
+        "node": ">=16.11.0"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/collection": {
+      "version": "1.5.3",
+      "resolved": "https://registry.npmjs.org/@discordjs/collection/-/collection-1.5.3.tgz",
+      "integrity": "sha512-SVb428OMd3WO1paV3rm6tSjM4wC+Kecaa1EUGX7vc6/fddvw/6lg90z4QtCqm21zvVe92vMMDt9+DkIvjXImQQ==",
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=16.11.0"
+      }
+    },
+    "node_modules/@discordjs/formatters": {
+      "version": "0.6.2",
+      "resolved": "https://registry.npmjs.org/@discordjs/formatters/-/formatters-0.6.2.tgz",
+      "integrity": "sha512-y4UPwWhH6vChKRkGdMB4odasUbHOUwy7KL+OVwF86PvT6QVOwElx+TiI1/6kcmcEe+g5YRXJFiXSXUdabqZOvQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "discord-api-types": "^0.38.33"
+      },
+      "engines": {
+        "node": ">=16.11.0"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/rest": {
+      "version": "2.6.0",
+      "resolved": "https://registry.npmjs.org/@discordjs/rest/-/rest-2.6.0.tgz",
+      "integrity": "sha512-RDYrhmpB7mTvmCKcpj+pc5k7POKszS4E2O9TYc+U+Y4iaCP+r910QdO43qmpOja8LRr1RJ0b3U+CqVsnPqzf4w==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@discordjs/collection": "^2.1.1",
+        "@discordjs/util": "^1.1.1",
+        "@sapphire/async-queue": "^1.5.3",
+        "@sapphire/snowflake": "^3.5.3",
+        "@vladfrangu/async_event_emitter": "^2.4.6",
+        "discord-api-types": "^0.38.16",
+        "magic-bytes.js": "^1.10.0",
+        "tslib": "^2.6.3",
+        "undici": "6.21.3"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/rest/node_modules/@discordjs/collection": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/@discordjs/collection/-/collection-2.1.1.tgz",
+      "integrity": "sha512-LiSusze9Tc7qF03sLCujF5iZp7K+vRNEDBZ86FT9aQAv3vxMLihUvKvpsCWiQ2DJq1tVckopKm1rxomgNUc9hg==",
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/rest/node_modules/undici": {
+      "version": "6.21.3",
+      "resolved": "https://registry.npmjs.org/undici/-/undici-6.21.3.tgz",
+      "integrity": "sha512-gBLkYIlEnSp8pFbT64yFgGE6UIB9tAkhukC23PmMDCe5Nd+cRqKxSjw5y54MK2AZMgZfJWMaNE4nYUHgi1XEOw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=18.17"
+      }
+    },
+    "node_modules/@discordjs/util": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/@discordjs/util/-/util-1.2.0.tgz",
+      "integrity": "sha512-3LKP7F2+atl9vJFhaBjn4nOaSWahZ/yWjOvA4e5pnXkt2qyXRCHLxoBQy81GFtLGCq7K9lPm9R517M1U+/90Qg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "discord-api-types": "^0.38.33"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/ws": {
+      "version": "1.2.3",
+      "resolved": "https://registry.npmjs.org/@discordjs/ws/-/ws-1.2.3.tgz",
+      "integrity": "sha512-wPlQDxEmlDg5IxhJPuxXr3Vy9AjYq5xCvFWGJyD7w7Np8ZGu+Mc+97LCoEc/+AYCo2IDpKioiH0/c/mj5ZR9Uw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@discordjs/collection": "^2.1.0",
+        "@discordjs/rest": "^2.5.1",
+        "@discordjs/util": "^1.1.0",
+        "@sapphire/async-queue": "^1.5.2",
+        "@types/ws": "^8.5.10",
+        "@vladfrangu/async_event_emitter": "^2.2.4",
+        "discord-api-types": "^0.38.1",
+        "tslib": "^2.6.2",
+        "ws": "^8.17.0"
+      },
+      "engines": {
+        "node": ">=16.11.0"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/@discordjs/ws/node_modules/@discordjs/collection": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/@discordjs/collection/-/collection-2.1.1.tgz",
+      "integrity": "sha512-LiSusze9Tc7qF03sLCujF5iZp7K+vRNEDBZ86FT9aQAv3vxMLihUvKvpsCWiQ2DJq1tVckopKm1rxomgNUc9hg==",
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
     "node_modules/@epic-web/invariant": {
       "version": "1.0.0",
       "resolved": "https://registry.npmjs.org/@epic-web/invariant/-/invariant-1.0.0.tgz",
@@ -11047,6 +11187,39 @@
         "win32"
       ]
     },
+    "node_modules/@sapphire/async-queue": {
+      "version": "1.5.5",
+      "resolved": "https://registry.npmjs.org/@sapphire/async-queue/-/async-queue-1.5.5.tgz",
+      "integrity": "sha512-cvGzxbba6sav2zZkH8GPf2oGk9yYoD5qrNWdu9fRehifgnFZJMV+nuy2nON2roRO4yQQ+v7MK/Pktl/HgfsUXg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=v14.0.0",
+        "npm": ">=7.0.0"
+      }
+    },
+    "node_modules/@sapphire/shapeshift": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/@sapphire/shapeshift/-/shapeshift-4.0.0.tgz",
+      "integrity": "sha512-d9dUmWVA7MMiKobL3VpLF8P2aeanRTu6ypG2OIaEv/ZHH/SUQ2iHOVyi5wAPjQ+HmnMuL0whK9ez8I/raWbtIg==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-deep-equal": "^3.1.3",
+        "lodash": "^4.17.21"
+      },
+      "engines": {
+        "node": ">=v16"
+      }
+    },
+    "node_modules/@sapphire/snowflake": {
+      "version": "3.5.3",
+      "resolved": "https://registry.npmjs.org/@sapphire/snowflake/-/snowflake-3.5.3.tgz",
+      "integrity": "sha512-jjmJywLAFoWeBi1W7994zZyiNWPIiqRRNAmSERxyg93xRGzNYvGjlZ0gR6x0F4gPRi2+0O6S71kOZYyr3cxaIQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=v14.0.0",
+        "npm": ">=7.0.0"
+      }
+    },
     "node_modules/@sentry-internal/browser-utils": {
       "version": "10.38.0",
       "resolved": "https://registry.npmjs.org/@sentry-internal/browser-utils/-/browser-utils-10.38.0.tgz",
@@ -13003,6 +13176,16 @@
         "weakmap-polyfill": "2.0.4"
       }
     },
+    "node_modules/@vladfrangu/async_event_emitter": {
+      "version": "2.4.7",
+      "resolved": "https://registry.npmjs.org/@vladfrangu/async_event_emitter/-/async_event_emitter-2.4.7.tgz",
+      "integrity": "sha512-Xfe6rpCTxSxfbswi/W/Pz7zp1WWSNn4A0eW4mLkQUewCrXXtMj31lCg+iQyTkh/CkusZSq9eDflu7tjEDXUY6g==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=v14.0.0",
+        "npm": ">=7.0.0"
+      }
+    },
     "node_modules/@xterm/addon-fit": {
       "version": "0.11.0",
       "resolved": "https://registry.npmjs.org/@xterm/addon-fit/-/addon-fit-0.11.0.tgz",
@@ -14722,6 +14905,51 @@
         "wrappy": "1"
       }
     },
+    "node_modules/discord-api-types": {
+      "version": "0.38.40",
+      "resolved": "https://registry.npmjs.org/discord-api-types/-/discord-api-types-0.38.40.tgz",
+      "integrity": "sha512-P/His8cotqZgQqrt+hzrocp9L8RhQQz1GkrCnC9TMJ8Uw2q0tg8YyqJyGULxhXn/8kxHETN4IppmOv+P2m82lQ==",
+      "license": "MIT",
+      "workspaces": [
+        "scripts/actions/documentation"
+      ]
+    },
+    "node_modules/discord.js": {
+      "version": "14.25.1",
+      "resolved": "https://registry.npmjs.org/discord.js/-/discord.js-14.25.1.tgz",
+      "integrity": "sha512-2l0gsPOLPs5t6GFZfQZKnL1OJNYFcuC/ETWsW4VtKVD/tg4ICa9x+jb9bkPffkMdRpRpuUaO/fKkHCBeiCKh8g==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@discordjs/builders": "^1.13.0",
+        "@discordjs/collection": "1.5.3",
+        "@discordjs/formatters": "^0.6.2",
+        "@discordjs/rest": "^2.6.0",
+        "@discordjs/util": "^1.2.0",
+        "@discordjs/ws": "^1.2.3",
+        "@sapphire/snowflake": "3.5.3",
+        "discord-api-types": "^0.38.33",
+        "fast-deep-equal": "3.1.3",
+        "lodash.snakecase": "4.1.1",
+        "magic-bytes.js": "^1.10.0",
+        "tslib": "^2.6.3",
+        "undici": "6.21.3"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": {
+        "url": "https://github.com/discordjs/discord.js?sponsor"
+      }
+    },
+    "node_modules/discord.js/node_modules/undici": {
+      "version": "6.21.3",
+      "resolved": "https://registry.npmjs.org/undici/-/undici-6.21.3.tgz",
+      "integrity": "sha512-gBLkYIlEnSp8pFbT64yFgGE6UIB9tAkhukC23PmMDCe5Nd+cRqKxSjw5y54MK2AZMgZfJWMaNE4nYUHgi1XEOw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=18.17"
+      }
+    },
     "node_modules/dom-accessibility-api": {
       "version": "0.5.16",
       "resolved": "https://registry.npmjs.org/dom-accessibility-api/-/dom-accessibility-api-0.5.16.tgz",
@@ -16853,6 +17081,12 @@
       "integrity": "sha512-chi4NHZlZqZD18a0imDHnZPrDeBbTtVN7GXMwuGdRH9qotxAjYs3aVLKc7zNOG9eddR5Ksd8rvFEBc9SsggPpg==",
       "license": "MIT"
     },
+    "node_modules/lodash.snakecase": {
+      "version": "4.1.1",
+      "resolved": "https://registry.npmjs.org/lodash.snakecase/-/lodash.snakecase-4.1.1.tgz",
+      "integrity": "sha512-QZ1d4xoBHYUeuouhEq3lk3Uq7ldgyFXGBhg04+oRLnIz8o9T65Eh+8YdroUwn846zchkA9yDsDl5CVVaV2nqYw==",
+      "license": "MIT"
+    },
     "node_modules/long": {
       "version": "5.3.2",
       "resolved": "https://registry.npmjs.org/long/-/long-5.3.2.tgz",
@@ -16923,6 +17157,12 @@
         "lz-string": "bin/bin.js"
       }
     },
+    "node_modules/magic-bytes.js": {
+      "version": "1.13.0",
+      "resolved": "https://registry.npmjs.org/magic-bytes.js/-/magic-bytes.js-1.13.0.tgz",
+      "integrity": "sha512-afO2mnxW7GDTXMm5/AoN1WuOcdoKhtgXjIvHmobqTD1grNplhGdv3PFOyjCVmrnOZBIT/gD/koDKpYG+0mvHcg==",
+      "license": "MIT"
+    },
     "node_modules/magic-string": {
       "version": "0.30.21",
       "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz",
@@ -20184,6 +20424,12 @@
         "node": ">=6.10"
       }
     },
+    "node_modules/ts-mixer": {
+      "version": "6.0.4",
+      "resolved": "https://registry.npmjs.org/ts-mixer/-/ts-mixer-6.0.4.tgz",
+      "integrity": "sha512-ufKpbmrugz5Aou4wcr5Wc1UUFWOLhq+Fm6qa6P0w0K5Qw2yhaUoiWszhCVuNQyNwrlGiscHOmqYoAox1PtvgjA==",
+      "license": "MIT"
+    },
     "node_modules/tslib": {
       "version": "2.8.1",
       "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
diff --git a/specs/feature/029-ClawFeature/implementation/deep_implement_config.json b/specs/feature/029-ClawFeature/implementation/deep_implement_config.json
index 0c3e755..9e9992b 100644
--- a/specs/feature/029-ClawFeature/implementation/deep_implement_config.json
+++ b/specs/feature/029-ClawFeature/implementation/deep_implement_config.json
@@ -63,6 +63,22 @@
     "section-10-widget": {
       "status": "complete",
       "commit_hash": "5bcc0520ce79295384e2fea4e9f7aa9764205d14"
+    },
+    "section-11-webhooks": {
+      "status": "complete",
+      "commit_hash": "9a53ce22625794c5db61bd9daa73e0ee0609c2b7"
+    },
+    "section-12-channel-router": {
+      "status": "complete",
+      "commit_hash": "fef3bfe6386774b65434984be06608e4db965f0a"
+    },
+    "section-13-slack-discord": {
+      "status": "complete",
+      "commit_hash": "7efbf9c901c98c2321105db29e0974b89fc68a76"
+    },
+    "section-14-feature-flags": {
+      "status": "complete",
+      "commit_hash": "0be12fe"
     }
   },
   "pre_commit": {
