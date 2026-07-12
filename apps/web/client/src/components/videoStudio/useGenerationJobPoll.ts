/**
 * Shared resume-on-mount + poll (>=2.5s interval) hook for a Video
 * Intelligence generation-stage job (Feature 133, section-08). Used by
 * every stage that submits a job via `videoIntelligenceJobs.ts`'s generic
 * queue (`runScenePlanStage`, `runQualityReview`, `applyQualityRepairs`) so
 * the "in-flight job -> poll status -> terminal" flow is implemented once.
 */
import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";

export type VideoStudioJobKind = "scene_plan" | "narration" | "quality_review" | "quality_repair";

const POLL_INTERVAL_MS = 2500;

export function useGenerationJobPoll(projectId: number, kind: VideoStudioJobKind) {
  const [jobId, setJobId] = useState<string | null>(null);

  // Resume-on-mount: pick up an in-flight job of this kind if one already
  // exists for this project (e.g. the user navigated away and back).
  const activeJobQuery = trpc.videoProjects.getActiveGenerationJob.useQuery(
    { projectId },
    { staleTime: 0 },
  );
  useEffect(() => {
    if (activeJobQuery.data?.jobId && activeJobQuery.data.kind === kind) {
      setJobId(activeJobQuery.data.jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobQuery.data?.jobId, activeJobQuery.data?.kind]);

  const jobStatusQuery = trpc.videoProjects.getGenerationJobStatus.useQuery(
    { projectId, jobId: jobId ?? "" },
    {
      enabled: Boolean(jobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "succeeded" || status === "failed" ? false : POLL_INTERVAL_MS;
      },
    },
  );

  return { jobId, setJobId, jobStatus: jobStatusQuery.data };
}
