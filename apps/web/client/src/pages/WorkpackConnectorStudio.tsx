import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { WorkpackConnectorMatrix } from "@/components/workpack/WorkpackConnectorMatrix";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";
import type { ConnectorIntrospection } from "@shared/workpackContracts";

function buildIntrospectionTemplate(
  connectorMaps: Array<{ connectorFamily: string }>,
  introspections?: ConnectorIntrospection[],
): string {
  if ((introspections ?? []).length > 0) {
    const payload = Object.fromEntries((introspections ?? []).map((introspection) => [
      introspection.connectorFamily,
      {
        connectorKey: introspection.connectorKey,
        availableFields: introspection.availableFields,
        fieldTypes: introspection.fieldTypes,
        grantedScopes: introspection.grantedScopes,
        expiresAt: introspection.expiresAt,
        schemaVersion: introspection.schemaVersion,
        supportsIdempotency: introspection.supportsIdempotency,
        status: introspection.status,
        source: introspection.source,
        collectedAt: introspection.collectedAt,
        sourceDeviceId: introspection.sourceDeviceId,
      },
    ]));
    return JSON.stringify(payload, null, 2);
  }

  const payload = Object.fromEntries(connectorMaps.map((connectorMap) => [
    connectorMap.connectorFamily,
    {
      connectorKey: `${connectorMap.connectorFamily}_primary`,
      availableFields: ["record_id", "status", "summary"],
      fieldTypes: {
        record_id: "string",
        status: "string",
        summary: "string",
      },
      grantedScopes: [`${connectorMap.connectorFamily}:read`],
      supportsIdempotency: true,
      status: "healthy",
      source: "managed_runtime",
    },
  ]));
  return JSON.stringify(payload, null, 2);
}

export default function WorkpackConnectorStudio() {
  const utils = trpc.useUtils();
  const [, params] = useRoute("/workpacks/:workpackId/connectors");
  const workpackId = params?.workpackId ?? "";
  const detailQuery = trpc.workpack.getDetail.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const connectorQuery = trpc.workpack.connectors.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const [introspectionText, setIntrospectionText] = useState("{}");

  useEffect(() => {
    if (connectorQuery.data?.connectorMaps?.length) {
      setIntrospectionText(buildIntrospectionTemplate(
        connectorQuery.data.connectorMaps,
        connectorQuery.data.introspections,
      ));
    }
  }, [connectorQuery.data?.connectorMaps, connectorQuery.data?.introspections]);

  const refreshMutation = trpc.workpack.refreshConnectorIntrospections.useMutation({
    onSuccess: async () => {
      toast.success("Connector introspections refreshed");
      await Promise.all([
        utils.workpack.connectors.invalidate({ workpackId }),
        utils.workpack.getDetail.invalidate({ workpackId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const validateMutation = trpc.workpack.validateConnectors.useMutation({
    onSuccess: async () => {
      toast.success("Connector validation refreshed");
      await Promise.all([
        utils.workpack.connectors.invalidate({ workpackId }),
        utils.workpack.getDetail.invalidate({ workpackId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const discoverMutation = trpc.workpack.discoverConnectors.useMutation({
    onSuccess: async () => {
      toast.success("Connector discovery refreshed");
      await Promise.all([
        utils.workpack.connectors.invalidate({ workpackId }),
        utils.workpack.getDetail.invalidate({ workpackId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMapMutation = trpc.workpack.updateConnectorMap.useMutation({
    onSuccess: async () => {
      toast.success("Connector mapping saved");
      await Promise.all([
        utils.workpack.connectors.invalidate({ workpackId }),
        utils.workpack.getDetail.invalidate({ workpackId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (detailQuery.isLoading || connectorQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading connector posture...</div>;
  }

  if (!detailQuery.data || !connectorQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Connector studio is unavailable.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <WorkpackSummaryHeader
        workpackId={detailQuery.data.workpack.id}
        title={`${detailQuery.data.workpack.title} Connector Studio`}
        description="Field mappings, scope posture, introspection evidence, and side-effect boundaries"
        lifecycleState={detailQuery.data.workpack.lifecycleState}
        autonomyMode={detailQuery.data.workpack.autonomyMode}
        gateResult={detailQuery.data.readiness.gateResult}
        promotionState={detailQuery.data.workpack.promotionState}
        nextAction={detailQuery.data.readiness.nextAction}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <WorkpackConnectorMatrix
          connectorMaps={connectorQuery.data.connectorMaps}
          editable
          savingMapId={updateMapMutation.variables?.connectorMapId ?? null}
          onSave={(connectorMapId, input) => updateMapMutation.mutate({
            workpackId,
            connectorMapId,
            fieldMappings: input.fieldMappings,
            samplePayload: input.samplePayload,
          })}
        />

        <div className="space-y-6">
          <DashboardCard
            title="Auto Discovery & Manual Override"
            description="Auto-discover tenant-scoped connector evidence first, then patch or override metadata only when needed."
            trailing={(
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => discoverMutation.mutate({ workpackId })}
                  disabled={discoverMutation.isPending}
                >
                  {discoverMutation.isPending ? "Discovering..." : "Auto-discover"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => validateMutation.mutate({ workpackId })}
                  disabled={validateMutation.isPending}
                >
                  {validateMutation.isPending ? "Validating..." : "Revalidate"}
                </Button>
              </div>
            )}
          >
            <p className="mb-3 text-xs text-slate-500">
              Discovery can infer schema evidence from tenant-local workpack signals, but validation still fails closed until scopes and connector posture are strong enough.
            </p>
            <Textarea
              className="min-h-[240px] font-mono text-xs"
              value={introspectionText}
              onChange={(event) => setIntrospectionText(event.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() => {
                  try {
                    const metadataByFamily = JSON.parse(introspectionText) as Record<string, unknown>;
                    refreshMutation.mutate({
                      workpackId,
                      metadataByFamily: metadataByFamily as any,
                    });
                  } catch {
                    toast.error("Connector introspection JSON is invalid");
                  }
                }}
                disabled={refreshMutation.isPending}
              >
                {refreshMutation.isPending ? "Refreshing..." : "Apply manual override"}
              </Button>
            </div>
          </DashboardCard>

          <DashboardCard title="Latest Introspections" description="Tenant-local discovery evidence currently attached to this workpack">
            <div className="space-y-3">
              {(connectorQuery.data.introspections ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No live introspections attached yet.</p>
              ) : (
                (connectorQuery.data.introspections ?? []).map((introspection) => (
                  <div key={introspection.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">{introspection.connectorFamily}</h3>
                      <span className="text-xs text-slate-500">{introspection.status} • {introspection.source}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Scopes: {introspection.grantedScopes.join(", ") || "none"}</p>
                    <p className="mt-1 text-xs text-slate-500">Fields: {introspection.availableFields.join(", ") || "none"}</p>
                    <p className="mt-1 text-xs text-slate-500">Collected: {introspection.collectedAt}</p>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
