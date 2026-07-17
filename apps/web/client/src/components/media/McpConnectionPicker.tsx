import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export function McpConnectionPicker({
  value,
  sharedGroupId,
  onChange,
  onSharedGroupChange,
  assetType,
  providerKey,
}: {
  value: string | null;
  sharedGroupId?: number | null;
  onChange: (connectionId: string | null) => void;
  onSharedGroupChange?: (groupId: number | null) => void;
  assetType: "image" | "video";
  providerKey?: string | null;
}) {
  const connections = trpc.mcpConnections.listConnections.useQuery(undefined, { retry: false });
  const eligible = (connections.data ?? []).filter((connection) => (
    connection.status === "connected" &&
    (!providerKey || connection.providerKey === providerKey) &&
    (!connection.allowedAssetTypes?.length || connection.allowedAssetTypes.includes(assetType))
  ));
  // Resolve the currently-selected connection by id first. Only disambiguate by
  // group when the parent actually tracks sharedGroupId (some VD surfaces don't
  // pass onSharedGroupChange, in which case a plain id match is all we have).
  const tracksGroup = typeof onSharedGroupChange === "function";
  const idMatches = value ? eligible.filter((connection) => connection.id === value) : [];
  const resolvedConnection = tracksGroup
    ? (idMatches.find((connection) => (connection.sharedGroupId ?? null) === (sharedGroupId ?? null)) ?? idMatches[0])
    : idMatches[0];
  const selectedValue = resolvedConnection
    ? `${resolvedConnection.id}:${resolvedConnection.sharedGroupId ?? "personal"}`
    : "";
  useEffect(() => {
    if (!value && !connections.isLoading && eligible.length === 1) {
      onChange(eligible[0].id);
      onSharedGroupChange?.(eligible[0].sharedGroupId ?? null);
      return;
    }
    if (!value || connections.isLoading) return;
    if (!resolvedConnection) {
      onChange(null);
      onSharedGroupChange?.(null);
      return;
    }
    // Keep the parent's tracked sharedGroupId in sync with the resolved
    // connection (covers restore-from-localStorage and manual selection).
    if (tracksGroup && (sharedGroupId ?? null) !== (resolvedConnection.sharedGroupId ?? null)) {
      onSharedGroupChange?.(resolvedConnection.sharedGroupId ?? null);
    }
  }, [
    connections.isLoading,
    eligible,
    onChange,
    onSharedGroupChange,
    resolvedConnection,
    sharedGroupId,
    tracksGroup,
    value,
  ]);

  const handleChange = (optionValue: string) => {
    const selected = eligible.find((connection) => (
      `${connection.id}:${connection.sharedGroupId ?? "personal"}` === optionValue
    ));
    onChange(selected?.id ?? null);
    onSharedGroupChange?.(selected?.sharedGroupId ?? null);
  };
  return (
    <div className="space-y-2">
      <Label>MCP account</Label>
      {eligible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-gray-500">
          No eligible MCP connection for {providerKey ?? "this provider"} {assetType}.
          <Link href="/settings?tab=integrations">
            <Button type="button" variant="link" className="ml-1 h-auto p-0">Connect account</Button>
          </Link>
        </div>
      ) : (
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={selectedValue}
          onChange={(event) => handleChange(event.target.value)}
        >
          <option value="">Select MCP account</option>
          {eligible.map((connection) => (
            <option
              key={`${connection.id}-${connection.sharedGroupId ?? "personal"}`}
              value={`${connection.id}:${connection.sharedGroupId ?? "personal"}`}
            >
              {connection.providerDisplayName} - {connection.providerAccountLabel ?? connection.displayName}
              {connection.connectionScope === "shared" ? " (Shared)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
