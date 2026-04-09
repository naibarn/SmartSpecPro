import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";

type ConnectorMapItem = {
  id: string;
  connectorFamily: string;
  validationStatus: string;
  scopePosture: string;
  requiredScopes: string[];
  grantedScopes: string[];
  missingFields: string[];
  driftedFields: string[];
};

type WorkpackConnectorMatrixProps = {
  connectorMaps: ConnectorMapItem[];
};

export function WorkpackConnectorMatrix({ connectorMaps }: WorkpackConnectorMatrixProps) {
  return (
    <DashboardCard
      title="Connector Matrix"
      description="Mapping state, scope posture, and validation outcomes"
    >
      <div className="space-y-3">
        {connectorMaps.length === 0 ? (
          <p className="text-sm text-slate-500">No connector mappings required for this workpack.</p>
        ) : (
          connectorMaps.map((connectorMap) => (
            <div key={connectorMap.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-900">{connectorMap.connectorFamily}</h4>
                <Badge variant="outline">{connectorMap.validationStatus}</Badge>
                <Badge variant="outline">{connectorMap.scopePosture}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">Required scopes: {connectorMap.requiredScopes.join(", ") || "none"}</p>
              <p className="mt-1 text-xs text-slate-500">Granted scopes: {connectorMap.grantedScopes.join(", ") || "none"}</p>
              {connectorMap.missingFields.length > 0 ? (
                <p className="mt-2 text-sm text-rose-600">Missing fields: {connectorMap.missingFields.join(", ")}</p>
              ) : null}
              {connectorMap.driftedFields.length > 0 ? (
                <p className="mt-1 text-sm text-amber-600">Drifted fields: {connectorMap.driftedFields.join(", ")}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
