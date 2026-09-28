import type {
  StoryboardGlobalInput,
  StoryboardPlannedShot,
  StoryboardCanonicalSkillResponse,
} from "./storyboardSkillFrameworkContracts";

export type StoryboardFrameworkProjectionShot = {
  id: string;
  shotNumber: number;
  prompt: string;
  /** Canonical storyboard-review media field. */
  url: string | null;
  videoPrompt: string | null;
  durationSeconds: number;
  mediaType: "image";
  type: "image";
  status: "completed" | "queued";
  source: "generated";
  model: string;
  modelProvenance: {
    image: { requestedModelId: string; effectiveModelId?: string };
    video: { requestedModelId: string };
  };
  generationExtraParams: Record<string, unknown>;
  storyboardContext: Record<string, unknown>;
};

export type StoryboardFrameworkReviewProjection = {
  version: 1;
  source: "skill_framework";
  projectId: string;
  runId: string;
  projectName: string;
  taskIds: string[];
  selectedTaskIds: string[];
  modelProvenance: {
    image: { requestedModelId: string; effectiveModelId?: string };
    video: { requestedModelId: string };
  };
  tasks: StoryboardFrameworkProjectionShot[];
};

export function buildStoryboardReviewProjection(input: {
  projectId: string;
  runId: string;
  projectName: string;
  global: StoryboardGlobalInput;
  shots: Array<{
    shot: StoryboardPlannedShot;
    response: StoryboardCanonicalSkillResponse;
    imageUrl?: string | null;
    videoPrompt?: string | null;
    imageEffectiveModelId?: string | null;
  }>;
}): StoryboardFrameworkReviewProjection {
  const modelProvenance = {
    image: {
      requestedModelId: input.global.imageModelSelection.modelId,
      ...(input.shots.find((item) => item.imageEffectiveModelId)?.imageEffectiveModelId
        ? { effectiveModelId: input.shots.find((item) => item.imageEffectiveModelId)?.imageEffectiveModelId }
        : {}),
    },
    video: { requestedModelId: input.global.videoModelSelection.modelId },
  };
  const tasks = input.shots.map(
    ({ shot, response, imageUrl = null, videoPrompt = null }) => {
      const id = `skill-${input.runId}-shot-${shot.shotNumber}`;
      return {
        id,
        shotNumber: shot.shotNumber,
        prompt: response.result.generation_request.prompt,
        url: imageUrl,
        videoPrompt,
        durationSeconds: input.global.shotDurationSec,
        mediaType: "image" as const,
        type: "image" as const,
        status: imageUrl ? "completed" as const : "queued" as const,
        source: "generated" as const,
        model: input.global.imageModelSelection.modelId,
        modelProvenance,
        generationExtraParams: {
          source: "skill_framework",
          runId: input.runId,
          skillId: input.global.selectedSkillId,
          skillVersion: input.global.selectedSkillVersion,
          generationRequest: response.result.generation_request,
          beat: shot.beat,
          dialogueLines: shot.dialogueLines,
        },
        storyboardContext: {
          shotNumber: shot.shotNumber,
          beat: shot.beat,
          storyType: input.global.storyType,
          videoModelId: input.global.videoModelSelection.modelId,
          modelProvenance,
        },
      };
    }
  );
  const taskIds = tasks.map(task => task.id);
  return {
    version: 1,
    source: "skill_framework",
    projectId: input.projectId,
    runId: input.runId,
    projectName: input.projectName,
    taskIds,
    selectedTaskIds: taskIds,
    modelProvenance,
    tasks,
  };
}
