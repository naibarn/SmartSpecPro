export const SOCIAL_ACTIONS = [
  "read_inbox",
  "send_reply",
  "publish_post",
  "read_comments",
  "reply_comment",
] as const;

export type SocialAction = (typeof SOCIAL_ACTIONS)[number];
export type SocialProviderId = string;

export interface SocialBackgroundActionInput {
  provider?: SocialProviderId;
  action: SocialAction;
  tenantId: string;
  pageId: number;
  conversationId?: number;
  messageBody?: string;
  contentText?: string;
  contentLink?: string;
  mediaRefs?: string[];
  commentId?: number;
  query?: string;
}

export interface SocialProviderCapability {
  providerId: SocialProviderId;
  label: string;
  actions: SocialAction[];
  summary: string;
  status: "available" | "planned";
}

export interface SocialProviderAdapter {
  providerId: SocialProviderId;
  label: string;
  summary: string;
  actions: SocialAction[];
  status: "available" | "planned";
  execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>>;
}

export class SocialBackgroundError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SocialBackgroundError";
  }
}

const providerRegistry = new Map<string, SocialProviderAdapter>();

export function registerSocialProvider(adapter: SocialProviderAdapter): void {
  providerRegistry.set(adapter.providerId, adapter);
}

export function listSocialProviders(): SocialProviderCapability[] {
  return Array.from(providerRegistry.values()).map((provider) => ({
    providerId: provider.providerId,
    label: provider.label,
    summary: provider.summary,
    actions: [...provider.actions],
    status: provider.status,
  }));
}

export async function executeSocialAction(input: SocialBackgroundActionInput): Promise<Record<string, unknown>> {
  const providerId = (input.provider || "meta").trim().toLowerCase();
  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new SocialBackgroundError(501, `Social provider '${providerId}' is not registered yet`);
  }

  if (!provider.actions.includes(input.action)) {
    throw new SocialBackgroundError(400, `Action '${input.action}' is not supported by provider '${providerId}'`);
  }

  return provider.execute({ ...input, provider: providerId });
}
