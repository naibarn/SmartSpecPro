import type {
  ArticleStoryboardArticlePageInput,
  ArticleStoryboardOverlayPlan,
  ArticleStoryboardPlanningOptions,
  ArticleStoryboardReferenceImage,
  ArticleStoryboardVideoShotPlan,
} from "./contracts";
import { DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS } from "./timing";

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function pageKey(page: ArticleStoryboardArticlePageInput, index: number): string {
  const id = page.id == null ? "" : String(page.id).trim();
  return id || `page-${index + 1}`;
}

export function extractArticleStoryboardOverlay(
  page: ArticleStoryboardArticlePageInput,
  pageId: string,
): ArticleStoryboardOverlayPlan {
  const headline = compactText(page.title) || compactText(page.heading) || `Page ${page.pageNumber ?? ""}`.trim();
  const subtext = compactText(page.keyText) || compactText(page.summary) || compactText(page.subtitle);
  const warningCodes: ArticleStoryboardOverlayPlan["warningCodes"] = [];
  if (headline.length > 90 || subtext.length > 140) {
    warningCodes.push("overlay_text_long");
  }

  return {
    id: `${pageId}:overlay`,
    preset: headline.length > 42 ? "lower_third" : "center_title",
    headline: headline || "Untitled page",
    subtext,
    css: {
      position: "absolute",
      left: "6%",
      right: "6%",
      bottom: "8%",
      color: "var(--storyboard-overlay-fg, #ffffff)",
      background: "rgba(0, 0, 0, 0.42)",
      padding: "16px 18px",
      borderRadius: 8,
    },
    source: compactText(page.title)
      ? "article_title"
      : compactText(page.heading)
        ? "article_heading"
        : compactText(page.summary)
          ? "article_summary"
          : "fallback",
    warningCodes,
  };
}

export function normalizeArticleStoryboardReferenceImages(
  references: ArticleStoryboardReferenceImage[] | undefined,
): ArticleStoryboardReferenceImage[] {
  if (!Array.isArray(references)) {
    return [];
  }
  const seen = new Set<string>();
  return references
    .filter((reference) => reference && typeof reference.url === "string" && reference.url.trim().length > 0)
    .map((reference, index) => ({
      ...reference,
      id: reference.id || `reference-${index + 1}`,
      url: reference.url.trim(),
    }))
    .filter((reference) => {
      if (seen.has(reference.id)) {
        return false;
      }
      seen.add(reference.id);
      return true;
    });
}

export function buildArticleStoryboardVideoShotPlans(
  options: ArticleStoryboardPlanningOptions,
): ArticleStoryboardVideoShotPlan[] {
  const durationSeconds = options.durationSeconds ?? DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS;
  return options.pages.map((page, index) => {
    const pageId = pageKey(page, index);
    const pageNumber = page.pageNumber ?? index + 1;
    const articleTitle = compactText(page.title) || compactText(page.heading) || `Page ${pageNumber}`;
    const articleText = [
      compactText(page.title),
      compactText(page.subtitle),
      compactText(page.summary),
      compactText(page.keyText),
      compactText(page.body),
      compactText(page.text),
    ].filter(Boolean).join("\n\n");
    const overlay = extractArticleStoryboardOverlay({ ...page, pageNumber }, pageId);
    const selectedReferenceImages = normalizeArticleStoryboardReferenceImages(
      options.selectedReferenceImagesByPageId?.[pageId],
    );
    const characterReferenceImages = normalizeArticleStoryboardReferenceImages(
      options.characterReferenceImagesByPageId?.[pageId],
    );
    const warningCodes = [...overlay.warningCodes];
    if (selectedReferenceImages.length === 0) {
      warningCodes.push("reference_candidates_stale");
    }

    return {
      id: `article-video-shot-${pageNumber}`,
      pageId,
      pageNumber,
      articleTitle,
      articleText,
      overlay,
      durationSeconds,
      selectedReferenceImages,
      characterReferenceImages,
      staticSlideFallbackUrl: compactText(page.slideImageUrl) || undefined,
      warningCodes,
      nativeSpeechLineCount: 0,
      speakerSegmentCount: 0,
      stale: {
        candidateSheet: false,
        videoPrompt: selectedReferenceImages.length === 0,
      },
    };
  });
}

export function markArticleStoryboardReferencesChanged(
  shot: ArticleStoryboardVideoShotPlan,
  change: "character_references" | "selected_scene_references",
): ArticleStoryboardVideoShotPlan {
  return {
    ...shot,
    stale: {
      candidateSheet: change === "character_references" ? true : shot.stale.candidateSheet,
      videoPrompt: true,
    },
    warningCodes: Array.from(new Set([...shot.warningCodes, "video_prompt_stale"])),
  };
}
