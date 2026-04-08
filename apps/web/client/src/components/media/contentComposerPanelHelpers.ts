import type { ContentComposerDraft } from "../../../../drizzle/schema";
import type { ComposerState } from "@/components/media/composerReducer";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateArticleDraftHtml(state: Pick<ComposerState, "topic" | "executionSource" | "skillId" | "agencyName" | "requiresWebSearch" | "requiresThinking">): string {
  const sourceLabel = state.executionSource === "agency"
    ? state.agencyName || "Agency"
    : state.skillId || "Skill";

  return [
    `<h1>${escapeHtml(state.topic.trim() || "Untitled article")}</h1>`,
    `<p>Draft generated with <strong>${escapeHtml(sourceLabel)}</strong>.</p>`,
    `<p>Web search: ${state.requiresWebSearch ? "enabled" : "disabled"}.</p>`,
    `<p>Thinking: ${state.requiresThinking ? "enabled" : "disabled"}.</p>`,
  ].join("");
}

export function makeComposerStateFromDraft(draft: ContentComposerDraft): ComposerState {
  return {
    activeDraftId: draft.id,
    currentStep: 1,
    topic: draft.topic ?? "",
    executionSource: draft.executionSource === "agency" ? "agency" : "skill",
    skillId: draft.skillId ?? null,
    agencyId: draft.agencyId ?? null,
    agencyName: null,
    requiresWebSearch: draft.requiresWebSearch ?? false,
    requiresThinking: draft.requiresThinking ?? false,
    showComplexityBanner: false,
    articleBody: draft.articleBody ?? "",
    isGenerating: false,
    generationError: null,
    attachmentIds: draft.attachmentIds ?? [],
    destinationKind: draft.destinationKind as ComposerState["destinationKind"] ?? null,
    docsSubKind: draft.docsSubKind as ComposerState["docsSubKind"] ?? null,
    docsTargetId: draft.docsTargetId ?? null,
    blogTargetId: draft.blogTargetId ?? null,
    socialPlatform: draft.socialPlatform as ComposerState["socialPlatform"] ?? null,
    socialTargetId: draft.socialTargetId ?? null,
    socialCaption: draft.socialCaption ?? "",
    captionIsManuallyEdited: Boolean(draft.socialCaption),
    isCaptionGenerating: false,
    lastSavedAt: draft.updatedAt ?? null,
    isSaving: false,
    isDirty: false,
    isPublishing: draft.status === "published",
    publishError: draft.errorMessage ?? null,
  };
}

export function makeSaveDraftInput(state: ComposerState) {
  return {
    id: state.activeDraftId ?? null,
    topic: state.topic || null,
    executionSource: state.executionSource,
    skillId: state.skillId,
    agencyId: state.agencyId,
    requiresWebSearch: state.requiresWebSearch,
    requiresThinking: state.requiresThinking,
    articleBody: state.articleBody || null,
    attachmentIds: state.attachmentIds,
    destinationKind: state.destinationKind,
    docsSubKind: state.docsSubKind,
    docsTargetId: state.docsTargetId,
    blogTargetId: state.blogTargetId,
    socialPlatform: state.socialPlatform,
    socialTargetId: state.socialTargetId,
    socialCaption: state.socialCaption || null,
  };
}
