import { SocialBackgroundError, type SocialBackgroundActionInput, type SocialProviderAdapter } from "../providerRegistry";
import { loadPage, publishPost } from "../providerActions";

export const YOUTUBE_SOCIAL_PROVIDER_SCAFFOLD = {
  providerId: "youtube",
  label: "YouTube",
  summary: "Planned video and community provider for background moderation and publishing actions.",
  status: "planned" as const,
  actions: [] as string[],
  notes: "Adapter stub only. Register a real provider implementation when YouTube support is added.",
};

export const YOUTUBE_SOCIAL_PROVIDER_ADAPTER: SocialProviderAdapter = {
  providerId: "youtube",
  label: "YouTube",
  summary: "Background YouTube publishing for long-form and Shorts workflows.",
  actions: ["publish_post"],
  status: "available",
  async execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>> {
    const page = await loadPage(input.tenantId, input.pageId);
    if (page.provider !== "youtube") {
      throw new SocialBackgroundError(409, `Page is connected to '${page.provider}', not 'youtube'`);
    }
    if (input.action !== "publish_post") {
      throw new SocialBackgroundError(400, `Action '${input.action}' is not supported by provider 'youtube'`);
    }
    return publishPost(page, input.contentText, input.contentLink, input.mediaRefs);
  },
};
