import { eq } from "drizzle-orm";

import { mediaProviders } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { decrypt } from "../crypto";
import { sanitizeProviderError } from "./voiceAgentSecurity";

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

export class ElevenLabsVoiceAgentProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async loadApiKey(providerName = "elevenlabs"): Promise<string> {
    const db = await getDb();
    const [row] = await db
      .select({
        apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
        hasApiKey: mediaProviders.hasApiKey,
        isEnabled: mediaProviders.isEnabled,
      })
      .from(mediaProviders)
      .where(eq(mediaProviders.providerName, providerName))
      .limit(1);

    if (!row?.isEnabled || !row.hasApiKey || !row.apiKeyEncrypted) {
      throw new Error("ElevenLabs provider credential is not configured");
    }

    const apiKey = decrypt(row.apiKeyEncrypted);
    if (!apiKey) {
      throw new Error("ElevenLabs provider credential could not be decrypted");
    }
    return apiKey;
  }

  async getConversationToken(input: {
    agentId: string;
    participantName?: string | null;
    credentialProviderName?: string;
  }): Promise<{ token: string }> {
    const apiKey = await this.loadApiKey(input.credentialProviderName);
    const url = new URL("/v1/convai/conversation/token", DEFAULT_BASE_URL);
    url.searchParams.set("agent_id", input.agentId);
    if (input.participantName) url.searchParams.set("participant_name", input.participantName);

    const response = await this.fetchImpl(url, { headers: { "xi-api-key": apiKey } });
    if (!response.ok) throw sanitizeProviderError({ status: response.status }, "ElevenLabs token request failed");
    const data = await response.json() as { token?: string };
    if (!data.token) throw new Error("ElevenLabs token response missing token");
    return { token: data.token };
  }

  async getSignedUrl(input: { agentId: string; credentialProviderName?: string }): Promise<{ signedUrl: string }> {
    const apiKey = await this.loadApiKey(input.credentialProviderName);
    const url = new URL("/v1/convai/conversation/get-signed-url", DEFAULT_BASE_URL);
    url.searchParams.set("agent_id", input.agentId);

    const response = await this.fetchImpl(url, { headers: { "xi-api-key": apiKey } });
    if (!response.ok) throw sanitizeProviderError({ status: response.status }, "ElevenLabs signed URL request failed");
    const data = await response.json() as { signed_url?: string };
    if (!data.signed_url) throw new Error("ElevenLabs signed URL response missing signed_url");
    return { signedUrl: data.signed_url };
  }

  async getConversationDetail(input: {
    providerConversationId: string;
    credentialProviderName?: string;
  }): Promise<Record<string, unknown>> {
    const apiKey = await this.loadApiKey(input.credentialProviderName);
    const response = await this.fetchImpl(
      new URL(`/v1/convai/conversations/${encodeURIComponent(input.providerConversationId)}`, DEFAULT_BASE_URL),
      { headers: { "xi-api-key": apiKey } },
    );
    if (!response.ok) throw sanitizeProviderError({ status: response.status }, "ElevenLabs conversation lookup failed");
    return response.json() as Promise<Record<string, unknown>>;
  }
}

export const elevenLabsVoiceAgentProvider = new ElevenLabsVoiceAgentProvider();
