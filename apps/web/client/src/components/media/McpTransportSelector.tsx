import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { MediaTransport } from "@shared/mcpConnectTypes";

export function McpTransportSelector({
  value,
  onChange,
  disabled,
}: {
  value: MediaTransport;
  onChange: (value: MediaTransport) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Generation transport</Label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={value === "gateway_api" ? "default" : "outline"} disabled={disabled} onClick={() => onChange("gateway_api")}>
          Gateway API
        </Button>
        <Button type="button" size="sm" variant={value === "mcp" ? "default" : "outline"} disabled={disabled} onClick={() => onChange("mcp")}>
          MCP Connect
        </Button>
        <Badge variant="outline">{value === "mcp" ? "Provider account credits" : "SmartSpecPro credits"}</Badge>
      </div>
    </div>
  );
}
