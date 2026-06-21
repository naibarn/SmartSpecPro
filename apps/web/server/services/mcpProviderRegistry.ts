import { mcpProviderTemplates, type InsertMcpProviderTemplate } from "../../drizzle/schema";
import { sql } from "drizzle-orm";

export const MCP_PROVIDER_KEYS = ["magnific", "higgsfield"] as const;

export type McpProviderKey = typeof MCP_PROVIDER_KEYS[number];
export type McpAssetType = "image" | "video";

export interface McpProviderTemplateSeed {
  providerKey: McpProviderKey;
  displayName: string;
  mcpUrl: string;
  authType: "oauth";
  allowedAssetTypes: McpAssetType[];
  expectedToolHints: {
    image?: string[];
    video?: string[];
    status?: string[];
    cancel?: string[];
  };
  isEnabled: boolean;
}

export const MCP_PROVIDER_TEMPLATE_SEEDS: readonly McpProviderTemplateSeed[] = [
  {
    providerKey: "magnific",
    displayName: "Magnific",
    mcpUrl: "https://mcp.magnific.com",
    authType: "oauth",
    allowedAssetTypes: ["image", "video"],
    expectedToolHints: {
      image: ["images_generate"],
      video: ["video_generate"],
      status: ["creation_status", "creations_wait"],
    },
    isEnabled: true,
  },
  {
    providerKey: "higgsfield",
    displayName: "Higgsfield",
    mcpUrl: "https://mcp.higgsfield.ai/mcp",
    authType: "oauth",
    allowedAssetTypes: ["image", "video"],
    expectedToolHints: {
      image: ["generate_image"],
      video: ["generate_video"],
      status: ["job_status"],
    },
    isEnabled: true,
  },
] as const;

export function getMcpProviderTemplateSeed(providerKey: string): McpProviderTemplateSeed | undefined {
  return MCP_PROVIDER_TEMPLATE_SEEDS.find((template) => template.providerKey === providerKey);
}

export function buildMcpProviderTemplateInsert(
  template: McpProviderTemplateSeed,
): InsertMcpProviderTemplate {
  return {
    providerKey: template.providerKey,
    displayName: template.displayName,
    mcpUrl: template.mcpUrl,
    authType: template.authType,
    allowedAssetTypes: [...template.allowedAssetTypes],
    expectedToolHints: { ...template.expectedToolHints },
    isEnabled: template.isEnabled,
  };
}

export async function seedMcpProviderTemplates(
  db: {
    insert: (table: typeof mcpProviderTemplates) => {
      values: (values: InsertMcpProviderTemplate[]) => {
        onConflictDoUpdate: (args: {
          target: unknown;
          set: Partial<InsertMcpProviderTemplate>;
        }) => Promise<unknown>;
      };
    };
  },
): Promise<void> {
  const values = MCP_PROVIDER_TEMPLATE_SEEDS.map(buildMcpProviderTemplateInsert);

  await db
    .insert(mcpProviderTemplates)
    .values(values)
    .onConflictDoUpdate({
      target: mcpProviderTemplates.providerKey,
      set: {
        displayName: sql`excluded.display_name`,
        mcpUrl: sql`excluded.mcp_url`,
        authType: sql`excluded.auth_type`,
        allowedAssetTypes: sql`excluded.allowed_asset_types`,
        expectedToolHints: sql`excluded.expected_tool_hints`,
        isEnabled: sql`excluded.is_enabled`,
      } as unknown as Partial<InsertMcpProviderTemplate>,
    });
}
