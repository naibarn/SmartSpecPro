export type ComposerStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface ComposerState {
  activeDraftId: string | null;
  currentStep: ComposerStep;
  topic: string;
  executionSource: "skill" | "agency";
  skillId: string | null;
  agencyId: string | null;
  agencyName: string | null;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  showComplexityBanner: boolean;
  articleBody: string;
  isGenerating: boolean;
  generationError: string | null;
  attachmentIds: number[];
  destinationKind: "docs" | "blog" | "social" | null;
  docsSubKind: "doc_page" | "cms_page" | null;
  docsTargetId: number | null;
  blogTargetId: number | null;
  socialPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null;
  socialTargetId: number | null;
  socialCaption: string;
  captionIsManuallyEdited: boolean;
  isCaptionGenerating: boolean;
  lastSavedAt: Date | null;
  isSaving: boolean;
  isDirty: boolean;
  isPublishing: boolean;
  publishError: string | null;
}

export const COMPLEXITY_KEYWORDS = [
  "research",
  "compare",
  "analyze",
  "comprehensive",
  "multi-step",
  "in-depth",
  "detailed",
  "review",
  "versus",
  "vs",
  "pros and cons",
];

export const initialComposerState: ComposerState = {
  activeDraftId: null,
  currentStep: 0,
  topic: "",
  executionSource: "skill",
  skillId: null,
  agencyId: null,
  agencyName: null,
  requiresWebSearch: false,
  requiresThinking: false,
  showComplexityBanner: false,
  articleBody: "",
  isGenerating: false,
  generationError: null,
  attachmentIds: [],
  destinationKind: null,
  docsSubKind: null,
  docsTargetId: null,
  blogTargetId: null,
  socialPlatform: null,
  socialTargetId: null,
  socialCaption: "",
  captionIsManuallyEdited: false,
  isCaptionGenerating: false,
  lastSavedAt: null,
  isSaving: false,
  isDirty: false,
  isPublishing: false,
  publishError: null,
};

