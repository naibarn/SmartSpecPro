import {
  refreshMcpMediaTaskStatus,
  submitMcpMediaGeneration,
} from "../server/services/mcpMediaAdapter";
import { getDb } from "../server/db";
import {
  mcpProviderTemplates,
  userMcpConnections,
} from "../drizzle/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { MediaTaskTransportMetadata } from "../shared/mcpConnectTypes";

type ProviderKey = "magnific" | "higgsfield";

const PROVIDERS: Array<{
  providerKey: ProviderKey;
  model: string;
  providerModelId: string;
  toolName: string;
  argumentShape: string;
}> = [
  {
    providerKey: "magnific",
    model: "magnific-mcp/gpt-2",
    providerModelId: "gpt-2",
    toolName: "images_generate",
    argumentShape: "magnific.images_generate",
  },
  {
    providerKey: "higgsfield",
    model: "higgsfield/z_image",
    providerModelId: "z_image",
    toolName: "generate_image",
    argumentShape: "higgsfield.generate_image",
  },
];

async function findConnection(providerKey: ProviderKey) {
  const db = getDb();
  const [row] = await db
    .select({ connection: userMcpConnections, template: mcpProviderTemplates })
    .from(userMcpConnections)
    .innerJoin(mcpProviderTemplates, eq(userMcpConnections.providerTemplateId, mcpProviderTemplates.id))
    .where(and(
      eq(mcpProviderTemplates.providerKey, providerKey),
      eq(userMcpConnections.status, "connected"),
      isNull(userMcpConnections.revokedAt),
    ))
    .orderBy(desc(userMcpConnections.updatedAt))
    .limit(1);
  if (!row) throw new Error(`No connected ${providerKey} MCP account found`);
  return row;
}

async function smokeProvider(provider: typeof PROVIDERS[number]) {
  const { connection, template } = await findConnection(provider.providerKey);
  const idempotencyKey = `mcp-smoke-${provider.providerKey}-${Date.now()}`;
  const metadata: MediaTaskTransportMetadata = {
    transport: "mcp",
    originSurface: "media_studio",
    assetType: "image",
    tenantId: connection.tenantId,
    actorUserId: connection.ownerUserId,
    ownerUserId: connection.ownerUserId,
    connectionId: connection.id,
    connectionScope: "personal",
    providerKey: provider.providerKey,
    providerDisplayName: template.displayName,
    providerModelId: provider.providerModelId,
    toolName: provider.toolName,
    argumentShape: provider.argumentShape,
    creditPolicy: "provider_credits_tracked",
    idempotencyKey,
  };
  const task = await submitMcpMediaGeneration({
    tenantId: connection.tenantId,
    prompt: `SmartSpec MCP smoke test image for ${provider.providerKey}: a tiny blue square on a white background, simple diagnostic.`,
    model: provider.model,
    metadata,
    parameters: {
      aspectRatio: "1:1",
      resolution: "1k",
      numImages: 1,
    },
  });
  let current = task;
  for (let i = 0; i < 30; i += 1) {
    current = await refreshMcpMediaTaskStatus(current);
    const resultUrl = typeof current.resultData?.resultUrl === "string"
      ? current.resultData.resultUrl
      : undefined;
    if (current.status === "completed" && resultUrl) {
      return {
        providerKey: provider.providerKey,
        taskId: current.id,
        providerTaskId: current.taskId,
        status: current.status,
        resultUrl,
      };
    }
    if (current.status === "failed") {
      return {
        providerKey: provider.providerKey,
        taskId: current.id,
        providerTaskId: current.taskId,
        status: current.status,
        errorMessage: current.errorMessage,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return {
    providerKey: provider.providerKey,
    taskId: current.id,
    providerTaskId: current.taskId,
    status: current.status,
    resultUrl: current.resultData?.resultUrl,
  };
}

async function main() {
  const requested = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("--")));
  const providers = requested.size > 0
    ? PROVIDERS.filter((provider) => requested.has(provider.providerKey))
    : PROVIDERS;
  const results = [];
  for (const provider of providers) {
    results.push(await smokeProvider(provider));
  }
  console.log(JSON.stringify(results, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
