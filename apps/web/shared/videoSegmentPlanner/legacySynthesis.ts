import {
  type VideoSegmentAudioStrategy,
  type VideoSegmentPlan,
  type VideoSegmentPlannerShot,
  type VideoSegmentReferenceMode,
  type VideoSegmentTransport,
} from "./contracts";
import { planVideoSegments } from "./planner";

export function synthesizePerShotVideoSegmentPlan(input: {
  sourceSurface?: "marketplace_capture" | "storyboard_review" | "media_studio" | "production" | "unknown";
  videoModelId: string;
  provider?: string;
  transport?: VideoSegmentTransport;
  audioStrategy?: VideoSegmentAudioStrategy;
  referenceMode?: VideoSegmentReferenceMode;
  shots: VideoSegmentPlannerShot[];
}): VideoSegmentPlan {
  return planVideoSegments({
    sourceSurface: input.sourceSurface ?? "storyboard_review",
    mode: "per_shot",
    videoModelId: input.videoModelId,
    provider: input.provider,
    transport: input.transport ?? "gateway_api",
    audioStrategy: input.audioStrategy ?? "auto",
    referenceMode: input.referenceMode ?? "single_storyboard_frame",
    creativePresets: [],
    shots: input.shots,
  });
}
