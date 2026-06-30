diff --git a/apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts b/apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts
index 5cccbb06..41c2058b 100644
--- a/apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts
+++ b/apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts
@@ -106,4 +106,67 @@ describe("StoryboardReviewPage HyperFrames text helpers", () => {

     expect(lines).toEqual([]);
   });
+
+  it("builds preview-match capture payloads from the same final preview fields", () => {
+    const payload =
+      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildPreviewMatchPayloadPreview({
+        renderPrompt: "Final preview prompt",
+        overlayPreset: "badge_cascade",
+        subtitlePreset: "classic_box",
+        subtitleFontSizePx: 34,
+        textMode: "hook_and_per_shot",
+        textMotionPreset: "slide_right_to_left",
+        fontFamily: "Prompt",
+        hookText: "คุณแม่ทราบกันไหม",
+        supportingText: "พัฒนาการเด็กแต่ละบ้านแตกต่างกัน",
+        audioPackPresetId: "native",
+        musicPresetId: "",
+        sfxPresetIds: [],
+        preserveNativeAudio: true,
+        syntheticAudioFallback: true,
+        burnInSubtitles: true,
+        durationSeconds: 4,
+        shots: [
+          {
+            id: "shot-1",
+            prompt: "shot prompt",
+            overlayText: "overlay",
+            subtitleText: "display only",
+            startSec: 0,
+            endSec: 4,
+            mediaStartSec: 0,
+            sourceClipId: "clip-1",
+            sourceVideoRef: "storage://clip-1.mp4",
+            overlayLines: ["overlay"],
+            subtitleCues: [
+              {
+                startSec: 0.5,
+                endSec: 2.5,
+                text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก",
+              },
+            ],
+            durationSeconds: 4,
+            overlayPreset: "badge_cascade",
+            animationPreset: "smooth_reveal",
+            transition: "fade",
+            textMotionPreset: "slide_right_to_left",
+          },
+        ],
+      });
+
+    expect(payload.engine).toBe("preview_match_browser_capture");
+    expect(payload.shots[0].subtitleCues).toEqual([
+      {
+        startSec: 0.5,
+        endSec: 2.5,
+        text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก",
+      },
+    ]);
+    expect(
+      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.computePreviewMatchCompositionHash(payload),
+    ).toMatch(/^pmc_/);
+    expect(
+      __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.computePreviewMatchTimelineHash(payload),
+    ).toMatch(/^pmt_/);
+  });
 });
diff --git a/apps/web/client/src/pages/StoryboardReviewPage.tsx b/apps/web/client/src/pages/StoryboardReviewPage.tsx
index ffe2514b..21a24cf0 100644
--- a/apps/web/client/src/pages/StoryboardReviewPage.tsx
+++ b/apps/web/client/src/pages/StoryboardReviewPage.tsx
@@ -84,6 +84,12 @@ import {
   buildHyperframesSubtitleCuesFromEditableText,
   getHyperframesSubtitlePreviewText,
 } from "@shared/hyperframes/subtitleCues";