export type ComposerAction =
  | { type: "START_NEW_DRAFT" }
  | { type: "DRAFT_CREATED"; payload: string }
  | { type: "RESUME_DRAFT"; payload: ComposerState }
  | { type: "GO_TO_STEP"; payload: ComposerStep }
  | { type: "SET_TOPIC"; payload: string }
  | { type: "SET_EXECUTION_SOURCE"; payload: "skill" | "agency" }
  | { type: "SET_SKILL"; payload: string | null }
  | { type: "SET_AGENCY"; payload: { id: string; name: string } | null }
  | { type: "TOGGLE_WEB_SEARCH" }
  | { type: "TOGGLE_THINKING" }
  | { type: "DISMISS_COMPLEXITY_BANNER" }
  | { type: "START_GENERATION" }
  | { type: "STREAMING_CHUNK"; payload: string }
  | { type: "GENERATION_COMPLETE" }
  | { type: "GENERATION_ERROR"; payload: string }
  | { type: "SET_ARTICLE_BODY"; payload: string }
  | { type: "SET_ATTACHMENT_IDS"; payload: number[] }
  | { type: "TOGGLE_ATTACHMENT"; payload: number }
  | { type: "SET_DESTINATION_KIND"; payload: ComposerState["destinationKind"] }
  | { type: "SET_DOCS_SUB_KIND"; payload: ComposerState["docsSubKind"] }
  | { type: "SET_DOCS_TARGET_ID"; payload: number | null }
  | { type: "SET_BLOG_TARGET_ID"; payload: number | null }
  | { type: "SET_SOCIAL_PLATFORM"; payload: ComposerState["socialPlatform"] }
  | { type: "SET_SOCIAL_TARGET_ID"; payload: number | null }
  | { type: "SET_SOCIAL_CAPTION"; payload: string }
  | { type: "SET_CAPTION_MANUALLY_EDITED"; payload: boolean }
  | { type: "START_CAPTION_GENERATION" }
  | { type: "CAPTION_GENERATION_COMPLETE"; payload: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_COMPLETE"; payload: Date }
  | { type: "SAVE_ERROR" }
  | { type: "PUBLISH_START" }
  | { type: "PUBLISH_COMPLETE" }
  | { type: "PUBLISH_ERROR"; payload: string };

function computeComplexity(topic: string): boolean {
  if (topic.length > 150) return true;
  const lower = topic.toLowerCase();
  return COMPLEXITY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function dedupeAttachmentIds(ids: number[]): number[] {
  return Array.from(new Set(ids)).slice(0, 6);
}

export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "START_NEW_DRAFT":
      return { ...initialComposerState, currentStep: 1 };
    case "DRAFT_CREATED":
      return { ...state, activeDraftId: action.payload, currentStep: 1, isDirty: false };
    case "RESUME_DRAFT":
      return { ...action.payload, isDirty: false, isSaving: false, isPublishing: false, publishError: null };
    case "GO_TO_STEP":
      return { ...state, currentStep: action.payload };
    case "SET_TOPIC":
      return {
        ...state,
        topic: action.payload,
        isDirty: true,
        showComplexityBanner: state.showComplexityBanner || computeComplexity(action.payload),
      };
    case "SET_EXECUTION_SOURCE":
      return {
        ...state,
        executionSource: action.payload,
        ...(action.payload === "agency"
          ? { skillId: null }
          : { agencyId: null, agencyName: null }),
        isDirty: true,
      };
    case "SET_SKILL":
      return {
        ...state,
        skillId: action.payload,
        agencyId: null,
        agencyName: null,
        isDirty: true,
      };
    case "SET_AGENCY":
      return {
        ...state,
        agencyId: action.payload?.id ?? null,
        agencyName: action.payload?.name ?? null,
        skillId: null,
        isDirty: true,
      };
    case "TOGGLE_WEB_SEARCH":
      return { ...state, requiresWebSearch: !state.requiresWebSearch, isDirty: true };
    case "TOGGLE_THINKING":
      return { ...state, requiresThinking: !state.requiresThinking, isDirty: true };
    case "DISMISS_COMPLEXITY_BANNER":
      return { ...state, showComplexityBanner: false };
    case "START_GENERATION":
      return { ...state, isGenerating: true, generationError: null };
    case "STREAMING_CHUNK":
      return { ...state, articleBody: `${state.articleBody}${action.payload}`, isDirty: true };
    case "GENERATION_COMPLETE":
      return { ...state, isGenerating: false };
    case "GENERATION_ERROR":
      return { ...state, isGenerating: false, generationError: action.payload };
    case "SET_ARTICLE_BODY":
      return { ...state, articleBody: action.payload, isDirty: true };
    case "SET_ATTACHMENT_IDS":
      return { ...state, attachmentIds: dedupeAttachmentIds(action.payload), isDirty: true };
    case "TOGGLE_ATTACHMENT": {
      const next = state.attachmentIds.includes(action.payload)
        ? state.attachmentIds.filter((id) => id !== action.payload)
        : dedupeAttachmentIds([...state.attachmentIds, action.payload]);
      return { ...state, attachmentIds: next, isDirty: true };
    }
    case "SET_DESTINATION_KIND":
      return {
        ...state,
        destinationKind: action.payload,
        ...(action.payload === "social"
          ? { docsSubKind: null, docsTargetId: null, blogTargetId: null }
          : action.payload === "docs"
            ? { socialPlatform: null, socialTargetId: null, socialCaption: "", captionIsManuallyEdited: false, blogTargetId: null }
            : action.payload === "blog"
              ? { socialPlatform: null, socialTargetId: null, socialCaption: "", captionIsManuallyEdited: false, docsSubKind: null, docsTargetId: null }
              : {}),
        isDirty: true,
      };
    case "SET_DOCS_SUB_KIND":
      return { ...state, docsSubKind: action.payload, isDirty: true };
    case "SET_DOCS_TARGET_ID":
      return { ...state, docsTargetId: action.payload, isDirty: true };
    case "SET_BLOG_TARGET_ID":
      return { ...state, blogTargetId: action.payload, isDirty: true };
    case "SET_SOCIAL_PLATFORM":
      return {
        ...state,
        socialPlatform: action.payload,
        socialTargetId: null,
        socialCaption: "",
        captionIsManuallyEdited: false,
        isDirty: true,
      };
    case "SET_SOCIAL_TARGET_ID":
      return { ...state, socialTargetId: action.payload, isDirty: true };
    case "SET_SOCIAL_CAPTION":
      return { ...state, socialCaption: action.payload, captionIsManuallyEdited: true, isDirty: true };
    case "SET_CAPTION_MANUALLY_EDITED":
      return { ...state, captionIsManuallyEdited: action.payload };
    case "START_CAPTION_GENERATION":
      return { ...state, isCaptionGenerating: true };
    case "CAPTION_GENERATION_COMPLETE":
      return {
        ...state,
        socialCaption: action.payload,
        isCaptionGenerating: false,
        captionIsManuallyEdited: false,
        isDirty: true,
      };
    case "SAVE_START":
      return { ...state, isSaving: true };
    case "SAVE_COMPLETE":
      return { ...state, isSaving: false, isDirty: false, lastSavedAt: action.payload };
    case "SAVE_ERROR":
      return { ...state, isSaving: false };
    case "PUBLISH_START":
      return { ...state, isPublishing: true, publishError: null };
    case "PUBLISH_COMPLETE":
      return { ...state, isPublishing: false, isDirty: false };
    case "PUBLISH_ERROR":
      return { ...state, isPublishing: false, publishError: action.payload };
    default:
      return state;
  }
}
