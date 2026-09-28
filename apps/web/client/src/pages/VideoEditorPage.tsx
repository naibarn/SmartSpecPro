import { lazy, Suspense } from "react";
import { VideoEditorPhase3 } from "@/components/videoeditor/VideoEditorPhase3";

const LegacyVideoEditor = lazy(() => import("@/components/videoeditor/WorkerWebEditor"));

/**
 * Web-first editor entry point. Phase 3 is the full browser editor surface
 * (asset panels, multitrack timeline and editing tools) with an explicit
 * Worker handoff. The compact migration editor remains available at
 * `/video-editor?legacy=1` as a rollback path for old project data.
 */
export default function VideoEditorPage() {
  const isLegacy = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("legacy") === "1";
  if (isLegacy) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">กำลังเปิด editor เดิม...</div>}>
        <LegacyVideoEditor />
      </Suspense>
    );
  }
  return <VideoEditorPhase3 workerHandoff />;
}
