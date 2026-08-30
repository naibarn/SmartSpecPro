export type HomeFeatureGroupId = "create" | "organize" | "operate";

export type HomeFeature = {
  id: string;
  group: HomeFeatureGroupId;
  icon: string;
};

export const HOME_FEATURE_GROUPS: Array<{
  id: HomeFeatureGroupId;
  translationKey: `group.${HomeFeatureGroupId}`;
}> = [
  { id: "create", translationKey: "group.create" },
  { id: "organize", translationKey: "group.organize" },
  { id: "operate", translationKey: "group.operate" },
];

export const HOME_FEATURES: HomeFeature[] = [
  { id: "chat", group: "create", icon: "message" },
  { id: "mediaStudio", group: "create", icon: "sparkles" },
  { id: "storyboard", group: "create", icon: "clapperboard" },
  { id: "verticalSeries", group: "create", icon: "film" },
  { id: "videoStudio", group: "create", icon: "video" },
  { id: "productData", group: "create", icon: "store" },
  { id: "presentation", group: "create", icon: "presentation" },
  { id: "skills", group: "organize", icon: "blocks" },
  { id: "mediaHistory", group: "organize", icon: "history" },
  { id: "renderQueue", group: "organize", icon: "activity" },
  { id: "library", group: "organize", icon: "library" },
  { id: "privateFiles", group: "organize", icon: "lock" },
  { id: "finance", group: "operate", icon: "wallet" },
  { id: "financeReports", group: "operate", icon: "chart" },
  { id: "credits", group: "operate", icon: "credit" },
];

export const HOME_PUBLIC_ASSETS = {
  hero: "/images/smartaihub-home-hero.webp",
  verticalSeries: "/images/smartaihub-vertical-series.webp",
  productReview: "/images/smartaihub-product-review-video.webp",
  chatSkills: "/images/smartaihub-chat-skills.webp",
  skillsLibrary: "/images/smartaihub-skills-library.webp",
  aiWorkHub: "/images/smartaihub-home-ai-work-hub.webp",
  marketplaceToContent: "/images/smartaihub-home-marketplace-to-content.webp",
  connectedEcosystem: "/images/smartaihub-home-connected-ecosystem.webp",
  harnessPlatform: "/images/smartaihub-domain-specific-harness.webp",
} as const;

export function getHomeFeatureTranslationKey(
  feature: HomeFeature,
  field: "title" | "description"
): string {
  return `feature.${feature.id}.${field}`;
}
