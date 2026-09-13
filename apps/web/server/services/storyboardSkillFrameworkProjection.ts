import type {
  StoryboardGlobalInput,
  StoryboardPlannedShot,
  StoryboardCanonicalSkillResponse,
} from "./storyboardSkillFrameworkContracts";

export type StoryboardFrameworkProjectionShot = {
  id: string;
  shotNumber: number;
  prompt: string;
  imageUrl: string | null;
  videoPrompt: string | null;
  durationSeconds: number;
  mediaType: "image";
  model: string;
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
  }>;
}): StoryboardFrameworkReviewProjection {
  const tasks = input.shots.map(
    ({ shot, response, imageUrl = null, videoPrompt = null }) => {
      const id = `skill-${input.runId}-shot-${shot.shotNumber}`;
      return {
        id,
        shotNumber: shot.shotNumber,
        prompt: response.result.generation_request.prompt,
        imageUrl,
        videoPrompt,
        durationSeconds: input.global.shotDurationSec,
        mediaType: "image" as const,
        model: input.global.imageModelSelection.modelId,
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
    tasks,
  };
}
