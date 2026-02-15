diff --git a/apps/web/.env.example b/apps/web/.env.example
index 81326fe..3e28d22 100644
--- a/apps/web/.env.example
+++ b/apps/web/.env.example
@@ -40,6 +40,10 @@ MCP_MAX_WRITE_BYTES=1048576
 MCP_REQUIRE_WRITE_TOKEN=1
 MCP_WRITE_TOKEN=replace_me_write_token
 
+# PostHog Analytics (optional - write-only key, safe for client bundles)
+# VITE_POSTHOG_API_KEY=phc_your_key_here
+# POSTHOG_API_KEY=phc_your_server_key_here
+
 # S3/R2 Storage (optional)
 # S3_ACCESS_KEY_ID=
 # S3_SECRET_ACCESS_KEY=
diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 5602db7..c69876e 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -7,9 +7,11 @@ import TerminalPage from "@/pages/TerminalPage";
 import CLIPage from "@/pages/CLIPage";
 import Factory from "@/pages/Factory";
 import VideoEditorPage from "@/pages/VideoEditorPage";
-import { Route, Switch, Redirect } from "wouter";
+import { Route, Switch, Redirect, useLocation } from "wouter";
 import { HelmetProvider } from "react-helmet-async";
+import { useEffect, useRef } from "react";
 import ErrorBoundary from "./components/ErrorBoundary";
+import { getPostHog } from "@/lib/posthog";
 import { ThemeProvider } from "./contexts/ThemeContext";
 import { AuthProvider } from "./contexts/AuthContext";
 import { TenantProvider } from "./contexts/TenantContext";
@@ -78,9 +80,25 @@ import TaskQueueMonitor from "./pages/TaskQueueMonitor";
 import Workflows from "./pages/Workflows";
 import WorkflowEditor from "./pages/WorkflowEditor";
 
+function PostHogPageViewTracker() {
+  const [location] = useLocation();
+  const prevPath = useRef(location);
+
+  useEffect(() => {
+    if (location !== prevPath.current) {
+      prevPath.current = location;
+      getPostHog()?.capture("$pageview", { $current_url: window.location.href });
+    }
+  }, [location]);
+
+  return null;
+}
+
 function Router() {
   // make sure to consider if you need authentication for certain routes
   return (
+    <>
+    <PostHogPageViewTracker />
     <Switch>
       <Route path="/" component={Home} />
       <Route path="/pricing" component={Pricing} />
@@ -157,6 +175,7 @@ function Router() {
       <Route path="/404" component={NotFound} />
       <Route component={NotFound} />
     </Switch>
+    </>
   );
 }
 
diff --git a/apps/web/client/src/lib/posthog.ts b/apps/web/client/src/lib/posthog.ts
new file mode 100644
index 0000000..d0f1a8f
--- /dev/null
+++ b/apps/web/client/src/lib/posthog.ts
@@ -0,0 +1,36 @@
+/**
+ * PostHog Client-Side SDK Initialization
+ *
+ * Provides product analytics with:
+ * - Manual pageview tracking (SPA-aware)
+ * - Identity management (anonymous -> identified)
+ * - Event capture helpers
+ */
+
+import posthog from "posthog-js";
+
+let initialized = false;
+
+export function initPostHog(): void {
+  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
+  if (!apiKey || initialized) return;
+
+  posthog.init(apiKey, {
+    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
+    person_profiles: "identified_only",
+    autocapture: false,
+    capture_pageview: false,
+    session_recording: { maskAllInputs: true },
+  });
+
+  initialized = true;
+}
+
+/**
+ * Returns the PostHog instance, or null if not initialized.
+ * All client-side PostHog calls should go through this getter.
+ */
+export function getPostHog(): typeof posthog | null {
+  if (!initialized) return null;
+  return posthog;
+}
diff --git a/apps/web/client/src/main.tsx b/apps/web/client/src/main.tsx
index fcd06cc..aa71542 100644
--- a/apps/web/client/src/main.tsx
+++ b/apps/web/client/src/main.tsx
@@ -51,6 +51,10 @@ if (import.meta.env.VITE_SENTRY_DSN) {
   });
 }
 
+// Initialize PostHog for product analytics (only when API key is configured)
+import { initPostHog } from "@/lib/posthog";
+initPostHog();
+
 const queryClient = new QueryClient();
 
 let isRedirectingToLogin = false;
diff --git a/apps/web/client/src/pages/Generate.tsx b/apps/web/client/src/pages/Generate.tsx
index cc82b92..597de41 100644
--- a/apps/web/client/src/pages/Generate.tsx
+++ b/apps/web/client/src/pages/Generate.tsx
@@ -7,6 +7,7 @@ import { useEffect, useState } from 'react';
 import { useLocation } from 'wouter';
 import { motion } from 'framer-motion';
 import { useAuth } from '@/contexts/AuthContext';
