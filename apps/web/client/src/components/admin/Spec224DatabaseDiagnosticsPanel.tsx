import { Database, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { trpc } from "../../lib/trpc";

type Props = { isThai: boolean };

export default function Spec224DatabaseDiagnosticsPanel({ isThai }: Props) {
  const diagnostics =
    trpc.infrastructure.getSpec224DatabaseDiagnostics.useQuery(undefined, {
      enabled: false,
      retry: false,
    });
  const value = diagnostics.data;
  const unknown = isThai ? "ไม่ทราบ" : "Unknown";
  const label = (thai: string, english: string) => (isThai ? thai : english);

  return (
    <DashboardCard
      as="section"
      title={label(
        "ข้อมูลระบุตัวตนฐานข้อมูล SPEC-224",
        "SPEC-224 Database Identity"
      )}
      description={label(
        "อ่านข้อมูลจาก Backend และฐานข้อมูลที่ Admin session นี้เชื่อมต่ออยู่ โดยไม่แสดง connection string หรือ credentials",
        "Read-only evidence from the backend and database serving this Admin session. Connection strings and credentials are never returned."
      )}
      leading={<Database />}
      trailing={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void diagnostics.refetch();
          }}
          disabled={diagnostics.isFetching}
        >
          {diagnostics.isFetching ? <Loader2 /> : <RefreshCw />}
          {label("เก็บหลักฐาน", "Collect evidence")}
        </Button>
      }
    >
      <VStack as="section" gap={4} padding={5}>
        {diagnostics.isError && (
          <p role="alert">
            {label(
              "อ่านข้อมูลไม่ได้ ตรวจสิทธิ์ Admin และลองอีกครั้ง",
              "Unable to read diagnostics. Verify Admin access and retry."
            )}
          </p>
        )}
        {value && (
          <VStack gap={4}>
            <VStack as="section" gap={2}>
              <h4>{label("Backend", "Backend")}</h4>
              <VStack as="dl" gap={2}>
                <dt>{label("Environment", "Environment")}</dt>
                <dd>{value.backend.environment}</dd>
                <dt>{label("Revision", "Revision")}</dt>
                <dd>{value.backend.runtimeRevision ?? unknown}</dd>
                <dt>{label("Instance", "Instance")}</dt>
                <dd>{value.backend.instanceId}</dd>
              </VStack>
            </VStack>
            <VStack as="section" gap={2}>
              <h4>{label("ฐานข้อมูล", "Database")}</h4>
              <VStack as="dl" gap={2}>
                <dt>{label("ชื่อ / Schema / Role", "Name / Schema / Role")}</dt>
                <dd>
                  {value.database.name ?? unknown} /{" "}
                  {value.database.schema ?? unknown} /{" "}
                  {value.database.effectiveRole ?? unknown}
                </dd>
                <dt>{label("Instance fingerprint", "Instance fingerprint")}</dt>
                <dd>
                  <code>{value.database.instanceFingerprint}</code>
                </dd>
              </VStack>
            </VStack>
            <VStack as="section" gap={2}>
              <h4>{label("Migration ledger", "Migration ledger")}</h4>
              <p>
                {label("สถานะ", "Status")}: {value.migrationLedger.status} ·{" "}
                {value.migrationLedger.currentState}; 0395:{" "}
                {value.migrationLedger.target0395};{label("ค้าง", "pending")}:{" "}
                {value.migrationLedger.pendingCount ?? unknown};
                {label(" unknown", " unknown")}:{" "}
                {value.migrationLedger.unknownAppliedCount ?? unknown};
                {label(" reconcile", " reconcile")}:{" "}
                {value.migrationLedger.reconciliationState};
                {label(
                  " active migration candidates",
                  " active migration candidates"
                )}
                : {value.migrationConcurrency.activeCandidates ?? unknown} (
                {value.migrationConcurrency.status})
              </p>
              <p>
                worker_runtime_type:{" "}
                {value.workerRuntimeType.exists
                  ? value.workerRuntimeType.labels.join(", ")
                  : label("ไม่พบ enum", "enum not found")}
              </p>
            </VStack>
            <VStack as="section" gap={2}>
              <h4>
                {label(
                  "Run creation error ล่าสุด",
                  "Latest run creation error"
                )}
              </h4>
              {value.runCreationErrorCorrelation ? (
                <VStack as="dl" gap={2}>
                  <dt>Trace / Run / Error</dt>
                  <dd>
                    <code>
                      {value.runCreationErrorCorrelation.traceId} /{" "}
                      {value.runCreationErrorCorrelation.runId ?? unknown} /{" "}
                      {value.runCreationErrorCorrelation.errorCode ?? unknown}
                    </code>
                  </dd>
                  <dt>
                    {label(
                      "Backend instance correlation",
                      "Backend instance correlation"
                    )}
                  </dt>
                  <dd>
                    {value.runCreationErrorCorrelation.instanceCorrelation}:{" "}
                    {value.runCreationErrorCorrelation.backendInstanceId ??
                      label("ไม่มีใน audit เดิม", "not recorded in this audit")}
                  </dd>
                  <dt>{label("เวลา", "Observed at")}</dt>
                  <dd>
                    {new Date(
                      value.runCreationErrorCorrelation.observedAt
                    ).toLocaleString()}
                  </dd>
                </VStack>
              ) : (
                <p>
                  {value.runCreationErrorCorrelationStatus === "OBSERVED"
                    ? label(
                        "ไม่พบ failure audit ที่ตรงเงื่อนไข",
                        "No matching failed run audit found"
                      )
                    : `${label("อ่าน failure audit ไม่ได้", "Failure audit unavailable")}: ${value.runCreationErrorCorrelationStatus}`}
                </p>
              )}
            </VStack>
            <HStack as="footer" justify="between" wrap="wrap" gap={2}>
              <p>
                {label("เก็บเมื่อ", "Collected")}:{" "}
                {new Date(value.observedAt).toLocaleString()}
              </p>
              <p>
                {label(
                  "ใช้ trace ID ค้นหา request ใน Backend logs",
                  "Use the trace ID to locate the request in backend logs"
                )}
              </p>
            </HStack>
          </VStack>
        )}
      </VStack>
    </DashboardCard>
  );
}
