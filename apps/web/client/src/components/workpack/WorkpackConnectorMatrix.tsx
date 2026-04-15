import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ConnectorMapItem = {
  id: string;
  connectorFamily: string;
  introspectionId?: string | null;
  validationStatus: string;
  scopePosture: string;
  requiredScopes: string[];
  grantedScopes: string[];
  missingFields: string[];
  driftedFields: string[];
  writeMode?: string;
  fieldMappings?: Array<{
    sourceField: string;
    targetField: string;
    required?: boolean;
    sideEffectClass?: string;
  }>;
  samplePayload?: Record<string, unknown>;
};

type WorkpackConnectorMatrixProps = {
  connectorMaps: ConnectorMapItem[];
  editable?: boolean;
  savingMapId?: string | null;
  onSave?: (connectorMapId: string, input: {
    fieldMappings: Array<{
      sourceField: string;
      targetField: string;
      required: boolean;
      sideEffectClass: "read_only" | "bounded_write" | "external_write" | "irreversible" | "financial" | "privileged";
    }>;
    samplePayload: Record<string, unknown>;
  }) => void;
};

function serializeMappings(connectorMap: ConnectorMapItem): string {
  return (connectorMap.fieldMappings ?? [])
    .map((mapping) => `${mapping.sourceField}->${mapping.targetField}|${mapping.required !== false ? "required" : "optional"}|${mapping.sideEffectClass ?? "read_only"}`)
    .join("\n");
}

function parseMappings(value: string): Array<{
  sourceField: string;
  targetField: string;
  required: boolean;
  sideEffectClass: "read_only" | "bounded_write" | "external_write" | "irreversible" | "financial" | "privileged";
}> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [mappingPair, requirement = "required", sideEffect = "read_only"] = line.split("|").map((part) => part.trim());
      const [sourceField = "", targetField = ""] = mappingPair.split("->").map((part) => part.trim());
      return {
        sourceField,
        targetField,
        required: requirement !== "optional",
        sideEffectClass: ([
          "read_only",
          "bounded_write",
          "external_write",
          "irreversible",
          "financial",
          "privileged",
        ].includes(sideEffect) ? sideEffect : "read_only") as "read_only" | "bounded_write" | "external_write" | "irreversible" | "financial" | "privileged",
      };
    })
    .filter((mapping) => mapping.sourceField && mapping.targetField);
}

export function WorkpackConnectorMatrix({
  connectorMaps,
  editable = false,
  savingMapId,
  onSave,
}: WorkpackConnectorMatrixProps) {
  const initialEditors = useMemo(() => Object.fromEntries(connectorMaps.map((connectorMap) => [
    connectorMap.id,
    {
      mappingText: serializeMappings(connectorMap),
      sampleText: JSON.stringify(connectorMap.samplePayload ?? {}, null, 2),
    },
  ])), [connectorMaps]);
  const [editors, setEditors] = useState(initialEditors);

  useEffect(() => {
    setEditors(initialEditors);
  }, [initialEditors]);

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
                {connectorMap.introspectionId ? <Badge variant="outline">introspection linked</Badge> : null}
                {connectorMap.writeMode ? <Badge variant="outline">{connectorMap.writeMode}</Badge> : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">Required scopes: {connectorMap.requiredScopes.join(", ") || "none"}</p>
              <p className="mt-1 text-xs text-slate-500">Granted scopes: {connectorMap.grantedScopes.join(", ") || "none"}</p>
              {connectorMap.fieldMappings?.length ? (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                  {connectorMap.fieldMappings.map((mapping, index) => (
                    <p key={`${connectorMap.id}-${index}`}>
                      {mapping.sourceField} {" -> "} {mapping.targetField} • {mapping.required === false ? "optional" : "required"} • {mapping.sideEffectClass ?? "read_only"}
                    </p>
                  ))}
                </div>
              ) : null}
              {connectorMap.missingFields.length > 0 ? (
                <p className="mt-2 text-sm text-rose-600">Missing fields: {connectorMap.missingFields.join(", ")}</p>
              ) : null}
              {connectorMap.driftedFields.length > 0 ? (
                <p className="mt-1 text-sm text-amber-600">Drifted fields: {connectorMap.driftedFields.join(", ")}</p>
              ) : null}
              {editable && onSave ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings</p>
                    <Textarea
                      className="mt-2 min-h-[120px] font-mono text-xs"
                      value={editors[connectorMap.id]?.mappingText ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEditors((current) => ({
                          ...current,
                          [connectorMap.id]: {
                            mappingText: value,
                            sampleText: current[connectorMap.id]?.sampleText ?? "{}",
                          },
                        }));
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-500">Format: source{" -> "}target|required|read_only per line.</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sample payload</p>
                    <Textarea
                      className="mt-2 min-h-[120px] font-mono text-xs"
                      value={editors[connectorMap.id]?.sampleText ?? "{}"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEditors((current) => ({
                          ...current,
                          [connectorMap.id]: {
                            mappingText: current[connectorMap.id]?.mappingText ?? "",
                            sampleText: value,
                          },
                        }));
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const mappingText = editors[connectorMap.id]?.mappingText ?? "";
                      const sampleText = editors[connectorMap.id]?.sampleText ?? "{}";
                      let samplePayload: Record<string, unknown> = {};
                      try {
                        samplePayload = JSON.parse(sampleText) as Record<string, unknown>;
                      } catch {
                        samplePayload = {};
                      }
                      onSave(connectorMap.id, {
                        fieldMappings: parseMappings(mappingText),
                        samplePayload,
                      });
                    }}
                    disabled={savingMapId === connectorMap.id}
                  >
                    {savingMapId === connectorMap.id ? "Saving..." : "Save mapping"}
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