+import { getPostHog } from '@/lib/posthog';
 import { Button } from '@/components/ui/button';
 import {
   Sparkles,
@@ -69,7 +70,8 @@ export default function Generate() {
 
   const handleGenerate = async () => {
     if (!prompt.trim()) return;
-    
+
+    getPostHog()?.capture("job_create_clicked", { job_type: activeTab });
     setIsGenerating(true);
     // Simulate generation
     setTimeout(() => {
diff --git a/apps/web/client/src/pages/Login.tsx b/apps/web/client/src/pages/Login.tsx
index f81ee4d..b2ee09d 100644
--- a/apps/web/client/src/pages/Login.tsx
+++ b/apps/web/client/src/pages/Login.tsx
@@ -7,6 +7,7 @@ import { useState, useEffect } from 'react';
 import { motion } from 'framer-motion';
 import { Link, useLocation } from 'wouter';
 import { generateFingerprint } from '@/lib/fingerprint';
+import { getPostHog } from '@/lib/posthog';
 import { useAuth } from '@/_core/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
@@ -96,6 +97,7 @@ export default function Login() {
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
+    getPostHog()?.capture("login_started", { auth_method: "email" });
     setIsLoading(true);
 
     try {
@@ -124,12 +126,15 @@ export default function Login() {
       }
 
       if (result?.success) {
+        getPostHog()?.identify(result.userId || result.id || email);
+        getPostHog()?.capture("login_succeeded", { auth_method: "email" });
         toast.success('Login successful! Redirecting...');
         setNeedsVerification(false);
         const redirectUrl = getReturnUrl();
         window.location.href = redirectUrl;
       } else {
         const errorMessage = result?.message || data.error?.json?.message || 'Invalid email or password';
+        getPostHog()?.capture("login_failed", { failure_reason: errorMessage, auth_method: "email" });
         if (errorMessage.toLowerCase().includes('verify your email')) {
           setNeedsVerification(true);
         }
@@ -137,6 +142,7 @@ export default function Login() {
       }
     } catch (error) {
       console.error('Login error:', error);
+      getPostHog()?.capture("login_failed", { failure_reason: "network_error", auth_method: "email" });
       toast.error('Login failed. Please try again.');
     } finally {
       setIsLoading(false);
diff --git a/apps/web/client/src/pages/Signup.tsx b/apps/web/client/src/pages/Signup.tsx
index 35f376f..86fe923 100644
--- a/apps/web/client/src/pages/Signup.tsx
+++ b/apps/web/client/src/pages/Signup.tsx
@@ -7,6 +7,7 @@ import { useState, useEffect } from 'react';
 import { motion } from 'framer-motion';
 import { Link, useLocation } from 'wouter';
 import { generateFingerprint } from '@/lib/fingerprint';
+import { getPostHog } from '@/lib/posthog';
 import { useAuth } from '@/_core/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
@@ -109,6 +110,7 @@ export default function Signup() {
       return;
     }
 
+    getPostHog()?.capture("signup_started", { plan: selectedPlan });
     setIsLoading(true);
 
     try {
@@ -132,6 +134,12 @@ export default function Signup() {
       const errorMsg = data.error?.json?.message;
 
       if (result?.success) {
+        const ph = getPostHog();
+        const anonId = ph?.get_distinct_id();
+        const userId = result.userId || result.id || formData.email;
+        if (anonId) ph?.alias(anonId, String(userId));
+        ph?.identify(String(userId), { email: formData.email, plan: selectedPlan });
+        ph?.capture("signup_completed", { plan: selectedPlan, auth_method: "email" });
         toast.success('Account created! Please verify your email.');
         navigate(`/verify-email?email=${encodeURIComponent(formData.email)}`);
       } else {
diff --git a/apps/web/client/src/services/__tests__/projectManagerValidation.test.ts b/apps/web/client/src/services/__tests__/projectManagerValidation.test.ts
index 629c5ad..68c746e 100644
--- a/apps/web/client/src/services/__tests__/projectManagerValidation.test.ts
+++ b/apps/web/client/src/services/__tests__/projectManagerValidation.test.ts
@@ -203,10 +203,24 @@ describe("validateProjectStructure — timeline & tracks", () => {
     const p = validProject();
     p.timeline.tracks[0].type = "subtitle";
     expect(() => validateProjectStructure(p)).toThrow(
-      'Track type must be "video", "audio", or "overlay"',
+      'Track type must be "video", "audio", "overlay", or "text"',
     );
   });
 
+  it("accepts text track type", () => {
+    const p = validProject();
+    p.timeline.tracks.push({
+      id: "track-t2",
+      type: "text",
+      name: "T2",
+      clips: [],
+      muted: false,
+      locked: false,
+      visible: true,
+    });
+    expect(() => validateProjectStructure(p)).not.toThrow();
+  });
+
   it("accepts overlay track type", () => {
     const p = validProject();
     p.timeline.tracks.push({
@@ -234,9 +248,15 @@ describe("validateProjectStructure — timeline & tracks", () => {
 // ========================================
 
 describe("validateProjectStructure — clips", () => {
+  function getTrack(project: any, trackId: string): any {
+    const track = project.timeline.tracks.find((t: any) => t.id === trackId);
+    if (!track) throw new Error(`Missing track ${trackId}`);
+    return track;
+  }
+
   function projectWithClip(clipOverrides: any = {}): any {
     const p = validProject();
-    p.timeline.tracks[0].clips.push({
+    getTrack(p, "track-v1").clips.push({
       id: "clip-1",
       assetId: "a1",
       trackId: "track-v1",
@@ -317,14 +337,14 @@ describe("validateProjectStructure — clips", () => {
       speed: 1,
       effects: [],
     }));
-    p.timeline.tracks[0].clips = clips;
+    getTrack(p, "track-v1").clips = clips;
     expect(() => validateProjectStructure(p)).toThrow("Too many clips");
   });
 
   it("validates V2 ms-based clips correctly", () => {
     const p = validProject();
     p.version = "2.0";
-    p.timeline.tracks[0].clips.push({
+    getTrack(p, "track-v1").clips.push({
       id: "c1",
       assetId: "a1",
       trackId: "track-v1",
@@ -342,7 +362,7 @@ describe("validateProjectStructure — clips", () => {
   it("rejects V2 clip with negative startMs", () => {
     const p = validProject();
     p.version = "2.0";
-    p.timeline.tracks[0].clips.push({
+    getTrack(p, "track-v1").clips.push({
       id: "c1",
       assetId: "a1",
       trackId: "track-v1",
@@ -357,7 +377,7 @@ describe("validateProjectStructure — clips", () => {
   it("rejects V2 clip with durationMs > 7200000", () => {
     const p = validProject();
     p.version = "2.0";
-    p.timeline.tracks[0].clips.push({
+    getTrack(p, "track-v1").clips.push({
       id: "c1",
       assetId: "a1",
       trackId: "track-v1",
@@ -370,6 +390,79 @@ describe("validateProjectStructure — clips", () => {
       "durationMs must be 0-7200000",
     );
   });
+
+  it("defaults missing text clip fields on validation", () => {
+    const p = validProject();
+    getTrack(p, "track-t1").clips.push({
+      id: "text-1",
+      assetId: "text-asset-1",
+      trackId: "track-t1",
+      startTime: 0,
+      duration: 3,
+      trimIn: 0,
+      trimOut: 3,
+      textConfig: {
+        text: "Hello",
+      },
+    });
+
+    const result = validateProjectStructure(p);
+    const clip = getTrack(result, "track-t1").clips[0] as any;
+    expect(clip.volume).toBe(0);
+    expect(clip.speed).toBe(1);
+    expect(Array.isArray(clip.effects)).toBe(true);
+    expect(clip.textConfig.fontFamily).toBe("Noto Sans");
+    expect(clip.textConfig.effect).toBe("none");
+  });
+
+  it("rejects unsupported text effects under strict parity", () => {
+    const p = validProject();
+    getTrack(p, "track-t1").clips.push({
+      id: "text-1",
+      assetId: "text-asset-1",
+      trackId: "track-t1",
+      startTime: 0,
+      duration: 3,
+      trimIn: 0,
+      trimOut: 3,
+      textConfig: {
+        text: "Hello",
+        effect: "typewriter",
+      },
+    });
+
+    expect(() => validateProjectStructure(p)).toThrow("not supported in strict_parity mode");
+  });
+
+  it("rejects duplicate text keyframe timestamps", () => {
+    const p = validProject();
+    getTrack(p, "track-t1").clips.push({
+      id: "text-1",
+      assetId: "text-asset-1",
+      trackId: "track-t1",
+      startTime: 0,
+      duration: 3,
+      trimIn: 0,
+      trimOut: 3,
+      textConfig: {
+        text: "Hello",
+      },
+      transform: {
+        x: 0.5,
+        y: 0.5,
+        scaleX: 1,
+        scaleY: 1,
+        rotation: 0,
+        opacity: 1,
+        keyframes: [
+          { time: 0.5, x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
+          { time: 0.5, x: 0.6, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
+        ],
+      },
+    });
+
+    expect(() => validateProjectStructure(p)).toThrow("unique time markers");
+  });
 });
 
 // ========================================
diff --git a/apps/web/client/src/services/projectManager.ts b/apps/web/client/src/services/projectManager.ts
index 14fbf5a..eb3684f 100644
--- a/apps/web/client/src/services/projectManager.ts
+++ b/apps/web/client/src/services/projectManager.ts
@@ -4,7 +4,7 @@
  * Platform-aware: uses Tauri APIs on desktop, web APIs on browser.
  */
 
-import type { VideoEditorProject } from '../types/videoEditor';
+import type { TextConfig, TransformKeyframe, VideoEditorProject } from '../types/videoEditor';
 import { migrateProjectV1ToV2 } from '../types/videoEditor';
 
 // ========================================
@@ -34,6 +34,144 @@ async function getTauriApis() {
 // Validation
 // ========================================
 
+export const TEXT_CONTRACT_VERSION = '1.0';
+
+export const STRICT_PARITY_TEXT_CAPABILITY_MATRIX = Object.freeze({
+  mode: 'strict_parity',
+  supportedEffects: ['none', 'shadow', 'outline'] as const,
+  unsupportedEffects: ['glow', 'typewriter', 'fade-in-word'] as const,
+  supportsPerPropertyEasingOverride: false,
+});
+
+const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
+
+function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
+  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
+  return Math.max(min, Math.min(max, value));
+}
+
+function sanitizeColor(value: unknown, fallback: string): string {
+  if (typeof value !== 'string') return fallback;
+  if (value === 'transparent') return value;
+  if (!HEX_COLOR_RE.test(value)) return fallback;
+  return value.toLowerCase();
+}
+
+function hasTextSemantics(projectData: any): boolean {
+  const tracks = projectData?.timeline?.tracks;
+  if (!Array.isArray(tracks)) return false;
+  return tracks.some((track: any) => {
+    if (track?.type === 'text') return true;
+    if (!Array.isArray(track?.clips)) return false;
+    return track.clips.some((clip: any) => !!clip?.textConfig);
+  });
+}
+
+function majorVersion(value: string): number | null {
+  const [majorRaw] = value.split('.');
+  const parsed = Number.parseInt(majorRaw, 10);
+  if (!Number.isFinite(parsed)) return null;
+  return parsed;
+}
+
+function validateTextContractVersion(projectData: any): void {
+  if (typeof projectData.contractVersion !== 'string') return;
+
+  const projectMajor = majorVersion(projectData.contractVersion);
+  const supportedMajor = majorVersion(TEXT_CONTRACT_VERSION);
+  if (projectMajor === null || supportedMajor === null) {
+    throw new Error('Invalid text contractVersion format (expected: X.Y)');
+  }
+  if (projectMajor <= supportedMajor) return;
+
+  const policy = projectData.compatibilityPolicy?.unsupportedContractPolicy ?? 'reject_with_clear_error';
+  if (policy === 'gated_downgrade' && !hasTextSemantics(projectData)) {
+    return;
+  }
+  throw new Error(
+    `Unsupported text contractVersion "${projectData.contractVersion}" (policy: ${policy})`,
+  );
+}
+
+function validateTransformKeyframes(rawKeyframes: any): TransformKeyframe[] {
+  if (!Array.isArray(rawKeyframes)) return [];
+
+  const normalized = rawKeyframes.map((keyframe: any) => {
+    if (typeof keyframe !== 'object' || keyframe === null) {
+      throw new Error('Text keyframe must be an object');
+    }
+    const time = clampNumber(keyframe.time, 0, 1, -1);
+    if (time < 0 || time > 1) {
+      throw new Error('Text keyframe time must be between 0 and 1');
+    }
+    return {
+      time,
+      x: clampNumber(keyframe.x, 0, 1, 0.5),
+      y: clampNumber(keyframe.y, 0, 1, 0.5),
+      scaleX: clampNumber(keyframe.scaleX, 0.1, 3, 1),
+      scaleY: clampNumber(keyframe.scaleY, 0.1, 3, 1),
+      rotation: clampNumber(keyframe.rotation, -360, 360, 0),
+      opacity: clampNumber(keyframe.opacity, 0, 1, 1),
+      easing: typeof keyframe.easing === 'string' ? keyframe.easing : 'linear',
+    } satisfies TransformKeyframe;
+  });
+
+  normalized.sort((a, b) => a.time - b.time);
+  for (let i = 1; i < normalized.length; i++) {
+    if (Math.abs(normalized[i].time - normalized[i - 1].time) <= 0.000001) {
+      throw new Error('Text keyframes must use unique time markers');
+    }
+  }
+  return normalized;
+}
+
+export function validateTextCapabilityMatrixCompliance(config: TextConfig): void {
+  const supported = new Set(STRICT_PARITY_TEXT_CAPABILITY_MATRIX.supportedEffects);
+  if (!supported.has(config.effect)) {
+    throw new Error(
+      `Text effect "${config.effect}" is not supported in ${STRICT_PARITY_TEXT_CAPABILITY_MATRIX.mode} mode`,
+    );
+  }
+}
+
+function normalizeTextConfig(rawConfig: any): TextConfig {
+  if (typeof rawConfig !== 'object' || rawConfig === null) {
+    throw new Error('Text clip must include textConfig object');
+  }
+
+  const text = typeof rawConfig.text === 'string' ? rawConfig.text.trim() : '';
+  if (!text) {
+    throw new Error('Text clip text must be non-empty');
+  }
+
+  const normalized: TextConfig = {
+    text,
+    fontFamily:
+      typeof rawConfig.fontFamily === 'string' && rawConfig.fontFamily.trim().length > 0
+        ? rawConfig.fontFamily.trim()
+        : 'Noto Sans',
+    fontSize: clampNumber(rawConfig.fontSize, 8, 256, 48),
+    fontWeight: clampNumber(rawConfig.fontWeight, 100, 900, 700),
+    fontStyle: rawConfig.fontStyle === 'italic' ? 'italic' : 'normal',
+    color: sanitizeColor(rawConfig.color, '#ffffff'),
+    backgroundColor: sanitizeColor(rawConfig.backgroundColor, 'transparent'),
+    textAlign: rawConfig.textAlign === 'left' || rawConfig.textAlign === 'right' ? rawConfig.textAlign : 'center',
+    effect:
+      rawConfig.effect === 'none' ||
+      rawConfig.effect === 'shadow' ||
+      rawConfig.effect === 'outline' ||
+      rawConfig.effect === 'glow' ||
+      rawConfig.effect === 'typewriter' ||
+      rawConfig.effect === 'fade-in-word'
+        ? rawConfig.effect
+        : 'none',
+    effectColor: sanitizeColor(rawConfig.effectColor, '#000000'),
+  };
+
+  validateTextCapabilityMatrixCompliance(normalized);
+  return normalized;
+}
+
 /**
  * Validate project structure to prevent malicious data.
  * Exported for testing.
@@ -52,6 +190,8 @@ export function validateProjectStructure(data: any): VideoEditorProject {
     throw new Error('Project name must be 1-256 characters');
   }
 
+  validateTextContractVersion(data);
+
   // Validate settings
   if (typeof data.settings !== 'object') {
     throw new Error('Missing settings object');
@@ -96,9 +236,8 @@ export function validateProjectStructure(data: any): VideoEditorProject {
       throw new Error('Track name must be valid string');
     }
 
-    // BUG FIX: was missing 'overlay' — Phase 3 uses overlay tracks
-    if (!['video', 'audio', 'overlay'].includes(track.type)) {
-      throw new Error('Track type must be "video", "audio", or "overlay"');
+    if (!['video', 'audio', 'overlay', 'text'].includes(track.type)) {
+      throw new Error('Track type must be "video", "audio", "overlay", or "text"');
     }
 
     if (!Array.isArray(track.clips)) {
@@ -136,9 +275,33 @@ export function validateProjectStructure(data: any): VideoEditorProject {
         }
       }
 
-      if (typeof clip.volume !== 'number' || clip.volume < 0 || clip.volume > 2) {
+      if (typeof clip.volume !== 'number') {
+        clip.volume = track.type === 'text' ? 0 : 1;
+      }
+      if (clip.volume < 0 || clip.volume > 2) {
         throw new Error('Clip volume must be 0-2');
       }
+      if (typeof clip.speed !== 'number') {
+        clip.speed = 1;
+      }
+      if (!Array.isArray(clip.effects)) {
+        clip.effects = [];
+      }
+      if (track.type === 'text' || clip.textConfig) {
+        clip.textConfig = normalizeTextConfig(clip.textConfig);
+        if (typeof clip.transform !== 'object' || clip.transform === null) {
+          clip.transform = {
+            x: 0.5,
+            y: 0.5,
+            scaleX: 1,
+            scaleY: 1,
+            rotation: 0,
+            opacity: 1,
+            keyframes: [],
+          };
+        }
+        clip.transform.keyframes = validateTransformKeyframes(clip.transform.keyframes);
+      }
     }
   }
 
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index d37e418..0e92740 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -671,9 +671,12 @@ process.on("SIGTERM", async () => {
   await shutdownTrashPurgeWorker().catch(() => {});
   await shutdownTelegramWorker().catch(() => {});
 
-  // 4. Flush PostHog event batch (if initialized)
-  // TODO: Add in Section 14 (Observability)
-  // await posthog.shutdown();
+  // 4. Flush PostHog event batch
+  try {
+    const { shutdownPostHog } = await import("../services/posthog");
+    await shutdownPostHog();
+    console.log("[Shutdown] PostHog events flushed");
+  } catch {}
 
   // 5. Flush Sentry events
   await Sentry.close(2000).catch(() => {});
diff --git a/apps/web/server/routers/mediaJobs.ts b/apps/web/server/routers/mediaJobs.ts
index 5d4ba29..6204e13 100644
--- a/apps/web/server/routers/mediaJobs.ts
+++ b/apps/web/server/routers/mediaJobs.ts
@@ -566,6 +566,17 @@ export const mediaJobsRouter = router({
         // Best-effort
       }
 
+      // PostHog: job_submitted event (best-effort)
+      try {
+        const { captureServerEvent } = await import("../services/posthog");
+        captureServerEvent(String(ctx.user.id), "job_submitted", {
+          job_type: spec.jobType,
+          job_id: jobId,
+        });
+      } catch {
+        // Best-effort
+      }
+
       return { jobId };
     }),
 
diff --git a/apps/web/server/services/__tests__/posthogEvents.test.ts b/apps/web/server/services/__tests__/posthogEvents.test.ts
new file mode 100644
index 0000000..32c93fc
--- /dev/null
+++ b/apps/web/server/services/__tests__/posthogEvents.test.ts
@@ -0,0 +1,74 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// Mock posthog-node before importing
+const mockCapture = vi.fn();
+const mockIdentify = vi.fn();
+const mockAlias = vi.fn();
+const mockShutdown = vi.fn().mockResolvedValue(undefined);
+
+vi.mock("posthog-node", () => ({
+  PostHog: vi.fn().mockImplementation(() => ({
+    capture: mockCapture,
+    identify: mockIdentify,
+    alias: mockAlias,
+    shutdown: mockShutdown,
+  })),
+}));
+
+describe("PostHog Event Capture (Node.js)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    process.env.POSTHOG_API_KEY = "phc_test_key";
+    vi.resetModules();
+  });
+
+  afterEach(() => {
+    delete process.env.POSTHOG_API_KEY;
+  });
+
+  it("captureServerEvent includes event name and properties", async () => {
+    const { captureServerEvent } = await import("../posthog");
+    captureServerEvent("user-1", "job_submitted", { job_type: "image" });
+
+    expect(mockCapture).toHaveBeenCalledWith(
+      expect.objectContaining({
+        distinctId: "user-1",
+        event: "job_submitted",
+        properties: expect.objectContaining({ job_type: "image" }),
+      }),
+    );
+  });
+
+  it("captureServerEvent includes environment in properties", async () => {
+    process.env.ENVIRONMENT = "production";
+    const { captureServerEvent } = await import("../posthog");
+    captureServerEvent("user-1", "media_job_completed", {
+      duration_ms: 5000,
+      output_size_bytes: 1024000,
+    });
+
+    const call = mockCapture.mock.calls[0][0];
+    expect(call.properties.environment).toBe("production");
+    expect(call.properties.duration_ms).toBe(5000);
+    expect(call.properties.output_size_bytes).toBe(1024000);
+    delete process.env.ENVIRONMENT;
+  });
+
+  it("no-ops when POSTHOG_API_KEY is not set", async () => {
+    delete process.env.POSTHOG_API_KEY;
+    vi.resetModules();
+    const { captureServerEvent } = await import("../posthog");
+    captureServerEvent("user-1", "some_event");
+
+    expect(mockCapture).not.toHaveBeenCalled();
+  });
+
+  it("shutdownPostHog flushes and cleans up", async () => {
+    const { captureServerEvent, shutdownPostHog } = await import("../posthog");
+    // Initialize the client by capturing something
+    captureServerEvent("user-1", "init_event");
+    await shutdownPostHog();
+
+    expect(mockShutdown).toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/server/services/__tests__/posthogIdentity.test.ts b/apps/web/server/services/__tests__/posthogIdentity.test.ts
new file mode 100644
index 0000000..b09061b
--- /dev/null
+++ b/apps/web/server/services/__tests__/posthogIdentity.test.ts
@@ -0,0 +1,66 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// Mock posthog-node before importing the module under test
+const mockCapture = vi.fn();
+const mockIdentify = vi.fn();
+const mockAlias = vi.fn();
+const mockShutdown = vi.fn().mockResolvedValue(undefined);
+
+vi.mock("posthog-node", () => ({
+  PostHog: vi.fn().mockImplementation(() => ({
+    capture: mockCapture,
+    identify: mockIdentify,
+    alias: mockAlias,
+    shutdown: mockShutdown,
+  })),
+}));
+
+describe("PostHog Identity Management", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    // Set env so the client initializes
+    process.env.POSTHOG_API_KEY = "phc_test_key";
+    // Reset module to get fresh client
+    vi.resetModules();
+  });
+
+  afterEach(() => {
+    delete process.env.POSTHOG_API_KEY;
+  });
+
+  it("aliasUser calls posthog.alias with anonymousId and userId", async () => {
+    const { aliasUser } = await import("../posthog");
+    aliasUser("anon-123", "user-456");
+
+    expect(mockAlias).toHaveBeenCalledWith({
+      distinctId: "user-456",
+      alias: "anon-123",
+    });
+  });
+
+  it("identifyUser calls posthog.identify with userId and properties", async () => {
+    const { identifyUser } = await import("../posthog");
+    identifyUser("user-456", { email: "test@example.com", plan: "pro" });
+
+    expect(mockIdentify).toHaveBeenCalledWith({
+      distinctId: "user-456",
+      properties: { email: "test@example.com", plan: "pro" },
+    });
+  });
+
+  it("captureServerEvent uses userId as distinctId", async () => {
+    const { captureServerEvent } = await import("../posthog");
+    captureServerEvent("user-456", "test_event", { key: "value" });
+
+    expect(mockCapture).toHaveBeenCalledWith(
+      expect.objectContaining({
+        distinctId: "user-456",
+        event: "test_event",
+        properties: expect.objectContaining({ key: "value" }),
+      }),
+    );
+    // Ensure distinctId is not an anonymous-looking ID
+    const call = mockCapture.mock.calls[0][0];
+    expect(call.distinctId).toBe("user-456");
+  });
+});
diff --git a/apps/web/server/services/posthog.ts b/apps/web/server/services/posthog.ts
new file mode 100644
index 0000000..b5e9476
--- /dev/null
+++ b/apps/web/server/services/posthog.ts
@@ -0,0 +1,74 @@
+/**
+ * PostHog Server-Side SDK (Node.js)
+ *
+ * Provides server-side event capture, identity management, and
+ * a no-op stub when the API key is not configured.
+ */
+
+import { PostHog } from "posthog-node";
+
+let client: PostHog | null = null;
+
+function getClient(): PostHog | null {
+  if (client) return client;
+  const apiKey = process.env.POSTHOG_API_KEY;
+  if (!apiKey) return null;
+
+  client = new PostHog(apiKey, {
+    host: "https://us.i.posthog.com",
+    flushAt: 20,
+    flushInterval: 10000,
+  });
+  return client;
+}
+
+/** Returns the PostHog client, or null if not configured. */
+export function getPostHogServer(): PostHog | null {
+  return getClient();
+}
+
+/** Capture a server-side event with standard properties. */
+export function captureServerEvent(
+  distinctId: string,
+  event: string,
+  properties?: Record<string, unknown>,
+): void {
+  const ph = getClient();
+  if (!ph) return;
+
+  ph.capture({
+    distinctId,
+    event,
+    properties: {
+      ...properties,
+      environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
+      release: process.env.RELEASE || process.env.GIT_COMMIT_SHA || undefined,
+    },
+  });
+}
+
+/** Identify a user with person properties. */
+export function identifyUser(
+  userId: string,
+  properties?: Record<string, unknown>,
+): void {
+  const ph = getClient();
+  if (!ph) return;
+
+  ph.identify({ distinctId: userId, properties });
+}
+
+/** Alias an anonymous ID to a user ID (called once on signup). */
+export function aliasUser(anonymousId: string, userId: string): void {
+  const ph = getClient();
+  if (!ph) return;
+
+  ph.alias({ distinctId: userId, alias: anonymousId });
+}
+
+/** Flush remaining events and shut down. Called on SIGTERM/SIGINT. */
+export async function shutdownPostHog(): Promise<void> {
+  if (!client) return;
+  await client.shutdown();
+  client = null;
+}
diff --git a/apps/web/shared/types/__tests__/mediaJob.test.ts b/apps/web/shared/types/__tests__/mediaJob.test.ts
index a9414e1..194c247 100644
--- a/apps/web/shared/types/__tests__/mediaJob.test.ts
+++ b/apps/web/shared/types/__tests__/mediaJob.test.ts
@@ -5,6 +5,7 @@ import {
   timelineToProject,
   msToSeconds,
   secondsToMs,
+  MEDIA_TIMELINE_CONTRACT_VERSION,
   VALID_JOB_TYPES,
 } from "../mediaJob";
 import type {
@@ -213,7 +214,9 @@ describe("projectToTimeline", () => {
 
   it("preserves all track and clip data", () => {
     const project = createEmptyProject("Multi");
-    project.timeline.tracks[0].clips.push({
+    const videoTrack = project.timeline.tracks.find((t) => t.id === "track-v1")!;
+    const audioTrack = project.timeline.tracks.find((t) => t.id === "track-a1")!;
+    videoTrack.clips.push({
       id: "clip-v1",
       assetId: "asset-v1",
       trackId: "track-v1",
@@ -225,7 +228,7 @@ describe("projectToTimeline", () => {
       speed: 1.5,
       effects: [],
     });
-    project.timeline.tracks[1].clips.push({
+    audioTrack.clips.push({
       id: "clip-a1",
       assetId: "asset-a1",
       trackId: "track-a1",
@@ -240,18 +243,22 @@ describe("projectToTimeline", () => {
 
     const timeline = projectToTimeline(project);
 
-    expect(timeline.tracks).toHaveLength(2);
-    expect(timeline.tracks[0].trackId).toBe("track-v1");
-    expect(timeline.tracks[0].type).toBe("video");
-    expect(timeline.tracks[0].clips[0].clipId).toBe("clip-v1");
-    expect(timeline.tracks[0].clips[0].assetId).toBe("asset-v1");
-    expect(timeline.tracks[0].clips[0].playbackRate).toBe(1.5);
-    expect(timeline.tracks[0].clips[0].volume).toBe(1.0);
+    const mappedVideoTrack = timeline.tracks.find((t) => t.trackId === "track-v1");
+    const mappedAudioTrack = timeline.tracks.find((t) => t.trackId === "track-a1");
+
+    expect(timeline.contractVersion).toBe(MEDIA_TIMELINE_CONTRACT_VERSION);
+    expect(timeline.tracks.length).toBeGreaterThanOrEqual(4);
+    expect(mappedVideoTrack).toBeDefined();
+    expect(mappedVideoTrack!.type).toBe("video");
+    expect(mappedVideoTrack!.clips[0].clipId).toBe("clip-v1");
+    expect(mappedVideoTrack!.clips[0].assetId).toBe("asset-v1");
+    expect(mappedVideoTrack!.clips[0].playbackRate).toBe(1.5);
+    expect(mappedVideoTrack!.clips[0].volume).toBe(1.0);
 
-    expect(timeline.tracks[1].trackId).toBe("track-a1");
-    expect(timeline.tracks[1].type).toBe("audio");
-    expect(timeline.tracks[1].clips[0].clipId).toBe("clip-a1");
-    expect(timeline.tracks[1].clips[0].volume).toBe(0.6);
+    expect(mappedAudioTrack).toBeDefined();
+    expect(mappedAudioTrack!.type).toBe("audio");
+    expect(mappedAudioTrack!.clips[0].clipId).toBe("clip-a1");
+    expect(mappedAudioTrack!.clips[0].volume).toBe(0.6);
   });
 
   it("maps overlay track type to video", () => {
@@ -419,6 +426,8 @@ describe("VALID_JOB_TYPES", () => {
       "dead_air_detect",
       "dead_air_cut",
       "generate_clip_from_api",
+      "transcode_h264",
+      "extract_audio",
     ];
     for (const type of expected) {
       expect(VALID_JOB_TYPES).toContain(type);
@@ -581,7 +590,7 @@ describe("validateJobSpec — additional edge cases", () => {
 // ========================================
 
 describe("timelineToProject — additional cases", () => {
-  it("maps subtitle track type to video", () => {
+  it("maps subtitle track type to text", () => {
     const timeline: MediaTimeline = {
       projectId: "p1",
       fps: 30,
@@ -597,7 +606,7 @@ describe("timelineToProject — additional cases", () => {
     };
 
     const project = timelineToProject(timeline);
-    expect(project.timeline.tracks[0].type).toBe("video");
+    expect(project.timeline.tracks[0].type).toBe("text");
   });
 
   it("handles clips with undefined inMs/outMs", () => {
@@ -688,11 +697,39 @@ describe("projectToTimeline — additional cases", () => {
   it("converts empty project without errors", () => {
     const project = createEmptyProject();
     const timeline = projectToTimeline(project);
-    expect(timeline.tracks).toHaveLength(2);
+    expect(timeline.tracks).toHaveLength(4);
     expect(timeline.tracks[0].clips).toHaveLength(0);
     expect(timeline.tracks[1].clips).toHaveLength(0);
   });
 
+  it("rejects unsupported future contract version by default", () => {
+    const spec = makeRenderSpec();
+    spec.inputs.project!.contractVersion = "3.0";
+    const result = validateJobSpec(spec);
+    expect(result.valid).toBe(false);
+    expect(result.errors.some((e) => /Unsupported media timeline contractVersion/i.test(e))).toBe(true);
+  });
+
+  it("allows gated downgrade for unsupported future version without text semantics", () => {
+    const timeline: MediaTimeline = {
+      projectId: "legacy-safe",
+      fps: 30,
+      width: 1920,
+      height: 1080,
+      contractVersion: "3.0",
+      compatibilityPolicy: { unsupportedContractPolicy: "gated_downgrade" },
+      tracks: [
+        {
+          trackId: "v1",
+          type: "video",
+          clips: [],
+        },
+      ],
+    };
+
+    expect(() => timelineToProject(timeline)).not.toThrow();
+  });
+
   it("round-trips through projectToTimeline and timelineToProject", () => {
     const project = createEmptyProject("Round Trip");
     project.timeline.tracks[0].clips.push({
diff --git a/apps/web/shared/types/mediaJob.ts b/apps/web/shared/types/mediaJob.ts
index a284869..926a287 100644
--- a/apps/web/shared/types/mediaJob.ts
+++ b/apps/web/shared/types/mediaJob.ts
@@ -3,6 +3,7 @@ import type {
   Clip,
   ClipTransform,
   ClipTransition,
+  TextConfig,
   Track,
 } from "../../client/src/types/videoEditor";
 import { createEmptyProject } from "../../client/src/types/videoEditor";
@@ -42,6 +43,11 @@ export interface MediaTimeline {
   fps: number;
   width: number;
   height: number;
+  contractVersion?: string;
+  capabilityMode?: "strict_parity";
+  compatibilityPolicy?: {
+    unsupportedContractPolicy: UnsupportedContractPolicy;
+  };
   tracks: MediaTrack[];
 }
 
@@ -62,6 +68,8 @@ export interface MediaClip {
   mute?: boolean;
   inTransition?: { name: string; durationMs: number; alignment?: string };
   transform?: ClipTransform;
+  textConfig?: TextConfig;
+  zOrder?: number;
 }
 
 // ========================================
@@ -162,6 +170,48 @@ export interface MediaArtifact {
   mime?: string;
 }
 
+export const MEDIA_TIMELINE_CONTRACT_VERSION = "1.0";
+export type UnsupportedContractPolicy =
+  | "reject_with_clear_error"
+  | "gated_downgrade";
+
+function parseMajorVersion(value: string): number | null {
+  const [majorRaw] = value.split(".");
+  const parsed = Number.parseInt(majorRaw, 10);
+  if (!Number.isFinite(parsed)) return null;
+  return parsed;
+}
+
+function hasTextSemantics(timeline: MediaTimeline): boolean {
+  return timeline.tracks.some(
+    (track) =>
+      track.type === "subtitle" ||
+      track.clips.some((clip) => typeof clip.textConfig === "object"),
+  );
+}
+
+function resolveCompatibilityOutcome(
+  contractVersion: string,
+  policy: UnsupportedContractPolicy,
+  timeline: MediaTimeline,
+): "supported" | "gated_downgrade" {
+  const supportedMajor = parseMajorVersion(MEDIA_TIMELINE_CONTRACT_VERSION);
+  const requestedMajor = parseMajorVersion(contractVersion);
+
+  if (supportedMajor === null || requestedMajor === null) {
+    throw new Error('Invalid media timeline contractVersion format (expected: X.Y)');
+  }
+  if (requestedMajor <= supportedMajor) {
+    return "supported";
+  }
+  if (policy === "gated_downgrade" && !hasTextSemantics(timeline)) {
+    return "gated_downgrade";
+  }
+  throw new Error(
+    `Unsupported media timeline contractVersion "${contractVersion}" (policy: ${policy})`,
+  );
+}
+
 // ========================================
 // Validation
 // ========================================
@@ -212,6 +262,16 @@ export function validateJobSpec(
 
   // Clip validation: outMs > inMs
   if (spec.inputs?.project?.tracks) {
+    const project = spec.inputs.project;
+    const contractVersion = project.contractVersion ?? MEDIA_TIMELINE_CONTRACT_VERSION;
+    const policy =
+      project.compatibilityPolicy?.unsupportedContractPolicy ??
+      "reject_with_clear_error";
+    try {
+      resolveCompatibilityOutcome(contractVersion, policy, project);
+    } catch (error) {
+      errors.push(error instanceof Error ? error.message : "Invalid project contract");
+    }
     for (const track of spec.inputs.project.tracks) {
       for (const clip of track.clips) {
         if (
@@ -270,6 +330,11 @@ export function projectToTimeline(
     fps: project.settings.fps,
     width: project.settings.width,
     height: project.settings.height,
+    contractVersion: MEDIA_TIMELINE_CONTRACT_VERSION,
+    capabilityMode: "strict_parity",
+    compatibilityPolicy: {
+      unsupportedContractPolicy: "reject_with_clear_error",
+    },
     tracks: project.timeline.tracks.map(
       (track: Track): MediaTrack => ({
         trackId: track.id,
@@ -280,7 +345,7 @@ export function projectToTimeline(
               ? "subtitle"
               : track.type,
         clips: track.clips.map(
-          (clip: Clip): MediaClip => ({
+          (clip: Clip, index: number): MediaClip => ({
             clipId: clip.id,
             assetId: clip.assetId,
             startMs: secondsToMs(clip.startTime),
@@ -290,6 +355,8 @@ export function projectToTimeline(
             volume: clip.volume,
             inTransition: clip.inTransition,
             transform: clip.transform,
+            textConfig: clip.textConfig,
+            zOrder: index,
           }),
         ),
       }),
@@ -297,9 +364,21 @@ export function projectToTimeline(
   };
 }
 
+export interface TimelineToProjectOptions {
+  unsupportedContractPolicy?: UnsupportedContractPolicy;
+}
+
 export function timelineToProject(
   timeline: MediaTimeline,
+  options: TimelineToProjectOptions = {},
 ): VideoEditorProject {
+  const policy =
+    options.unsupportedContractPolicy ??
+    timeline.compatibilityPolicy?.unsupportedContractPolicy ??
+    "reject_with_clear_error";
+  const contractVersion = timeline.contractVersion ?? MEDIA_TIMELINE_CONTRACT_VERSION;
+  resolveCompatibilityOutcome(contractVersion, policy, timeline);
+
   const base = createEmptyProject(timeline.projectId);
 
   base.version = "2.0";
@@ -310,7 +389,7 @@ export function timelineToProject(
   base.timeline.tracks = timeline.tracks.map(
     (track: MediaTrack): Track => ({
       id: track.trackId,
-      type: track.type === "subtitle" ? "video" : track.type,
+      type: track.type === "subtitle" ? "text" : track.type,
       name: track.trackId,
       clips: track.clips.map(
         (clip: MediaClip): Clip => ({
@@ -328,6 +407,7 @@ export function timelineToProject(
           effects: [],
           inTransition: clip.inTransition as ClipTransition | undefined,
           transform: clip.transform,
+          textConfig: clip.textConfig,
         }),
       ),
       muted: false,
diff --git a/package-lock.json b/package-lock.json
index a1f14d6..197729e 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -12,6 +12,8 @@
       "dependencies": {
         "@xyflow/react": "^12.10.0",
         "d3-zoom": "^3.0.0",
+        "posthog-js": "^1.347.2",
+        "posthog-node": "^5.24.15",
         "reactflow": "^11.11.4",
         "rg": "^0.0.2"
       },
@@ -2589,11 +2591,6 @@
       "dev": true,
       "license": "MIT"
     },
-    "apps/web/node_modules/@types/trusted-types": {
-      "version": "2.0.7",
-      "license": "MIT",
-      "optional": true
-    },
     "apps/web/node_modules/@vitejs/plugin-react": {
       "version": "5.1.2",
       "dev": true,
@@ -3471,13 +3468,6 @@
         "url": "https://github.com/fb55/domhandler?sponsor=1"
       }
     },
-    "apps/web/node_modules/dompurify": {
-      "version": "3.3.1",
-      "license": "(MPL-2.0 OR Apache-2.0)",
-      "optionalDependencies": {
-        "@types/trusted-types": "^2.0.7"
-      }
-    },
     "apps/web/node_modules/domutils": {
       "version": "3.2.2",
       "license": "BSD-2-Clause",
@@ -8456,6 +8446,52 @@
         "@opentelemetry/api": ">=1.0.0 <1.10.0"
       }
     },
+    "node_modules/@opentelemetry/exporter-logs-otlp-http": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/exporter-logs-otlp-http/-/exporter-logs-otlp-http-0.208.0.tgz",
+      "integrity": "sha512-jOv40Bs9jy9bZVLo/i8FwUiuCvbjWDI+ZW13wimJm4LjnlwJxGgB+N/VWOZUTpM+ah/awXeQqKdNlpLf2EjvYg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api-logs": "0.208.0",
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/otlp-exporter-base": "0.208.0",
+        "@opentelemetry/otlp-transformer": "0.208.0",
+        "@opentelemetry/sdk-logs": "0.208.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/exporter-logs-otlp-http/node_modules/@opentelemetry/api-logs": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.208.0.tgz",
+      "integrity": "sha512-CjruKY9V6NMssL/T1kAFgzosF1v9o6oeN+aX5JB/C/xPNtmgIJqcXHG7fA82Ou1zCpWGl4lROQUKwUNE1pMCyg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@opentelemetry/exporter-logs-otlp-http/node_modules/@opentelemetry/core": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.2.0.tgz",
+      "integrity": "sha512-FuabnnUm8LflnieVxs6eP7Z383hgQU4W1e3KJS6aOG3RxWxcHyBxH8fDMHNgu/gFx/M2jvTOW/4/PHhLz6bjWw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
     "node_modules/@opentelemetry/instrumentation": {
       "version": "0.211.0",
       "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation/-/instrumentation-0.211.0.tgz",
@@ -8867,6 +8903,118 @@
         "@opentelemetry/api": "^1.7.0"
       }
     },
+    "node_modules/@opentelemetry/otlp-exporter-base": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/otlp-exporter-base/-/otlp-exporter-base-0.208.0.tgz",
+      "integrity": "sha512-gMd39gIfVb2OgxldxUtOwGJYSH8P1kVFFlJLuut32L6KgUC4gl1dMhn+YC2mGn0bDOiQYSk/uHOdSjuKp58vvA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/otlp-transformer": "0.208.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-exporter-base/node_modules/@opentelemetry/core": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.2.0.tgz",
+      "integrity": "sha512-FuabnnUm8LflnieVxs6eP7Z383hgQU4W1e3KJS6aOG3RxWxcHyBxH8fDMHNgu/gFx/M2jvTOW/4/PHhLz6bjWw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-transformer": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/otlp-transformer/-/otlp-transformer-0.208.0.tgz",
+      "integrity": "sha512-DCFPY8C6lAQHUNkzcNT9R+qYExvsk6C5Bto2pbNxgicpcSWbe2WHShLxkOxIdNcBiYPdVHv/e7vH7K6TI+C+fQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api-logs": "0.208.0",
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/resources": "2.2.0",
+        "@opentelemetry/sdk-logs": "0.208.0",
+        "@opentelemetry/sdk-metrics": "2.2.0",
+        "@opentelemetry/sdk-trace-base": "2.2.0",
+        "protobufjs": "^7.3.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-transformer/node_modules/@opentelemetry/api-logs": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.208.0.tgz",
+      "integrity": "sha512-CjruKY9V6NMssL/T1kAFgzosF1v9o6oeN+aX5JB/C/xPNtmgIJqcXHG7fA82Ou1zCpWGl4lROQUKwUNE1pMCyg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-transformer/node_modules/@opentelemetry/core": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.2.0.tgz",
+      "integrity": "sha512-FuabnnUm8LflnieVxs6eP7Z383hgQU4W1e3KJS6aOG3RxWxcHyBxH8fDMHNgu/gFx/M2jvTOW/4/PHhLz6bjWw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-transformer/node_modules/@opentelemetry/resources": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/resources/-/resources-2.2.0.tgz",
+      "integrity": "sha512-1pNQf/JazQTMA0BiO5NINUzH0cbLbbl7mntLa4aJNmCCXSj0q03T5ZXXL0zw4G55TjdL9Tz32cznGClf+8zr5A==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/otlp-transformer/node_modules/@opentelemetry/sdk-trace-base": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/sdk-trace-base/-/sdk-trace-base-2.2.0.tgz",
+      "integrity": "sha512-xWQgL0Bmctsalg6PaXExmzdedSp3gyKV8mQBwK/j9VGdCDu2fmXIb2gAehBKbkXCpJ4HPkgv3QfoJWRT4dHWbw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/resources": "2.2.0",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
+      }
+    },
     "node_modules/@opentelemetry/redis-common": {
       "version": "0.38.2",
       "resolved": "https://registry.npmjs.org/@opentelemetry/redis-common/-/redis-common-0.38.2.tgz",
@@ -8893,6 +9041,113 @@
         "@opentelemetry/api": ">=1.3.0 <1.10.0"
       }
     },
+    "node_modules/@opentelemetry/sdk-logs": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/sdk-logs/-/sdk-logs-0.208.0.tgz",
+      "integrity": "sha512-QlAyL1jRpOeaqx7/leG1vJMp84g0xKP6gJmfELBpnI4O/9xPX+Hu5m1POk9Kl+veNkyth5t19hRlN6tNY1sjbA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api-logs": "0.208.0",
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/resources": "2.2.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.4.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-logs/node_modules/@opentelemetry/api-logs": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.208.0.tgz",
+      "integrity": "sha512-CjruKY9V6NMssL/T1kAFgzosF1v9o6oeN+aX5JB/C/xPNtmgIJqcXHG7fA82Ou1zCpWGl4lROQUKwUNE1pMCyg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-logs/node_modules/@opentelemetry/core": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.2.0.tgz",
+      "integrity": "sha512-FuabnnUm8LflnieVxs6eP7Z383hgQU4W1e3KJS6aOG3RxWxcHyBxH8fDMHNgu/gFx/M2jvTOW/4/PHhLz6bjWw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-logs/node_modules/@opentelemetry/resources": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/resources/-/resources-2.2.0.tgz",
+      "integrity": "sha512-1pNQf/JazQTMA0BiO5NINUzH0cbLbbl7mntLa4aJNmCCXSj0q03T5ZXXL0zw4G55TjdL9Tz32cznGClf+8zr5A==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-metrics": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/sdk-metrics/-/sdk-metrics-2.2.0.tgz",
+      "integrity": "sha512-G5KYP6+VJMZzpGipQw7Giif48h6SGQ2PFKEYCybeXJsOCB4fp8azqMAAzE5lnnHK3ZVwYQrgmFbsUJO/zOnwGw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/resources": "2.2.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.9.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-metrics/node_modules/@opentelemetry/core": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.2.0.tgz",
+      "integrity": "sha512-FuabnnUm8LflnieVxs6eP7Z383hgQU4W1e3KJS6aOG3RxWxcHyBxH8fDMHNgu/gFx/M2jvTOW/4/PHhLz6bjWw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/sdk-metrics/node_modules/@opentelemetry/resources": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/resources/-/resources-2.2.0.tgz",
+      "integrity": "sha512-1pNQf/JazQTMA0BiO5NINUzH0cbLbbl7mntLa4aJNmCCXSj0q03T5ZXXL0zw4G55TjdL9Tz32cznGClf+8zr5A==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.2.0",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
+      }
+    },
     "node_modules/@opentelemetry/sdk-trace-base": {
       "version": "2.5.1",
       "resolved": "https://registry.npmjs.org/@opentelemetry/sdk-trace-base/-/sdk-trace-base-2.5.1.tgz",
@@ -8965,6 +9220,21 @@
         "node": ">=14"
       }
     },
+    "node_modules/@posthog/core": {
+      "version": "1.22.0",
+      "resolved": "https://registry.npmjs.org/@posthog/core/-/core-1.22.0.tgz",
+      "integrity": "sha512-WkmOnq95aAOu6yk6r5LWr5cfXsQdpVbWDCwOxQwxSne8YV6GuZET1ziO5toSQXgrgbdcjrSz2/GopAfiL6iiAA==",
+      "license": "MIT",
+      "dependencies": {
+        "cross-spawn": "^7.0.6"
+      }
+    },
+    "node_modules/@posthog/types": {
+      "version": "1.347.2",
+      "resolved": "https://registry.npmjs.org/@posthog/types/-/types-1.347.2.tgz",
+      "integrity": "sha512-aT+r/7jXOzPmUHO6sutoWzczPcYIZyhmWt1f1OvY4zKC7Pwp/ZsJWKFTxjV02p0PZz96AE83eLTe7w7b6tjhIw==",
+      "license": "MIT"
+    },
     "node_modules/@prisma/instrumentation": {
       "version": "7.2.0",
       "resolved": "https://registry.npmjs.org/@prisma/instrumentation/-/instrumentation-7.2.0.tgz",
@@ -12704,7 +12974,6 @@
       "resolved": "https://registry.npmjs.org/@types/pg/-/pg-8.16.0.tgz",
       "integrity": "sha512-RmhMd/wD+CF8Dfo+cVIy3RR5cl8CyfXQ0tGgW6XBL8L4LM/UTEbNXYRbLwU6w+CgrKBNbrQWt4FUtTfaU5jSYQ==",
       "license": "MIT",
-      "peer": true,
       "dependencies": {
         "@types/node": "*",
         "pg-protocol": "*",
@@ -12846,6 +13115,13 @@
       "integrity": "sha512-/Ad8+nIOV7Rl++6f1BdKxFSMgmoqEoYbHRpPcx3JEfv8VRsQe9Z4mCXeJBzxs7mbHY/XOZZuXlRNfhpVPbs6ZA==",
       "license": "MIT"
     },
+    "node_modules/@types/trusted-types": {
+      "version": "2.0.7",
+      "resolved": "https://registry.npmjs.org/@types/trusted-types/-/trusted-types-2.0.7.tgz",
+      "integrity": "sha512-ScaPdn1dQczgbl0QFTeTOmVHFULt394XJgOQNoyVhZ6r2vLnMLJfBPd53SB52T/3G36VI1/g2MZaX0cwDuXsfw==",
+      "license": "MIT",
+      "optional": true
+    },
     "node_modules/@types/unist": {
       "version": "3.0.3",
       "resolved": "https://registry.npmjs.org/@types/unist/-/unist-3.0.3.tgz",
@@ -13708,6 +13984,17 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/core-js": {
+      "version": "3.48.0",
+      "resolved": "https://registry.npmjs.org/core-js/-/core-js-3.48.0.tgz",
+      "integrity": "sha512-zpEHTy1fjTMZCKLHUZoVeylt9XrzaIN2rbPXEt0k+q7JE5CkCZdo6bNq55bn24a69CH7ErAVLKijxJja4fw+UQ==",
+      "hasInstallScript": true,
+      "license": "MIT",
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/core-js"
+      }
+    },
     "node_modules/crc-32": {
       "version": "1.2.2",
       "resolved": "https://registry.npmjs.org/crc-32/-/crc-32-1.2.2.tgz",
@@ -14128,6 +14415,15 @@
         "csstype": "^3.0.2"
       }
     },
+    "node_modules/dompurify": {
+      "version": "3.3.1",
+      "resolved": "https://registry.npmjs.org/dompurify/-/dompurify-3.3.1.tgz",
+      "integrity": "sha512-qkdCKzLNtrgPFP1Vo+98FRzJnBRGe4ffyCea9IwHB1fyxPOeNTHpLKYGd4Uk9xvNoH0ZoOjwZxNptyMwqrId1Q==",
+      "license": "(MPL-2.0 OR Apache-2.0)",
+      "optionalDependencies": {
+        "@types/trusted-types": "^2.0.7"
+      }
+    },
     "node_modules/dotenv": {
       "version": "16.6.1",
       "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-16.6.1.tgz",
@@ -14460,6 +14756,12 @@
         }
       }
     },
+    "node_modules/fflate": {
+      "version": "0.4.8",
+      "resolved": "https://registry.npmjs.org/fflate/-/fflate-0.4.8.tgz",
+      "integrity": "sha512-FJqqoDBR00Mdj9ppamLa/Y7vxm+PRmNWA67N846RvsoYVMKB4q3y/de5PA7gUmRMYK/8CMz2GDZQmCRN1wBcWA==",
+      "license": "MIT"
+    },
     "node_modules/fill-range": {
       "version": "7.1.1",
       "resolved": "https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz",
@@ -17681,6 +17983,61 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/posthog-js": {
+      "version": "1.347.2",
+      "resolved": "https://registry.npmjs.org/posthog-js/-/posthog-js-1.347.2.tgz",
+      "integrity": "sha512-hDbsSU30gfNhC11cBYSPpwUYB4DglbCN2G8W8NPIR/KXhT03shmuxabra/uaoI4blkr8SSSpxwvYV4gGa3hXrA==",
+      "license": "SEE LICENSE IN LICENSE",
+      "dependencies": {
+        "@opentelemetry/api": "^1.9.0",
+        "@opentelemetry/api-logs": "^0.208.0",
+        "@opentelemetry/exporter-logs-otlp-http": "^0.208.0",
+        "@opentelemetry/resources": "^2.2.0",
+        "@opentelemetry/sdk-logs": "^0.208.0",
+        "@posthog/core": "1.22.0",
+        "@posthog/types": "1.347.2",
+        "core-js": "^3.38.1",
+        "dompurify": "^3.3.1",
+        "fflate": "^0.4.8",
+        "preact": "^10.28.2",
+        "query-selector-shadow-dom": "^1.0.1",
+        "web-vitals": "^5.1.0"
+      }
+    },
+    "node_modules/posthog-js/node_modules/@opentelemetry/api-logs": {
+      "version": "0.208.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.208.0.tgz",
+      "integrity": "sha512-CjruKY9V6NMssL/T1kAFgzosF1v9o6oeN+aX5JB/C/xPNtmgIJqcXHG7fA82Ou1zCpWGl4lROQUKwUNE1pMCyg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/posthog-node": {
+      "version": "5.24.15",
+      "resolved": "https://registry.npmjs.org/posthog-node/-/posthog-node-5.24.15.tgz",
+      "integrity": "sha512-0QnWVOZAPwEAlp+r3r0jIGfk2IaNYM/2YnEJJhBMJZXs4LpHcTu7mX42l+e95o9xX87YpVuZU0kOkmtQUxgnOA==",
+      "license": "MIT",
+      "dependencies": {
+        "@posthog/core": "1.22.0"
+      },
+      "engines": {
+        "node": "^20.20.0 || >=22.22.0"
+      }
+    },
+    "node_modules/preact": {
+      "version": "10.28.3",
+      "resolved": "https://registry.npmjs.org/preact/-/preact-10.28.3.tgz",
+      "integrity": "sha512-tCmoRkPQLpBeWzpmbhryairGnhW9tKV6c6gr/w+RhoRoKEJwsjzipwp//1oCpGPOchvSLaAPlpcJi9MwMmoPyA==",
+      "license": "MIT",
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/preact"
+      }
+    },
     "node_modules/pretty-format": {
       "version": "27.5.1",
       "resolved": "https://registry.npmjs.org/pretty-format/-/pretty-format-27.5.1.tgz",
@@ -17822,6 +18179,12 @@
         "url": "https://github.com/sponsors/ljharb"
       }
     },
+    "node_modules/query-selector-shadow-dom": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/query-selector-shadow-dom/-/query-selector-shadow-dom-1.0.1.tgz",
+      "integrity": "sha512-lT5yCqEBgfoMYpf3F2xQRK7zEr1rhIIZuceDK6+xRkJQ4NMbHTwXqk4NkwDwQMNqXgG9r9fyHnzwNVs6zV5KRw==",
+      "license": "MIT"
+    },
     "node_modules/react": {
       "version": "18.3.1",
       "resolved": "https://registry.npmjs.org/react/-/react-18.3.1.tgz",
@@ -19565,6 +19928,12 @@
         "node": ">=18"
       }
     },
+    "node_modules/web-vitals": {
+      "version": "5.1.0",
+      "resolved": "https://registry.npmjs.org/web-vitals/-/web-vitals-5.1.0.tgz",
+      "integrity": "sha512-ArI3kx5jI0atlTtmV0fWU3fjpLmq/nD3Zr1iFFlJLaqa5wLBkUSzINwBPySCX/8jRyjlmy1Volw1kz1g9XE4Jg==",
+      "license": "Apache-2.0"
+    },
     "node_modules/webidl-conversions": {
       "version": "3.0.1",
       "resolved": "https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-3.0.1.tgz",
diff --git a/package.json b/package.json
index c813fac..cb42aa6 100644
--- a/package.json
+++ b/package.json
@@ -19,6 +19,8 @@
   "dependencies": {
     "@xyflow/react": "^12.10.0",
     "d3-zoom": "^3.0.0",
+    "posthog-js": "^1.347.2",
+    "posthog-node": "^5.24.15",
     "reactflow": "^11.11.4",
     "rg": "^0.0.2"
   }
diff --git a/python-backend/app/core/config.py b/python-backend/app/core/config.py
index b1d8735..1520cdc 100644
--- a/python-backend/app/core/config.py
+++ b/python-backend/app/core/config.py
@@ -147,6 +147,7 @@ class Settings(BaseSettings):
     # Monitoring
     ENABLE_TELEMETRY: bool = True
     SENTRY_DSN: str = ""
+    POSTHOG_API_KEY: str = ""
 
     # LangSmith (Optional - for debugging and tracing)
     # Set LANGSMITH_ENABLED=true to enable tracing
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index f9ff285..4189595 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -159,6 +159,14 @@ async def lifespan(app: FastAPI):
     except Exception as e:
         logger.warning("Sentry flush failed", error=str(e))
 
+    # Flush PostHog events
+    try:
+        from app.services.posthog_service import shutdown_posthog
+        shutdown_posthog()
+        logger.info("PostHog events flushed")
+    except Exception as e:
+        logger.warning("PostHog flush failed", error=str(e))
+
     # Close checkpointer connection pool
     try:
         from app.core.checkpointer import cleanup_checkpointers
diff --git a/python-backend/app/services/posthog_service.py b/python-backend/app/services/posthog_service.py
new file mode 100644
index 0000000..9a66072
--- /dev/null
+++ b/python-backend/app/services/posthog_service.py
@@ -0,0 +1,107 @@
+"""
+PostHog Server-Side SDK (Python)
+
+Provides server-side event capture for media job analytics.
+No-op when POSTHOG_API_KEY is not configured.
+"""
+
+import structlog
+from posthog import Posthog
+
+logger = structlog.get_logger()
+
+_client: Posthog | None = None
+
+
+def _get_client() -> Posthog | None:
+    global _client
+    if _client is not None:
+        return _client
+
+    from app.core.config import settings
+
+    api_key = settings.POSTHOG_API_KEY
+    if not api_key:
+        return None
+
+    _client = Posthog(
+        api_key,
+        host="https://us.i.posthog.com",
+        debug=settings.ENVIRONMENT == "development",
+        on_error=lambda e, items: logger.warning("posthog_error", error=str(e)),
+    )
+    return _client
+
+
+def capture_event(
+    distinct_id: str,
+    event: str,
+    properties: dict | None = None,
+) -> None:
+    """Capture a server-side PostHog event."""
+    ph = _get_client()
+    if not ph:
+        return
+
+    from app.core.config import settings
+
+    ph.capture(
+        distinct_id,
+        event,
+        properties={
+            **(properties or {}),
+            "environment": settings.ENVIRONMENT,
+        },
+    )
+
+
+def capture_kie_submit(user_id: str, kie_job_id: str, job_type: str = "") -> None:
+    """Capture kie_submit_succeeded event."""
+    capture_event(user_id, "kie_submit_succeeded", {
+        "kie_job_id": kie_job_id,
+        "job_type": job_type,
+    })
+
+
+def capture_media_job_completed(
+    user_id: str,
+    job_id: str,
+    job_type: str,
+    duration_ms: float,
+    output_size_bytes: int,
+    resolution: str = "",
+) -> None:
+    """Capture media_job_completed event."""
+    capture_event(user_id, "media_job_completed", {
+        "job_id": job_id,
+        "job_type": job_type,
+        "duration_ms": duration_ms,
+        "output_size_bytes": output_size_bytes,
+        "resolution": resolution,
+    })
+
+
+def capture_media_job_failed(
+    user_id: str,
+    job_id: str,
+    job_type: str,
+    error_message: str,
+) -> None:
+    """Capture media_job_failed event."""
+    capture_event(user_id, "media_job_failed", {
+        "job_id": job_id,
+        "job_type": job_type,
+        "error_message": error_message,
+    })
+
+
+def shutdown_posthog() -> None:
+    """Flush pending events and shut down the client."""
+    global _client
+    if _client is None:
+        return
+    try:
+        _client.shutdown()
+    except Exception as e:
+        logger.warning("posthog_shutdown_error", error=str(e))
+    _client = None
diff --git a/python-backend/coverage.xml b/python-backend/coverage.xml
index d322965..1c3ce99 100644
--- a/python-backend/coverage.xml
+++ b/python-backend/coverage.xml
@@ -1,5 +1,5 @@
 <?xml version="1.0" ?>
-<coverage version="7.13.2" timestamp="1771139260825" lines-valid="37199" lines-covered="7986" line-rate="0.2147" branches-valid="9662" branches-covered="64" branch-rate="0.006624" complexity="0">
+<coverage version="7.13.2" timestamp="1771142506052" lines-valid="37244" lines-covered="7954" line-rate="0.2136" branches-valid="9686" branches-covered="56" branch-rate="0.005782" complexity="0">
 	<!-- Generated by coverage.py: https://coverage.readthedocs.io/en/7.13.2 -->
 	<!-- Based on https://raw.githubusercontent.com/cobertura/web/master/htdocs/xml/coverage-04.dtd -->
 	<sources>
@@ -6038,7 +6038,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="core" line-rate="0.1913" branch-rate="0.007353" complexity="0">
+		<package name="core" line-rate="0.2072" branch-rate="0.03551" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="core/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -8472,7 +8472,7 @@
 						<line number="87" hits="0"/>
 					</lines>
 				</class>
-				<class name="request_logging.py" filename="core/request_logging.py" complexity="0" line-rate="0.3333" branch-rate="0">
+				<class name="request_logging.py" filename="core/request_logging.py" complexity="0" line-rate="0.65" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -8482,56 +8482,59 @@
 						<line number="10" hits="1"/>
 						<line number="11" hits="1"/>
 						<line number="12" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="17" hits="1"/>
-						<line number="30" hits="1"/>
-						<line number="31" hits="0"/>
-						<line number="33" hits="1"/>
-						<line number="37" hits="0"/>
-						<line number="38" hits="0"/>
-						<line number="41" hits="0"/>
-						<line number="42" hits="0"/>
-						<line number="43" hits="0"/>
-						<line number="44" hits="0"/>
-						<line number="45" hits="0"/>
-						<line number="48" hits="0"/>
-						<line number="51" hits="0"/>
-						<line number="54" hits="0"/>
-						<line number="66" hits="0"/>
-						<line number="67" hits="0"/>
-						<line number="70" hits="0"/>
-						<line number="73" hits="0"/>
-						<line number="84" hits="0"/>
-						<line number="86" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="90" hits="0"/>
-						<line number="93" hits="0"/>
-						<line number="105" hits="0"/>
-						<line number="108" hits="1"/>
-						<line number="121" hits="1"/>
-						<line number="131" hits="1"/>
-						<line number="132" hits="0"/>
-						<line number="134" hits="1"/>
-						<line number="137" hits="0"/>
-						<line number="140" hits="0"/>
-						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,149"/>
-						<line number="146" hits="0"/>
-						<line number="149" hits="0"/>
-						<line number="150" hits="0"/>
-						<line number="151" hits="0"/>
-						<line number="152" hits="0"/>
-						<line number="155" hits="0"/>
-						<line number="166" hits="0"/>
-						<line number="167" hits="0"/>
-						<line number="170" hits="0"/>
-						<line number="182" hits="0"/>
-						<line number="184" hits="0"/>
-						<line number="186" hits="0"/>
-						<line number="198" hits="0"/>
-						<line number="201" hits="1"/>
-						<line number="205" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="80" hits="1"/>
+						<line number="91" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="112" hits="0"/>
+						<line number="115" hits="1"/>
+						<line number="128" hits="1"/>
+						<line number="138" hits="1"/>
+						<line number="139" hits="0"/>
+						<line number="141" hits="1"/>
+						<line number="144" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="152" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="153,156"/>
+						<line number="153" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="162" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="193" hits="0"/>
+						<line number="205" hits="0"/>
 						<line number="208" hits="1"/>
-						<line number="210" hits="1"/>
+						<line number="212" hits="1"/>
+						<line number="215" hits="1"/>
+						<line number="217" hits="1"/>
 					</lines>
 				</class>
 				<class name="secure_validators.py" filename="core/secure_validators.py" complexity="0" line-rate="0.22" branch-rate="0">
@@ -9012,6 +9015,53 @@
 						<line number="208" hits="0"/>
 					</lines>
 				</class>
+				<class name="sentry_config.py" filename="core/sentry_config.py" complexity="0" line-rate="0.881" branch-rate="0.8333">
+					<methods/>
+					<lines>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="25" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="31"/>
+						<line number="26" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="27" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="28" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="32" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="33" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="34" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="50"/>
+						<line number="40" hits="1"/>
+						<line number="41" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="42" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="50"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="50" hits="1"/>
+						<line number="53" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="61" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="66"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="66" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="76" hits="0"/>
+					</lines>
+				</class>
 				<class name="settings.py" filename="core/settings.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
 					<lines>
@@ -38809,7 +38859,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="video" line-rate="0.238" branch-rate="0.2222" complexity="0">
+		<package name="video" line-rate="0" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="video/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -38913,16 +38963,16 @@
 						<line number="180" hits="0"/>
 					</lines>
 				</class>
-				<class name="pipeline.py" filename="video/pipeline.py" complexity="0" line-rate="0.2212" branch-rate="0.2045">
+				<class name="pipeline.py" filename="video/pipeline.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="11" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="15" hits="1"/>
-						<line number="18" hits="1"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="18" hits="0"/>
 						<line number="20" hits="0"/>
 						<line number="27" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="28,29"/>
 						<line number="28" hits="0"/>
@@ -38931,42 +38981,42 @@
 						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,36"/>
 						<line number="35" hits="0"/>
 						<line number="36" hits="0"/>
-						<line number="45" hits="1"/>
-						<line number="47" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="48" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="50" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="51" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="57" hits="1"/>
-						<line number="58" hits="1"/>
-						<line number="61" hits="1"/>
-						<line number="80" hits="1"/>
-						<line number="81" hits="1"/>
-						<line number="82" hits="1"/>
-						<line number="85" hits="1"/>
-						<line number="86" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="87" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="88" hits="1"/>
-						<line number="92" hits="1"/>
-						<line number="94" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="95" hits="1"/>
-						<line number="97" hits="1"/>
-						<line number="98" hits="1"/>
-						<line number="101" hits="1"/>
-						<line number="102" hits="1"/>
-						<line number="103" hits="1"/>
-						<line number="104" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="105" hits="1"/>
-						<line number="106" hits="1"/>
-						<line number="108" hits="1"/>
-						<line number="109" hits="1"/>
-						<line number="110" hits="1"/>
-						<line number="111" hits="1"/>
-						<line number="113" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="122"/>
-						<line number="115" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="119"/>
-						<line number="116" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="117"/>
+						<line number="45" hits="0"/>
+						<line number="47" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="48,49"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,58"/>
+						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,57"/>
+						<line number="57" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,94"/>
+						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="86,88"/>
+						<line number="88" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,97"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="103" hits="0"/>
+						<line number="104" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="105,113"/>
+						<line number="105" hits="0"/>
+						<line number="106" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="115,122"/>
+						<line number="115" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="116,119"/>
+						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,118"/>
 						<line number="117" hits="0"/>
-						<line number="118" hits="1"/>
+						<line number="118" hits="0"/>
 						<line number="119" hits="0"/>
 						<line number="122" hits="0"/>
 						<line number="123" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="124,128"/>
@@ -39010,10 +39060,10 @@
 						<line number="194" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="195,197"/>
 						<line number="195" hits="0"/>
 						<line number="197" hits="0"/>
-						<line number="200" hits="1"/>
-						<line number="226" hits="1"/>
-						<line number="227" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="230"/>
-						<line number="228" hits="1"/>
+						<line number="200" hits="0"/>
+						<line number="226" hits="0"/>
+						<line number="227" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="228,230"/>
+						<line number="228" hits="0"/>
 						<line number="230" hits="0"/>
 						<line number="231" hits="0"/>
 						<line number="232" hits="0"/>
@@ -39157,61 +39207,61 @@
 						<line number="60" hits="0"/>
 					</lines>
 				</class>
-				<class name="render_hash.py" filename="video/render_hash.py" complexity="0" line-rate="0.8667" branch-rate="0.6667">
+				<class name="render_hash.py" filename="video/render_hash.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="7" hits="1"/>
-						<line number="8" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="16" hits="1"/>
-						<line number="18" hits="1"/>
-						<line number="19" hits="1"/>
-						<line number="20" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="21" hits="1"/>
-						<line number="31" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="32"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="20" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="21,40"/>
+						<line number="21" hits="0"/>
+						<line number="31" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="32,33"/>
 						<line number="32" hits="0"/>
-						<line number="33" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="34"/>
+						<line number="33" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="34,35"/>
 						<line number="34" hits="0"/>
-						<line number="35" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="36"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,37"/>
 						<line number="36" hits="0"/>
-						<line number="37" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="38"/>
+						<line number="37" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="38,39"/>
 						<line number="38" hits="0"/>
-						<line number="39" hits="1"/>
-						<line number="40" hits="1"/>
-						<line number="43" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="46" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="47" hits="1"/>
-						<line number="53" hits="1"/>
-						<line number="56" hits="1"/>
-						<line number="76" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="79" hits="1"/>
-						<line number="91" hits="1"/>
-						<line number="92" hits="1"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="47,53"/>
+						<line number="47" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="76" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="79" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="92" hits="0"/>
 					</lines>
 				</class>
-				<class name="render_profiles.py" filename="video/render_profiles.py" complexity="0" line-rate="1" branch-rate="1">
+				<class name="render_profiles.py" filename="video/render_profiles.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="6" hits="1"/>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="15" hits="1"/>
-						<line number="16" hits="1"/>
-						<line number="17" hits="1"/>
-						<line number="18" hits="1"/>
-						<line number="19" hits="1"/>
-						<line number="20" hits="1"/>
-						<line number="23" hits="1"/>
-						<line number="57" hits="1"/>
-						<line number="62" hits="1"/>
-						<line number="72" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
+						<line number="6" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,74"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
 					</lines>
 				</class>
 			</classes>
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 0120da9..c9331bb 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -153,3 +153,4 @@ google-auth-httplib2>=0.2.0
 # Google Cloud Tasks (Section 04: Celery -> Cloud Tasks migration)
 google-cloud-tasks>=2.14.0
 sentry-sdk[fastapi]
+posthog>=3.0.0
diff --git a/python-backend/tests/test_posthog_events.py b/python-backend/tests/test_posthog_events.py
new file mode 100644
index 0000000..432df65
--- /dev/null
+++ b/python-backend/tests/test_posthog_events.py
@@ -0,0 +1,85 @@
+"""Tests for PostHog event capture on the Python side."""
+
+import pytest
+from unittest.mock import patch, MagicMock
+
+
+@pytest.mark.unit
+class TestPostHogEventCapture:
+
+    @patch("app.services.posthog_service._get_client")
+    def test_kie_submit_succeeded_event(self, mock_get_client):
+        """kie_submit_succeeded event is captured on successful Kie AI call."""
+        mock_ph = MagicMock()
+        mock_get_client.return_value = mock_ph
+
+        from app.services.posthog_service import capture_kie_submit
+
+        capture_kie_submit("user-123", "kie-job-456", "image")
+
+        mock_ph.capture.assert_called_once()
+        call_args = mock_ph.capture.call_args
+        assert call_args[0][0] == "user-123"
+        assert call_args[0][1] == "kie_submit_succeeded"
+        props = call_args[1].get("properties") or call_args[0][2] if len(call_args[0]) > 2 else call_args[1].get("properties", {})
+        assert props["kie_job_id"] == "kie-job-456"
+        assert props["job_type"] == "image"
+
+    @patch("app.services.posthog_service._get_client")
+    def test_media_job_completed_event(self, mock_get_client):
+        """media_job_completed server-side event includes correct properties."""
+        mock_ph = MagicMock()
+        mock_get_client.return_value = mock_ph
+
+        from app.services.posthog_service import capture_media_job_completed
+
+        capture_media_job_completed(
+            user_id="user-123",
+            job_id="job-789",
+            job_type="video",
+            duration_ms=5000.0,
+            output_size_bytes=1024000,
+            resolution="1080p",
+        )
+
+        mock_ph.capture.assert_called_once()
+        call_args = mock_ph.capture.call_args
+        assert call_args[0][0] == "user-123"
+        assert call_args[0][1] == "media_job_completed"
+        props = call_args[1].get("properties") or call_args[0][2] if len(call_args[0]) > 2 else call_args[1].get("properties", {})
+        assert props["job_id"] == "job-789"
+        assert props["job_type"] == "video"
+        assert props["duration_ms"] == 5000.0
+        assert props["output_size_bytes"] == 1024000
+        assert props["resolution"] == "1080p"
+
+    @patch("app.services.posthog_service._get_client")
+    def test_media_job_failed_event(self, mock_get_client):
+        """media_job_failed event includes error_message."""
+        mock_ph = MagicMock()
+        mock_get_client.return_value = mock_ph
+
+        from app.services.posthog_service import capture_media_job_failed
+
+        capture_media_job_failed(
+            user_id="user-123",
+            job_id="job-789",
+            job_type="audio",
+            error_message="FFmpeg encoding failed",
+        )
+
+        mock_ph.capture.assert_called_once()
+        call_args = mock_ph.capture.call_args
+        assert call_args[0][1] == "media_job_failed"
+        props = call_args[1].get("properties") or call_args[0][2] if len(call_args[0]) > 2 else call_args[1].get("properties", {})
+        assert props["error_message"] == "FFmpeg encoding failed"
+
+    @patch("app.services.posthog_service._get_client")
+    def test_noop_when_no_api_key(self, mock_get_client):
+        """No event captured when client is not configured."""
+        mock_get_client.return_value = None
+
+        from app.services.posthog_service import capture_event
+
+        capture_event("user-123", "test_event", {"key": "value"})
+        # Should not crash, no capture called
diff --git a/specs/feature/011-DeployPlan/implementation/deep_implement_config.json b/specs/feature/011-DeployPlan/implementation/deep_implement_config.json
index 9f55399..94105ac 100644
--- a/specs/feature/011-DeployPlan/implementation/deep_implement_config.json
+++ b/specs/feature/011-DeployPlan/implementation/deep_implement_config.json
@@ -76,6 +76,10 @@
     "section-12-vectorize": {
       "status": "complete",
       "commit_hash": "58e5949"
+    },
+    "section-13-sentry": {
+      "status": "complete",
+      "commit_hash": "597ef35"
     }
   },
   "pre_commit": {
