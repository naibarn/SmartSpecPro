import { Badge } from "@/components/ui/badge";
import type { MediaTaskTransportMetadata } from "@shared/mcpConnectTypes";

export function McpCreditSourceBadge({ metadata }: { metadata?: Partial<MediaTaskTransportMetadata> | null }) {
  if (metadata?.transport === "mcp") {
    return <Badge variant="outline">{metadata.providerDisplayName ?? metadata.providerKey ?? "Provider"} account credits</Badge>;
  }
  return <Badge variant="secondary">SmartSpecPro credits</Badge>;
}
