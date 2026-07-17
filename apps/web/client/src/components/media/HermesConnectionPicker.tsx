/**
 * Feature 135 (Hermes/Grok media worker) — per-generation connection
 * selector. Mirrors `McpConnectionPicker.tsx`'s shape (query, auto-select,
 * stale-value clearing, empty state) but is simpler: a Hermes connection has
 * no `sharedGroupId` dimension, so the option value is just `connection.id`.
 *
 * Eligibility (spec §11.3 / section-10 §4.1): a connection is selectable for
 * generation only when `status === "authorized"` AND its capability summary
 * enables the requested `assetType` AND its assigned worker is online.
 * Connections that are default-eligible server-side but not job-eligible
 * (`reauth_required`, `entitlement_restricted`, or an otherwise-capable
 * connection whose worker is offline) render as disabled options with a
 * reason suffix — informative, never selectable. Every other status
 * (`pending`, `disconnected`, `error`) is hidden entirely.
 */
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { hermesErrorCopy } from "@shared/hermesMedia";

type HermesAssetType = "image" | "video";

/** Deliberately duplicated (not imported from `server/`) — this is a client
 *  file and must not depend on server modules; the shape mirrors
 *  `SafeHermesConnection` from `server/services/hermesConnectionService.ts`
 *  byte-for-byte for the fields this picker actually reads. */
export interface HermesConnectionPickerRow {
  id: string;
  scope: "server_shared" | "server_personal" | "private_worker";
  status: string;
  accountLabel: string | null;
  accountHint: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  assignedWorkerOnline: boolean;
  capabilitySummary: {
    imageEnabled: boolean;
    videoEnabled: boolean;
  };
}

/** Scope badge copy (section-03 note, pinned Thai strings). */
const HERMES_SCOPE_LABEL: Record<HermesConnectionPickerRow["scope"], string> = {
  server_shared: "ส่วนกลาง",
  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์",
  private_worker: "เครื่องของฉัน",
};

function capabilityEnabledFor(
  connection: HermesConnectionPickerRow,
  assetType: HermesAssetType,
): boolean {
  return assetType === "image"
    ? connection.capabilitySummary.imageEnabled
    : connection.capabilitySummary.videoEnabled;
}

function isJobEligible(
  connection: HermesConnectionPickerRow,
  assetType: HermesAssetType,
): boolean {
  return (
    connection.status === "authorized" &&
    capabilityEnabledFor(connection, assetType) &&
    connection.assignedWorkerOnline
  );
}

/** Reason suffix for a disabled-but-informative row, or `null` when the row
 *  should be hidden entirely (not eligible and not informative). */
function disabledReasonFor(
  connection: HermesConnectionPickerRow,
  assetType: HermesAssetType,
): string | null {
  if (connection.status === "reauth_required") {
    return hermesErrorCopy("HERMES_REAUTH_REQUIRED").th;
  }
  if (connection.status === "entitlement_restricted") {
    return hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th;
  }
  if (
    connection.status === "authorized" &&
    capabilityEnabledFor(connection, assetType) &&
    !connection.assignedWorkerOnline
  ) {
    return connection.scope === "private_worker"
      ? "Worker ออฟไลน์ — เปิด Worker App บนเครื่องนี้ก่อน"
      : "Worker ออฟไลน์ในขณะนี้";
  }
  return null;
}

export function HermesConnectionPicker({
  value,
  onChange,
  assetType,
}: {
  value: string | null;
  onChange: (connectionId: string | null) => void;
  assetType: HermesAssetType;
}) {
  const connections = trpc.hermesConnections.listConnections.useQuery(
    { assetType },
    { retry: false },
  );
  const rows = (connections.data ?? []) as HermesConnectionPickerRow[];
  const eligible = rows.filter((connection) => isJobEligible(connection, assetType));
  const informative = rows.filter(
    (connection) =>
      !isJobEligible(connection, assetType) && disabledReasonFor(connection, assetType) !== null,
  );

  useEffect(() => {
    if (connections.isLoading) return;
    if (!value) {
      if (eligible.length === 1) {
        onChange(eligible[0].id);
        return;
      }
      if (eligible.length > 1) {
        // One-line refinement over the MCP picker: prefer the row already
        // marked as this user's default for the requested asset type,
        // rather than leaving the selection empty among ties.
        const preferred = eligible.find((connection) =>
          assetType === "image" ? connection.defaultForImage : connection.defaultForVideo,
        );
        if (preferred) onChange(preferred.id);
      }
      return;
    }
    const stillEligible = eligible.some((connection) => connection.id === value);
    if (!stillEligible) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.isLoading, eligible, value, onChange, assetType]);

  const handleChange = (optionValue: string) => {
    if (!optionValue) {
      onChange(null);
      return;
    }
    // Defense in depth: a disabled/informative `<option>` cannot be picked by
    // a real user, but guard here too so a test/programmatic change event can
    // never report a non-eligible connection as selected.
    const isSelectable = eligible.some((connection) => connection.id === optionValue);
    if (!isSelectable) return;
    onChange(optionValue);
  };

  return (
    <div className="space-y-2">
      <Label>บัญชี Grok (Hermes)</Label>
      {eligible.length === 0 && informative.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-gray-500">
          ยังไม่มีบัญชี Grok ที่เชื่อมต่อสำหรับ
          {assetType === "image" ? "การสร้างภาพ" : "การสร้างวิดีโอ"}
          <Link href="/settings?tab=integrations">
            <Button type="button" variant="link" className="ml-1 h-auto p-0">
              เชื่อมต่อบัญชี Grok
            </Button>
          </Link>
        </div>
      ) : (
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={value ?? ""}
          onChange={(event) => handleChange(event.target.value)}
        >
          <option value="">เลือกบัญชี Grok</option>
          {eligible.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {(connection.accountLabel ?? connection.accountHint ?? connection.id)}
              {" · "}
              {HERMES_SCOPE_LABEL[connection.scope]}
            </option>
          ))}
          {informative.map((connection) => (
            <option key={connection.id} value={connection.id} disabled>
              {(connection.accountLabel ?? connection.accountHint ?? connection.id)}
              {" · "}
              {HERMES_SCOPE_LABEL[connection.scope]}
              {" — "}
              {disabledReasonFor(connection, assetType)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
