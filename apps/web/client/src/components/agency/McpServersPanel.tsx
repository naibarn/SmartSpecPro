/**
 * McpServersPanel — manage MCP server connections per agent.
 *
 * Rendered as a tab in NodePropertyPanel for agent/supervisor nodes.
 * Allows adding, removing, discovering tools from external MCP servers.
 */

import React, { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, Search, Loader2, Server, ChevronDown, ChevronRight, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface McpServer {
  url: string;
  name?: string;
  transport?: "http" | "sse";
}

interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpServersPanelProps {
  agentId: string;
  mcpServers?: McpServer[];
  onChange: (servers: McpServer[], tokens?: Record<string, string>) => void;
}

const MAX_SERVERS = 5;

export function McpServersPanel({ agentId, mcpServers = [], onChange }: McpServersPanelProps) {
  const mcpEnabled = useTenantFeatureFlag("agencyMcpBridge");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = useState<Record<string, DiscoveredTool[]>>({});
  const [discoveringUrl, setDiscoveringUrl] = useState<string | null>(null);

  const saveMutation = trpc.agency.saveMcpServers.useMutation();
  const utils = trpc.useUtils();

  const handleAddServer = useCallback(() => {
    if (!newUrl.trim()) return;
    const server: McpServer = {
      url: newUrl.trim(),
      name: newName.trim() || undefined,
      transport: "http",
    };
    const updated = [...mcpServers, server];
    const updatedTokens = { ...tokens };
    if (newToken.trim()) {
      updatedTokens[newUrl.trim()] = newToken.trim();
    }
    setTokens(updatedTokens);
    onChange(updated, updatedTokens);
    setNewUrl("");
    setNewName("");
    setNewToken("");
    setShowAddForm(false);
  }, [newUrl, newName, newToken, mcpServers, tokens, onChange]);

  const handleRemoveServer = useCallback(
    (url: string) => {
      const updated = mcpServers.filter((s) => s.url !== url);
      const updatedTokens = { ...tokens };
      delete updatedTokens[url];
      setTokens(updatedTokens);
      onChange(updated, updatedTokens);
    },
    [mcpServers, tokens, onChange],
  );

  const handleDiscover = useCallback(
    async (serverUrl: string) => {
      setDiscoveringUrl(serverUrl);
      try {
        const result = await utils.agency.discoverMcpTools.fetch({
          serverUrl,
          token: tokens[serverUrl],
        });
        setDiscoveredTools((prev) => ({ ...prev, [serverUrl]: result.tools }));
        setExpandedServer(serverUrl);
      } catch {
        // Error shown via TanStack Query error handling
      } finally {
        setDiscoveringUrl(null);
      }
    },
    [tokens],
  );

  const handleSave = useCallback(async () => {
    await saveMutation.mutateAsync({
      agentId,
      mcpServers: mcpServers.map((s) => ({
        url: s.url,
        name: s.name,
        transport: s.transport ?? "http",
      })),
      tokens: Object.keys(tokens).length > 0 ? tokens : undefined,
    });
  }, [agentId, mcpServers, tokens, saveMutation]);

  if (!mcpEnabled) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-center">
          MCP integration is not enabled for this tenant.
          Contact your administrator to enable the AGENCY_MCP_BRIDGE_ENABLED feature flag.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">MCP Servers</Label>
        <Badge variant="secondary" className="text-xs">
          {mcpServers.length}/{MAX_SERVERS}
        </Badge>
      </div>

      <ScrollArea className="max-h-[400px]">
        {mcpServers.map((server) => (
          <div key={server.url} className="border rounded-md p-2 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {server.name || new URL(server.url).hostname}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {tokens[server.url] && (
                  <span title="Token configured"><Lock className="h-3 w-3 text-green-500" /></span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDiscover(server.url)}
                  disabled={discoveringUrl === server.url}
                >
                  {discoveringUrl === server.url ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleRemoveServer(server.url)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Discovered tools */}
            {discoveredTools[server.url] && (
              <div className="mt-2">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setExpandedServer(expandedServer === server.url ? null : server.url)
                  }
                >
                  {expandedServer === server.url ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {discoveredTools[server.url].length} tools discovered
                </button>
                {expandedServer === server.url && (
                  <div className="mt-1 space-y-1 pl-4">
                    {discoveredTools[server.url].map((tool) => (
                      <div key={tool.name} className="text-xs">
                        <span className="font-mono text-primary">{tool.name}</span>
                        {tool.description && (
                          <span className="text-muted-foreground ml-1">— {tool.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </ScrollArea>

      {/* Add form */}
      {showAddForm ? (
        <div className="border rounded-md p-2 space-y-2">
          <Input
            placeholder="https://mcp-server.example.com"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="text-sm"
          />
          <Input
            placeholder="Server name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="text-sm"
          />
          <Input
            type="password"
            placeholder="Bearer token (optional)"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddServer} disabled={!newUrl.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={mcpServers.length >= MAX_SERVERS}
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add MCP Server
        </Button>
      )}

      {/* Save button */}
      {mcpServers.length > 0 && (
        <>
          <Separator />
          <Button
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : null}
            Save MCP Configuration
          </Button>
        </>
      )}
    </div>
  );
}
