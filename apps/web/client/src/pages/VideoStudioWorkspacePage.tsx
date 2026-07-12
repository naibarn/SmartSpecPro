/**
 * VideoStudioWorkspacePage (Feature 133, section-08 §10.2) — the per-project
 * workspace: stage rail (Brief -> Scenes -> Narration -> Motion -> Captions
 * -> QA -> Render), per-stage panels operating on an in-memory draft of the
 * `VideoProjectDocument`, and explicit save (optimistic-concurrency
 * `saveDocument` with `baseRevision`). A `CONFLICT` response (stale
 * `baseRevision`) NEVER silently overwrites — it shows a banner and only
 * reloads the server's copy when the user explicitly clicks Reload.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BriefPanel } from "@/components/videoStudio/BriefPanel";
import { CaptionsPanel } from "@/components/videoStudio/CaptionsPanel";
import { MotionPanel } from "@/components/videoStudio/MotionPanel";
import { NarrationPanel } from "@/components/videoStudio/NarrationPanel";
import { QaPanel } from "@/components/videoStudio/QaPanel";
import { RenderPanel } from "@/components/videoStudio/RenderPanel";
import { ScenesPanel } from "@/components/videoStudio/ScenesPanel";
import { StageRail, type VideoStudioStage } from "@/components/videoStudio/StageRail";
import { pickCopy, useVideoStudioLang, videoStudioCopy } from "@/components/videoStudio/videoStudioCopy";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

export default function VideoStudioWorkspacePage() {
  const [, params] = useRoute("/video-studio/:id");
  const projectId = params?.id ? Number(params.id) : NaN;
  const lang = useVideoStudioLang();
  const utils = trpc.useUtils();

  const [stage, setStage] = useState<VideoStudioStage>("brief");
  const [draftDocument, setDraftDocument] = useState<VideoProjectDocument | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [lastSavedJson, setLastSavedJson] = useState<string>("null");
  const [conflictBanner, setConflictBanner] = useState(false);

  const projectQuery = trpc.videoProjects.get.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId) },
  );
  const project = projectQuery.data;

  useEffect(() => {
    if (project && baseRevision === null) {
      const doc = (project.document as VideoProjectDocument | null) ?? null;
      setDraftDocument(doc);
      setBaseRevision(project.revision);
      setLastSavedJson(JSON.stringify(doc));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.revision, baseRevision]);

  const hasUnsavedChanges = JSON.stringify(draftDocument) !== lastSavedJson;

  const saveDocument = trpc.videoProjects.saveDocument.useMutation({
    onSuccess: (result) => {
      setBaseRevision(result.revision);
      setLastSavedJson(JSON.stringify(draftDocument));
      setConflictBanner(false);
      toast.success(pickCopy(lang, videoStudioCopy.saved));
      utils.videoProjects.get.invalidate({ projectId });
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        setConflictBanner(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  function handleReload() {
    setConflictBanner(false);
    setBaseRevision(null);
    projectQuery.refetch();
  }

  function handleSave() {
    if (!draftDocument || baseRevision === null) return;
    saveDocument.mutate({ projectId, baseRevision, document: draftDocument });
  }

  const pageState: AppPageState = !Number.isFinite(projectId)
    ? "error"
    : projectQuery.isLoading
      ? "loading"
      : projectQuery.isError || !project
        ? "error"
        : "ready";

  return (
    <AppPage
      title={project?.name ?? pickCopy(lang, videoStudioCopy.pageTitle)}
      description={project?.studioType}
      breadcrumbs={[
        { label: pickCopy(lang, videoStudioCopy.dashboard), href: "/dashboard" },
        { label: pickCopy(lang, videoStudioCopy.pageTitle), href: "/video-studio" },
        { label: project?.name ?? "..." },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={pickCopy(lang, { th: "ย้อนกลับ", en: "Back" })}
          >
            <Link href="/video-studio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            data-testid="video-studio-save-document"
            disabled={!hasUnsavedChanges || saveDocument.isPending || !draftDocument}
            onClick={handleSave}
          >
            {saveDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {hasUnsavedChanges ? pickCopy(lang, videoStudioCopy.save) : pickCopy(lang, videoStudioCopy.saved)}
          </Button>
        </div>
      }
      toolbar={
        project ? (
          <StageRail lang={lang} active={stage} onSelect={setStage} />
        ) : undefined
      }
      state={pageState}
      error={{
        title: pickCopy(lang, { th: "โหลดโปรเจกต์ไม่สำเร็จ", en: "Failed to load project" }),
        description: projectQuery.error?.message,
        onRetry: () => projectQuery.refetch(),
      }}
    >
      {project ? (
        <div className="flex flex-col gap-4">
          {conflictBanner ? (
            <Alert variant="destructive" data-testid="video-studio-conflict-banner">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{pickCopy(lang, videoStudioCopy.conflictTitle)}</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>{pickCopy(lang, videoStudioCopy.conflictBody)}</span>
                <Button variant="outline" size="sm" className="self-start" onClick={handleReload}>
                  {pickCopy(lang, videoStudioCopy.reload)}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {hasUnsavedChanges && !conflictBanner ? (
            <p
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="video-studio-unsaved-indicator"
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              {pickCopy(lang, videoStudioCopy.unsavedChanges)}
            </p>
          ) : null}

          {stage === "brief" ? (
            <BriefPanel
              lang={lang}
              project={project}
              document={draftDocument}
              onDocumentInitialized={(doc) => setDraftDocument(doc)}
              onDocumentChange={(doc) => setDraftDocument(doc)}
            />
          ) : null}

          {stage !== "brief" && !draftDocument ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {pickCopy(lang, {
                  th: "ยังไม่มีเอกสารวิดีโอ กรุณาเริ่มต้นในขั้นตอนโจทย์ก่อน",
                  en: "No video document yet — initialize it in the Brief stage first.",
                })}
              </AlertTitle>
            </Alert>
          ) : null}

          {stage === "scenes" && draftDocument ? (
            <ScenesPanel
              lang={lang}
              projectId={projectId}
              document={draftDocument}
              onChange={setDraftDocument}
            />
          ) : null}

          {stage === "narration" && draftDocument ? (
            <NarrationPanel
              lang={lang}
              projectId={projectId}
              document={draftDocument}
              onDocumentSaved={() => {
                setBaseRevision(null);
                projectQuery.refetch();
              }}
            />
          ) : null}

          {stage === "motion" && draftDocument ? (
            <MotionPanel lang={lang} document={draftDocument} onChange={setDraftDocument} />
          ) : null}

          {stage === "captions" && draftDocument ? (
            <CaptionsPanel
              lang={lang}
              projectId={projectId}
              document={draftDocument}
              onChange={setDraftDocument}
            />
          ) : null}

          {stage === "qa" && draftDocument ? (
            <QaPanel lang={lang} projectId={projectId} document={draftDocument} onChange={setDraftDocument} />
          ) : null}

          {stage === "render" ? (
            <RenderPanel lang={lang} projectId={projectId} hasUnsavedChanges={hasUnsavedChanges} />
          ) : null}
        </div>
      ) : null}
    </AppPage>
  );
}
