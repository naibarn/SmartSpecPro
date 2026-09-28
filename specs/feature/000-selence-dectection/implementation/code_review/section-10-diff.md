diff --git a/apps/web/client/src/services/__tests__/mediaJobClient.test.ts b/apps/web/client/src/services/__tests__/mediaJobClient.test.ts
index 1fb2fac..96b25d6 100644
--- a/apps/web/client/src/services/__tests__/mediaJobClient.test.ts
+++ b/apps/web/client/src/services/__tests__/mediaJobClient.test.ts
@@ -262,6 +262,64 @@ describe("MediaJobClient", () => {
     expect(spec.params?.mode).toBe("remove");
   });
 
+  it("cutDeadAir includes softeningBufferMs in job spec params", async () => {
+    mockAdapter.setStatusSequence([
+      { jobId: "any", status: "done", progress: 1.0 },
+    ]);
+
+    const segments = [{ startMs: 1000, endMs: 3000 }];
+    const promise = client.cutDeadAir("file:///test.mp4", segments, "remove", {
+      softeningBufferMs: 200,
+    });
+    await vi.advanceTimersByTimeAsync(3100);
+    await promise;
+
+    const spec = mockAdapter.submitJobCalls[0];
+    expect(spec.params?.softeningBufferMs).toBe(200);
+  });
+
+  it("cutDeadAir includes crossfade flag in job spec params", async () => {
+    mockAdapter.setStatusSequence([
+      { jobId: "any", status: "done", progress: 1.0 },
+    ]);
+
+    const segments = [{ startMs: 1000, endMs: 3000 }];
+    const promise = client.cutDeadAir("file:///test.mp4", segments, "remove", {
+      crossfade: true,
+    });
+    await vi.advanceTimersByTimeAsync(3100);
+    await promise;
+
+    const spec = mockAdapter.submitJobCalls[0];
+    expect(spec.params?.crossfade).toBe(true);
+  });
+
+  it("cutDeadAir defaults softeningBufferMs to 0 when not provided", async () => {
+    mockAdapter.setStatusSequence([
+      { jobId: "any", status: "done", progress: 1.0 },
+    ]);
+
+    const promise = client.cutDeadAir("file:///test.mp4", []);
+    await vi.advanceTimersByTimeAsync(3100);
+    await promise;
+
+    const spec = mockAdapter.submitJobCalls[0];
+    expect(spec.params?.softeningBufferMs).toBe(0);
+  });
+
+  it("cutDeadAir defaults crossfade to false when not provided", async () => {
+    mockAdapter.setStatusSequence([
+      { jobId: "any", status: "done", progress: 1.0 },
+    ]);
+
+    const promise = client.cutDeadAir("file:///test.mp4", []);
+    await vi.advanceTimersByTimeAsync(3100);
+    await promise;
+
+    const spec = mockAdapter.submitJobCalls[0];
+    expect(spec.params?.crossfade).toBe(false);
+  });
+
   it("getThumbnails convenience method builds correct job spec", async () => {
     mockAdapter.setStatusSequence([
       { jobId: "any", status: "done", progress: 1.0 },
diff --git a/apps/web/client/src/services/mediaJobClient.ts b/apps/web/client/src/services/mediaJobClient.ts
index dccd1db..a2e64ba 100644
--- a/apps/web/client/src/services/mediaJobClient.ts
+++ b/apps/web/client/src/services/mediaJobClient.ts
@@ -60,6 +60,11 @@ export interface SilenceSegment {
   endMs: number;
 }
 
+export interface CutDeadAirOptions {
+  softeningBufferMs?: number;
+  crossfade?: boolean;
+}
+
 export interface ConcatClip {
   uri: string;
   inMs?: number;
@@ -268,6 +273,7 @@ export class MediaJobClient {
     assetUri: string,
     segments: SilenceSegment[],
     mode: "remove" | "compress" = "remove",
+    options?: CutDeadAirOptions,
   ): Promise<MediaJobResult> {
     const jobId = generateJobId();
     const spec: MediaJobSpec = {
@@ -277,7 +283,12 @@ export class MediaJobClient {
       inputs: {
         assets: [{ assetId: "input", kind: "video", uri: assetUri }],
       },
-      params: { segments, mode },
+      params: {
+        segments: segments.map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
+        mode,
+        softeningBufferMs: options?.softeningBufferMs ?? 0,
+        crossfade: options?.crossfade ?? false,
+      },
       output: { mode: "file", target: "" },
     };
     await this.submitJob(spec);
