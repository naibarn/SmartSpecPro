import type { ArticleStoryboardReferenceImage, ArticleStoryboardVideoShotPlan } from "./contracts";
import { markArticleStoryboardReferencesChanged } from "./planning";

export type ArticleStoryboardCandidateSheetStatus = "empty" | "generating" | "ready" | "failed" | "stale";

export interface ArticleStoryboardReferenceCandidateSheet {
  id: string;
  shotId: string;
  pageId: string;
  status: ArticleStoryboardCandidateSheetStatus;
  candidates: ArticleStoryboardReferenceImage[];
  selectedReferenceIds: string[];
  errorMessage?: string;
  generatedAt?: string;
}

export function createEmptyArticleStoryboardCandidateSheet(
  shot: Pick<ArticleStoryboardVideoShotPlan, "id" | "pageId">,
): ArticleStoryboardReferenceCandidateSheet {
  return {
    id: `${shot.id}:candidate-sheet`,
    shotId: shot.id,
    pageId: shot.pageId,
    status: "empty",
    candidates: [],
    selectedReferenceIds: [],
  };
}

export function markArticleStoryboardCandidateSheetGenerating(
  sheet: ArticleStoryboardReferenceCandidateSheet,
): ArticleStoryboardReferenceCandidateSheet {
  return { ...sheet, status: "generating", errorMessage: undefined };
}

export function markArticleStoryboardCandidateSheetFailed(
  sheet: ArticleStoryboardReferenceCandidateSheet,
  errorMessage: string,
): ArticleStoryboardReferenceCandidateSheet {
  return { ...sheet, status: "failed", errorMessage, candidates: [], selectedReferenceIds: [] };
}

export function splitArticleStoryboard3x3Sheet(input: {
  sheetId: string;
  shotId: string;
  pageId: string;
  imageUrl: string;
  generatedAt?: string;
}): ArticleStoryboardReferenceCandidateSheet {
  const candidates = Array.from({ length: 9 }, (_, index): ArticleStoryboardReferenceImage => ({
    id: `${input.sheetId}:frame-${index + 1}`,
    url: `${input.imageUrl}${input.imageUrl.includes("?") ? "&" : "?"}frame=${index + 1}`,
    label: `Reference ${index + 1}`,
    source: "generated_3x3",
    safetyStatus: "approved",
    confirmed: true,
    primary: index === 0,
    metadata: {
      sheetId: input.sheetId,
      gridIndex: index,
      row: Math.floor(index / 3),
      column: index % 3,
    },
  }));
  return {
    id: input.sheetId,
    shotId: input.shotId,
    pageId: input.pageId,
    status: "ready",
    candidates,
    selectedReferenceIds: candidates.slice(0, 3).map((candidate) => candidate.id),
    generatedAt: input.generatedAt,
  };
}

export function autoSelectArticleStoryboardSceneReferences(
  sheet: ArticleStoryboardReferenceCandidateSheet,
  count = 3,
): ArticleStoryboardReferenceImage[] {
  const normalizedCount = Math.max(1, Math.min(5, Math.round(count)));
  return sheet.candidates.slice(0, normalizedCount).map((candidate, index) => ({
    ...candidate,
    primary: index === 0,
  }));
}

export function updateArticleStoryboardSelectedSceneReferences(
  sheet: ArticleStoryboardReferenceCandidateSheet,
  selectedReferenceIds: string[],
): ArticleStoryboardReferenceCandidateSheet {
  const allowedIds = new Set(sheet.candidates.map((candidate) => candidate.id));
  return {
    ...sheet,
    selectedReferenceIds: selectedReferenceIds
      .filter((id) => allowedIds.has(id))
      .slice(0, 5),
  };
}

export function applyArticleStoryboardReferenceChange(
  shot: ArticleStoryboardVideoShotPlan,
  change: "character_references" | "selected_scene_references",
): ArticleStoryboardVideoShotPlan {
  return markArticleStoryboardReferencesChanged(shot, change);
}

export function preserveCharacterReferencesOnRepair(
  previousShot: ArticleStoryboardVideoShotPlan,
  repairedShot: ArticleStoryboardVideoShotPlan,
): ArticleStoryboardVideoShotPlan {
  return {
    ...repairedShot,
    characterReferenceImages: previousShot.characterReferenceImages,
  };
}

export function buildArticleStoryboardReferenceCandidateInput(shot: ArticleStoryboardVideoShotPlan): {
  shotId: string;
  pageId: string;
  pageNumber: number;
  articleTitle: string;
  articleIntent: string;
  characterReferenceImages: ArticleStoryboardReferenceImage[];
} {
  return {
    shotId: shot.id,
    pageId: shot.pageId,
    pageNumber: shot.pageNumber,
    articleTitle: shot.articleTitle,
    articleIntent: shot.articleText.slice(0, 1000),
    characterReferenceImages: shot.characterReferenceImages,
  };
}

export function buildArticleStoryboardReferenceCandidatePrompt(shot: ArticleStoryboardVideoShotPlan): string {
  const input = buildArticleStoryboardReferenceCandidateInput(shot);
  const characterReferences = input.characterReferenceImages
    .map((reference, index) => `${index + 1}. ${reference.label || reference.id}: ${reference.url}`)
    .join("\n");
  return [
    "Create one 3x3 reference image candidate sheet for this article video shot.",
    `Page ${input.pageNumber}: ${input.articleTitle}`,
    "Article intent:",
    input.articleIntent || "Use the article title and overlay text to infer the visual direction.",
    characterReferences
      ? `Character references to preserve identity:\n${characterReferences}`
      : "No character identity reference is attached.",
    "Generate 9 distinct visual options. Keep them suitable as reference frames for a later video prompt, not final text slides.",
  ].join("\n");
}
