/**
 * McpRegistryPicker — select an MCP server from the admin registry
 * for use in an mcp_server agency node.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plug, Loader2 } from "lucide-react";

interface McpRegistryPickerProps {
  serverSlug: string;
  toolName: string;
  onChange: (updates: { serverSlug?: string; serverUrl?: string; toolName?: string; transportType?: string }) => void;
}

export function McpRegistryPicker({ serverSlug, toolName, onChange }: McpRegistryPickerProps) {
  const serversQuery = trpc.mcpServers.list.useQuery(undefined, {
    staleTime: 30_000,
  });

  const servers = serversQuery.data ?? [];
  const selectedServer = servers.find((s) => s.slug === serverSlug);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
        <Plug className="h-3.5 w-3.5" />
        MCP Server (Registry)
      </div>

      {serversQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading servers...
        </div>
      ) : servers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No MCP servers configured. Go to Admin &gt; MCP Servers to add one.
        </p>
      ) : (
        <>
          <div>
            <Label className="text-xs">Server</Label>
            <Select
              value={serverSlug || ""}
              onValueChange={(slug) => {
                const s = servers.find((x) => x.slug === slug);
                onChange({
                  serverSlug: slug,
                  serverUrl: (s?.config as Record<string, unknown>)?.url as string ?? "",
                  transportType: s?.transportType ?? "http",
                });
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select MCP server..." />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {s.transportType}
                      </Badge>
                      {s.healthStatus === "healthy" && (
                        <Badge className="bg-green-100 text-green-700 text-[10px]">OK</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedServer && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{selectedServer.description || "No description"}</p>
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {selectedServer.transportType}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {selectedServer.healthStatus ?? "unknown"}
                </Badge>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Tool Name (optional)</Label>
            <Input
              value={toolName}
              onChange={(e) => onChange({ toolName: e.target.value })}
              placeholder="Leave empty to use all tools"
              className="text-sm"
              maxLength={200}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Specific tool name from this MCP server to call. Leave empty to let the agent choose.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