+import {
+  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
+  computePreviewMatchCompositionHash,
+  computePreviewMatchTimelineHash,
+  type StoryboardPreviewMatchCaptureQuality,
+} from "@shared/storyboardPreviewMatchCapture";
 import {
   HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
   HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
@@ -2278,6 +2284,10 @@ function buildHyperframesSubtitleTextMapFromClips(
 }

 export const __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS = {
+  buildPreviewMatchPayloadPreview,
+  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
+  computePreviewMatchCompositionHash,
+  computePreviewMatchTimelineHash,
   buildHyperframesShotOverlayDraft,
   buildHyperframesSubtitleTextMapFromClips,
   defaultHyperframesSubtitleText,
@@ -2394,6 +2404,14 @@ function buildHyperframesFinalPayloadPreview(input: {
   );
 }

+function buildPreviewMatchPayloadPreview(
+  input: Parameters<typeof buildHyperframesFinalPayloadPreview>[0],
+) {
+  return buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+    JSON.parse(buildHyperframesFinalPayloadPreview(input)),
+  );
+}
+
 function extractHyperframesPromptFromSkillMessage(message: string | undefined | null): string {
   const trimmed = String(message ?? "").trim();
   if (!trimmed) return "";
@@ -3393,6 +3411,8 @@ export default function StoryboardReviewPage() {
   const [hyperframesFinalShotTransitionById, setHyperframesFinalShotTransitionById] = useState<Record<string, HyperframesFinalShotTransition>>({});
   const [hyperframesFinalShotTextMotionById, setHyperframesFinalShotTextMotionById] = useState<Record<string, HyperframesFinalTextMotionPreset>>({});
   const [hyperframesFinalCompositeCooldownUntil, setHyperframesFinalCompositeCooldownUntil] = useState(0);
+  const [previewMatchCaptureQuality, setPreviewMatchCaptureQuality] =
+    useState<StoryboardPreviewMatchCaptureQuality>("standard");
   const [hyperframesFinalPreviewShotIndex, setHyperframesFinalPreviewShotIndex] = useState(0);
   const [hyperframesFinalSfxDrafts, setHyperframesFinalSfxDrafts] = useState<HyperframesFinalSfxDraft[]>(() =>
     DEFAULT_HYPERFRAMES_FINAL_SFX_IDS.map((id, index) => buildDefaultHyperframesFinalSfxDraft(id, index)),
@@ -7051,6 +7071,21 @@ export default function StoryboardReviewPage() {
       resolvedHyperframesFinalOverlayPreset,
     ],
   );
+  const previewMatchCompositionPayload = useMemo(
+    () =>
+      buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+        JSON.parse(hyperframesFinalPayloadPreview),
+      ),
+    [hyperframesFinalPayloadPreview],
+  );
+  const previewMatchCompositionHash = useMemo(
+    () => computePreviewMatchCompositionHash(previewMatchCompositionPayload),
+    [previewMatchCompositionPayload],
+  );
+  const previewMatchTimelineHash = useMemo(
+    () => computePreviewMatchTimelineHash(previewMatchCompositionPayload),
+    [previewMatchCompositionPayload],
+  );

   const hyperframesFinalHasUnsavedTextEdits = useMemo(
     () =>
@@ -7109,6 +7144,13 @@ export default function StoryboardReviewPage() {
       updateHyperframesFinalCompositeStateMutation.isPending ||
       hyperframesFinalCompositeRenderBlockedReason
   );
+  const previewMatchCaptureApiUnavailableReason = locale === "th"
+    ? "Presentation Capture API จะเปิดในขั้นตอนถัดไป ตอนนี้เตรียม payload และ hash ให้ตรงกับ preview แล้ว"
+    : "Presentation Capture API is wired in the next implementation section. The preview payload and hashes are ready.";
+  const previewMatchHighQualityEnabled = false;
+  const previewMatchCaptureDisabledReason =
+    hyperframesFinalCompositeDisabledReason ?? previewMatchCaptureApiUnavailableReason;
+  const previewMatchCaptureButtonDisabled = true;

   const generateHyperframesFinalPromptWithSkill = useCallback(async () => {
     if (hyperframesFinalSourceClips.length === 0) {
@@ -7688,6 +7730,10 @@ export default function StoryboardReviewPage() {
     resolvedHyperframesFinalOverlayPreset,
   ]);

+  const createPreviewMatchFinalCompositeCapture = useCallback(() => {
+    toast.info(previewMatchCaptureDisabledReason);
+  }, [previewMatchCaptureDisabledReason]);
+
   const inferredRenderAspectRatio = useMemo(
     () => inferStoryboardRenderAspectRatio(selectedRenderClips),
     [selectedRenderClips],
@@ -9097,6 +9143,42 @@ export default function StoryboardReviewPage() {
                 </p>
               </div>
               <div className="flex shrink-0 flex-wrap gap-1.5">
+                <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700">
+                  <Layers className="h-3.5 w-3.5 text-emerald-700" />
+                  <span className="sr-only">
+                    {locale === "th" ? "คุณภาพ Capture ตาม Preview" : "Preview capture quality"}
+                  </span>
+                  <select
+                    value={previewMatchCaptureQuality}
+                    onChange={event =>
+                      setPreviewMatchCaptureQuality(
+                        event.target.value as StoryboardPreviewMatchCaptureQuality,
+                      )
+                    }
+                    className="h-6 bg-transparent text-[11px] font-semibold outline-none"
+                    aria-label={locale === "th" ? "คุณภาพ Capture ตาม Preview" : "Preview capture quality"}
+                  >
+                    <option value="standard">
+                      {locale === "th" ? "Standard" : "Standard"}
+                    </option>
+                    <option value="high" disabled={!previewMatchHighQualityEnabled}>
+                      {locale === "th" ? "High" : "High"}
+                    </option>
+                  </select>
+                </label>
+                <Button
+                  type="button"
+                  size="sm"
+                  variant="outline"
+                  onClick={createPreviewMatchFinalCompositeCapture}
+                  disabled={previewMatchCaptureButtonDisabled}
+                  className="h-8 border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-900 hover:bg-emerald-100"
+                  title={previewMatchCaptureDisabledReason}
+                  aria-disabled={previewMatchCaptureButtonDisabled}
+                >
+                  <Layers className="mr-2 h-4 w-4" />
+                  {locale === "th" ? "Capture ตาม Preview" : "Capture Final Composite"}
+                </Button>
                 <Button
                   type="button"
                   size="sm"
@@ -9249,6 +9331,23 @@ export default function StoryboardReviewPage() {
                 </div>
               </div>
             ) : null}
+            <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-950">
+              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
+                <p className="font-medium">
+                  {locale === "th"
+                    ? "Presentation Capture เตรียม payload จาก preview runtime แล้ว"
+                    : "Presentation Capture payload is prepared from the preview runtime."}
+                </p>
+                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-emerald-800">
+                  <span>{previewMatchCaptureQuality}</span>
+                  <span>{previewMatchCompositionHash}</span>
+                  <span>{previewMatchTimelineHash}</span>
+                </div>
+              </div>
+              <p className="mt-1 leading-relaxed text-emerald-800">
+                {previewMatchCaptureDisabledReason}
+              </p>
+            </div>
             {hyperframesFinalCompositeRenderBlockedReason ? (
               <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                 <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
diff --git a/apps/web/shared/__tests__/storyboardPreviewMatchCapture.test.ts b/apps/web/shared/__tests__/storyboardPreviewMatchCapture.test.ts
new file mode 100644
index 00000000..2b954ef5
--- /dev/null
+++ b/apps/web/shared/__tests__/storyboardPreviewMatchCapture.test.ts
@@ -0,0 +1,155 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
+  computePreviewMatchCompositionHash,
+  computePreviewMatchTimelineHash,
+  storyboardPreviewMatchCaptureEngineSchema,
+  storyboardPreviewMatchCaptureProjectionSchema,
+  storyboardPreviewMatchCaptureQualitySchema,
+} from "../storyboardPreviewMatchCapture";
+
+function baseHyperframesPreview() {
+  return {
+    output: {
+      width: 1080,
+      height: 1920,
+      fps: 30,
+      durationSeconds: 6,
+    },
+    text: {
+      overlayPreset: "badge_cascade",
+      subtitlePreset: "pill",
+      textMotionPreset: "smooth",
+      fontFamily: "Prompt",
+    },
+    audio: {
+      preserveNativeAudio: true,
+      musicPresetId: null,
+      sfxPresetIds: [],
+    },
+    shots: [
+      {
+        id: "shot-1",
+        index: 0,
+        sourceClipId: "clip-1",
+        sourceVideoRef: "storage://clip-1.mp4",
+        mediaStartSec: 0,
+        startSec: 0,
+        endSec: 3,
+        durationSeconds: 3,
+        overlayPreset: "badge_cascade",
+        animationPreset: "smooth_reveal",
+        transition: "fade",
+        textMotionPreset: "smooth",
+        onScreenText: ["คุณแม่ทราบกันไหม"],
+        subtitleCues: [
+          { startSec: 0.4, endSec: 2.2, text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก" },
+        ],
+        subtitleText: ["display text only"],
+        subtitleVtt: "WEBVTT",
+        subtitleSrt: "1",
+      },
+    ],
+  };
+}
+
+describe("storyboardPreviewMatchCapture shared contract", () => {
+  it("accepts only known quality values", () => {
+    expect(storyboardPreviewMatchCaptureQualitySchema.parse("standard")).toBe("standard");
+    expect(storyboardPreviewMatchCaptureQualitySchema.parse("high")).toBe("high");
+    expect(() => storyboardPreviewMatchCaptureQualitySchema.parse("draft")).toThrow();
+  });
+
+  it("keeps preview-match capture as a sibling render engine", () => {
+    expect(storyboardPreviewMatchCaptureEngineSchema.parse("hyperframes_worker")).toBe(
+      "hyperframes_worker",
+    );
+    expect(storyboardPreviewMatchCaptureEngineSchema.parse("preview_match_browser_capture")).toBe(
+      "preview_match_browser_capture",
+    );
+  });
+
+  it("validates a safe capture projection contract", () => {
+    const parsed = storyboardPreviewMatchCaptureProjectionSchema.parse({
+      captureJobId: "capture-1",
+      engine: "preview_match_browser_capture",
+      quality: "standard",
+      status: "capturing",
+      stage: "capture_browser",
+      progressPercent: 42,
+      previewCompositionHash: "pmc_12345678",
+      timelineHash: "pmt_12345678",
+      safeMessage: "Capturing preview runtime",
+      failureCode: null,
+      canCancel: true,
+      canRetry: false,
+      outputUrl: null,
+    });
+
+    expect(parsed.safeDiagnostics).toEqual([]);
+    expect(() =>
+      storyboardPreviewMatchCaptureProjectionSchema.parse({
+        ...parsed,
+        failureCode: "raw_worker_stack_trace",
+      }),
+    ).toThrow();
+  });
+
+  it("builds a payload that preserves structured subtitle cues", () => {
+    const payload = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+      baseHyperframesPreview(),
+    );
+
+    expect(payload.engine).toBe("preview_match_browser_capture");
+    expect(payload.shots[0].subtitleCues).toEqual([
+      { startSec: 0.4, endSec: 2.2, text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก" },
+    ]);
+    expect(payload.shots[0].subtitleText).toEqual(["display text only"]);
+  });
+
+  it("changes the composition hash when render-facing fields change", () => {
+    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+      baseHyperframesPreview(),
+    );
+    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
+      ...baseHyperframesPreview(),
+      text: {
+        ...baseHyperframesPreview().text,
+        overlayPreset: "premium_product_hero",
+      },
+    });
+
+    expect(computePreviewMatchCompositionHash(changed)).not.toBe(
+      computePreviewMatchCompositionHash(original),
+    );
+  });
+
+  it("changes the timeline hash when subtitle timing changes", () => {
+    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+      baseHyperframesPreview(),
+    );
+    const changedPreview = baseHyperframesPreview();
+    changedPreview.shots[0].subtitleCues[0].startSec = 1.1;
+    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview(changedPreview);
+
+    expect(computePreviewMatchTimelineHash(changed)).not.toBe(
+      computePreviewMatchTimelineHash(original),
+    );
+  });
+
+  it("ignores non-rendering UI-only state when hashing", () => {
+    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
+      ...baseHyperframesPreview(),
+      uiOnlyExpanded: true,
+    });
+    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
+      ...baseHyperframesPreview(),
+      uiOnlyExpanded: false,
+    });
+
+    expect(computePreviewMatchCompositionHash(changed)).toBe(
+      computePreviewMatchCompositionHash(original),
+    );
+  });
+});
diff --git a/apps/web/shared/storyboardPreviewMatchCapture.ts b/apps/web/shared/storyboardPreviewMatchCapture.ts
new file mode 100644
index 00000000..579c5166
--- /dev/null
+++ b/apps/web/shared/storyboardPreviewMatchCapture.ts
@@ -0,0 +1,283 @@
+import { z } from "zod";
+import { stableHash } from "./hyperframes/contracts";
+
+export const storyboardPreviewMatchCaptureEngineValues = [
+  "hyperframes_worker",
+  "preview_match_browser_capture",
+] as const;
+
+export const storyboardPreviewMatchCaptureQualityValues = [
+  "standard",
+  "high",
+] as const;
+
+export const storyboardPreviewMatchCaptureStatusValues = [
+  "not_started",
+  "queued",
+  "preparing_assets",
+  "browser_ready",
+  "capturing",
+  "encoding",
+  "verifying",
+  "publishing",
+  "completed",
+  "saved_to_library",
+  "cancelled",
+  "failed_transient",
+  "failed_permanent",
+  "verification_failed",
+  "compliance_blocked",
+] as const;
+
+export const storyboardPreviewMatchCaptureStageValues = [
+  "queue",
+  "prepare_assets",
+  "browser_ready",
+  "capture_browser",
+  "encode_mp4",
+  "verify_output",
+  "publish_library",
+] as const;
+
+export const storyboardPreviewMatchCaptureFailureCodeValues = [
+  "feature_disabled",
+  "invalid_quality",
+  "missing_source_video",
+  "stale_preview_hash",
+  "route_token_invalid",
+  "browser_launch_failed",
+  "capture_ready_timeout",
+  "browser_recording_unavailable",
+  "encode_failed",
+  "verification_failed",
+  "stale_attempt",
+  "cancelled",
+] as const;
+
+export const storyboardPreviewMatchCaptureEngineSchema = z.enum(
+  storyboardPreviewMatchCaptureEngineValues,
+);
+
+export const storyboardPreviewMatchCaptureQualitySchema = z.enum(
+  storyboardPreviewMatchCaptureQualityValues,
+);
+
+export const storyboardPreviewMatchCaptureStatusSchema = z.enum(
+  storyboardPreviewMatchCaptureStatusValues,
+);
+
+export const storyboardPreviewMatchCaptureStageSchema = z.enum(
+  storyboardPreviewMatchCaptureStageValues,
+);
+
+export const storyboardPreviewMatchCaptureFailureCodeSchema = z.enum(
+  storyboardPreviewMatchCaptureFailureCodeValues,
+);
+
+export type StoryboardFinalCompositeRenderEngine =
+  (typeof storyboardPreviewMatchCaptureEngineValues)[number];
+
+export type StoryboardPreviewMatchCaptureQuality =
+  (typeof storyboardPreviewMatchCaptureQualityValues)[number];
+
+export type StoryboardPreviewMatchCaptureStatus =
+  (typeof storyboardPreviewMatchCaptureStatusValues)[number];
+
+export type StoryboardPreviewMatchCaptureStage =
+  (typeof storyboardPreviewMatchCaptureStageValues)[number];
+
+export type StoryboardPreviewMatchCaptureFailureCode =
+  (typeof storyboardPreviewMatchCaptureFailureCodeValues)[number];
+
+export const storyboardPreviewMatchCaptureProjectionSchema = z.object({
+  captureJobId: z.string().min(1).nullable(),
+  engine: z.literal("preview_match_browser_capture"),
+  quality: storyboardPreviewMatchCaptureQualitySchema,
+  status: storyboardPreviewMatchCaptureStatusSchema,
+  stage: storyboardPreviewMatchCaptureStageSchema.nullable(),
+  progressPercent: z.number().min(0).max(100).default(0),
+  previewCompositionHash: z.string().min(1).nullable(),
+  timelineHash: z.string().min(1).nullable(),
+  safeMessage: z.string().nullable(),
+  safeDiagnostics: z.array(z.string()).default([]),
+  failureCode: storyboardPreviewMatchCaptureFailureCodeSchema.nullable(),
+  canCancel: z.boolean().default(false),
+  canRetry: z.boolean().default(false),
+  outputUrl: z.string().nullable(),
+});
+
+export type StoryboardPreviewMatchCaptureProjection =
+  z.infer<typeof storyboardPreviewMatchCaptureProjectionSchema>;
+
+export type PreviewMatchSubtitleCue = {
+  startSec: number;
+  endSec: number;
+  text: string;
+};
+
+export type PreviewMatchCompositionPayload = {
+  engine: "preview_match_browser_capture";
+  output: {
+    width: number;
+    height: number;
+    fps: number;
+    durationSeconds: number;
+  };
+  text: Record<string, unknown>;
+  audio: Record<string, unknown>;
+  shots: Array<{
+    id: string;
+    index: number;
+    sourceClipId: string;
+    sourceVideoRef: string | null;
+    mediaStartSec: number;
+    startSec: number;
+    endSec: number;
+    durationSeconds: number;
+    overlayPreset: string;
+    animationPreset: string;
+    transition: string;
+    textMotionPreset: string;
+    onScreenText: string[];
+    subtitleCues: PreviewMatchSubtitleCue[];
+    subtitleText: string[];
+    subtitleVtt: string | null;
+    subtitleSrt: string | null;
+  }>;
+};
+
+function asRecord(value: unknown): Record<string, unknown> {
+  return value && typeof value === "object" && !Array.isArray(value)
+    ? value as Record<string, unknown>
+    : {};
+}
+
+function asNumber(value: unknown, fallback: number): number {
+  const numberValue = Number(value);
+  return Number.isFinite(numberValue) ? numberValue : fallback;
+}
+
+function roundTenth(value: unknown, fallback = 0): number {
+  return Math.round(asNumber(value, fallback) * 10) / 10;
+}
+
+function asString(value: unknown, fallback = ""): string {
+  return typeof value === "string" ? value : fallback;
+}
+
+function asStringArray(value: unknown): string[] {
+  if (!Array.isArray(value)) return [];
+  return value
+    .map(item => asString(item).trim())
+    .filter(Boolean);
+}
+
+function normalizeSubtitleCues(value: unknown): PreviewMatchSubtitleCue[] {
+  if (!Array.isArray(value)) return [];
+  return value
+    .map(cue => {
+      const record = asRecord(cue);
+      return {
+        startSec: roundTenth(record.startSec),
+        endSec: roundTenth(record.endSec),
+        text: asString(record.text).trim(),
+      };
+    })
+    .filter(cue => cue.text && cue.endSec >= cue.startSec);
+}
+
+function normalizePlainRecord(value: unknown): Record<string, unknown> {
+  const record = asRecord(value);
+  return Object.fromEntries(
+    Object.entries(record).filter(([_key, child]) => child !== undefined),
+  );
+}
+
+export function buildPreviewMatchCompositionPayloadFromHyperframesPreview(
+  preview: unknown,
+): PreviewMatchCompositionPayload {
+  const record = asRecord(preview);
+  const output = asRecord(record.output);
+  const shots = Array.isArray(record.shots) ? record.shots : [];
+
+  return {
+    engine: "preview_match_browser_capture",
+    output: {
+      width: Math.max(1, Math.round(asNumber(output.width, 1080))),
+      height: Math.max(1, Math.round(asNumber(output.height, 1920))),
+      fps: Math.max(1, Math.round(asNumber(output.fps, 30))),
+      durationSeconds: roundTenth(output.durationSeconds, 0),
+    },
+    text: normalizePlainRecord(record.text),
+    audio: normalizePlainRecord(record.audio),
+    shots: shots.map((shot, index) => {
+      const shotRecord = asRecord(shot);
+      return {
+        id: asString(shotRecord.id, `shot-${index + 1}`),
+        index: Math.round(asNumber(shotRecord.index, index)),
+        sourceClipId: asString(shotRecord.sourceClipId, asString(shotRecord.id, `shot-${index + 1}`)),
+        sourceVideoRef: asString(shotRecord.sourceVideoRef).trim() || null,
+        mediaStartSec: roundTenth(shotRecord.mediaStartSec),
+        startSec: roundTenth(shotRecord.startSec),
+        endSec: roundTenth(shotRecord.endSec, roundTenth(shotRecord.durationSeconds, 0)),
+        durationSeconds: Math.max(0, roundTenth(shotRecord.durationSeconds)),
+        overlayPreset: asString(shotRecord.overlayPreset, "default"),
+        animationPreset: asString(shotRecord.animationPreset, "smooth_reveal"),
+        transition: asString(shotRecord.transition, "fade"),
+        textMotionPreset: asString(shotRecord.textMotionPreset, "smooth"),
+        onScreenText: asStringArray(shotRecord.onScreenText),
+        subtitleCues: normalizeSubtitleCues(shotRecord.subtitleCues),
+        subtitleText: asStringArray(shotRecord.subtitleText),
+        subtitleVtt: asString(shotRecord.subtitleVtt).trim() || null,
+        subtitleSrt: asString(shotRecord.subtitleSrt).trim() || null,
+      };
+    }),
+  };
+}
+
+export function computePreviewMatchCompositionHash(payload: PreviewMatchCompositionPayload): string {
+  return stableHash({
+    engine: payload.engine,
+    output: payload.output,
+    text: payload.text,
+    audio: payload.audio,
+    shots: payload.shots.map(shot => ({
+      id: shot.id,
+      sourceClipId: shot.sourceClipId,
+      sourceVideoRef: shot.sourceVideoRef,
+      mediaStartSec: shot.mediaStartSec,
+      startSec: shot.startSec,
+      endSec: shot.endSec,
+      durationSeconds: shot.durationSeconds,
+      overlayPreset: shot.overlayPreset,
+      animationPreset: shot.animationPreset,
+      transition: shot.transition,
+      textMotionPreset: shot.textMotionPreset,
+      onScreenText: shot.onScreenText,
+      subtitleCues: shot.subtitleCues,
+      subtitleVtt: shot.subtitleVtt,
+      subtitleSrt: shot.subtitleSrt,
+    })),
+  }).replace(/^hf_/, "pmc_");
+}
+
+export function computePreviewMatchTimelineHash(payload: PreviewMatchCompositionPayload): string {
+  return stableHash({
+    output: {
+      fps: payload.output.fps,
+      durationSeconds: payload.output.durationSeconds,
+    },
+    shots: payload.shots.map(shot => ({
+      id: shot.id,
+      sourceVideoRef: shot.sourceVideoRef,
+      mediaStartSec: shot.mediaStartSec,
+      startSec: shot.startSec,
+      endSec: shot.endSec,
+      durationSeconds: shot.durationSeconds,
+      subtitleCues: shot.subtitleCues,
+      animationPreset: shot.animationPreset,
+      transition: shot.transition,
+      textMotionPreset: shot.textMotionPreset,
+    })),
+  }).replace(/^hf_/, "pmt_");
+}
