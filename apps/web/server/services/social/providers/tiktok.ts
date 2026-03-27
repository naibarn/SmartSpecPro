import { SocialBackgroundError, type SocialBackgroundActionInput, type SocialProviderAdapter } from "../providerRegistry";
import { loadPage, publishPost } from "../providerActions";

export const TIKTOK_SOCIAL_PROVIDER_SCAFFOLD = {
  providerId: "tiktok",
  label: "TikTok",
  summary: "Planned short-form social provider for background inbox, comment, and publishing actions.",
  status: "planned" as const,
  actions: [] as string[],
  notes: "Adapter stub only. Register a real provider implementation when TikTok support is added.",
};

export const TIKTOK_SOCIAL_PROVIDER_ADAPTER: SocialProviderAdapter = {
  providerId: "tiktok",
  label: "TikTok",
  summary: "Background TikTok publishing for short-form video workflows.",
  actions: ["publish_post"],
  status: "available",
  async execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>> {
    const page = await loadPage(input.tenantId, input.pageId);
    if (page.provider !== "tiktok") {
      throw new SocialBackgroundError(409, `Page is connected to '${page.provider}', not 'tiktok'`);
    }
    if (input.action !== "publish_post") {
      throw new SocialBackgroundError(400, `Action '${input.action}' is not supported by provider 'tiktok'`);
    }
    return publishPost(page, input.contentText, input.contentLink, input.mediaRefs);
  },
};
