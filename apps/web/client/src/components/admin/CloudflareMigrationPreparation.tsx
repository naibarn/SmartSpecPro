import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CloudflareImagePublication } from "./CloudflareImagePublication";
import { CloudflareTenantIsolation } from "./CloudflareTenantIsolation";

/** One Owner confirmation fans out to the EXISTING two scoped operations.
 * Each retains its own atomic/idempotent admission and canonical evidence.
 * No campaign scheduler, new grants, token impersonation or traffic activation. */
export function CloudflareMigrationPreparation({ tenantId, projectId, jobId, databaseAccepted = false }: { tenantId: string; projectId: string; jobId: string; databaseAccepted?: boolean }) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const scope = { tenantId, projectId }, databaseScope = { ...scope, jobId };
  const storageKey = `smartspec:cloudflare-image-pair:${tenantId}:${projectId}`;
  const [submission, setSubmission] = useState<{ id: string; digest: string } | null>(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      return /^[a-f0-9-]{36}$/.test(value?.id ?? "") && /^[a-f0-9]{64}$/.test(value?.digest ?? "") ? value : null;
    } catch { return null; }
  });
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  const database = trpc.infrastructure.getCloudflareProductionTenantIsolationPreflight.useQuery(databaseScope, { enabled: !databaseAccepted, retry: false, staleTime: 30_000 });
  const images = trpc.infrastructure.getCloudflareHttpImagePairPreflight.useQuery(scope, { retry: false, staleTime: 30_000 });
  const status = trpc.infrastructure.getCloudflareHttpImagePairSubmission.useQuery({ ...scope,
    ...(submission ? { submissionId: submission.id } : {}) }, { refetchInterval: 5000, retry: false });
  useEffect(() => {
    if (!submission && status.data?.submissionId && status.data.planDigest) {
      const retained = { id: status.data.submissionId, digest: status.data.planDigest };
      setSubmission(retained);
      try { sessionStorage.setItem(storageKey, JSON.stringify(retained)); } catch { /* Canonical registry remains authoritative. */ }
    }
  }, [submission, status.data]);
  const prepare = trpc.infrastructure.prepareCloudflareProductionTenantIsolation.useMutation();
  const publish = trpc.infrastructure.queueCloudflareHttpImagePair.useMutation();
  const imageAccepted = status.data?.jobs.length === 2 && status.data.jobs.every(job => job.status !== "NOT_ADMITTED");
  const canDatabase = !databaseAccepted && database.data?.ready && !database.data.prepared;
  const canImages = images.data?.ready && !imageAccepted && !status.isLoading && !status.error;
  const submit = async () => {
    if (inFlight.current || (!canDatabase && !canImages)) return;
    inFlight.current = true; setBusy(true);
    const operations: Promise<unknown>[] = [];
    // Independent paths proceed even if another prerequisite or operation fails.
    if (!databaseAccepted && database.data?.ready && !database.data.prepared) operations.push(prepare.mutateAsync({ ...databaseScope, actionDigest: database.data.actionDigest }));
    if (canImages && images.data?.ready) {
      const request = submission ?? { id: crypto.randomUUID(), digest: images.data.planDigest };
      try { sessionStorage.setItem(storageKey, JSON.stringify(request)); } catch { /* Canonical intent remains authoritative. */ }
      setSubmission(request);
      operations.push(publish.mutateAsync({ ...scope, submissionId: request.id, planDigest: request.digest }).then(result => {
        if (result?.submissionId && result.submissionId !== request.id) {
          const retained = { id: result.submissionId, digest: request.digest }; setSubmission(retained);
          try { sessionStorage.setItem(storageKey, JSON.stringify(retained)); } catch { /* Same canonical pair retained. */ }
        }
      }));
    }
    try { await Promise.allSettled(operations); }
    finally { inFlight.current = false; setBusy(false); void database.refetch(); void status.refetch(); }
  };
  return <VStack as="section" gap={3} aria-label={text("Remaining Cloudflare preparation", "เตรียมส่วนที่เหลือสำหรับ Cloudflare")}>
    <Heading level={3}>{text("Prepare the remaining database and application steps", "เตรียมฐานข้อมูลและแอปส่วนที่เหลือ")}</Heading>
    <Text>{text("Review the exact scopes below, then confirm once to run every ready preparation step. The accepted production ingress remains active until the new runtime passes acceptance.",
      "ตรวจขอบเขตด้านล่าง แล้วกดยืนยันครั้งเดียวเพื่อดำเนินทุกขั้นเตรียมที่พร้อม ทางเข้าระบบจริงเดิมยังทำงานจนกว่า runtime ใหม่จะผ่านการตรวจรับ")}</Text>
    {databaseAccepted ? <Text role="status">M1_ACCEPTED · {text("Cloudflare tenant isolation verified", "ตรวจยืนยันการแยก tenant จาก Cloudflare แล้ว")}</Text>
      : <CloudflareTenantIsolation {...databaseScope} hideAction />}
    <CloudflareImagePublication key={submission?.id ?? "new"} {...scope} hideAction />
    <Button type="button" disabled={busy || (!canDatabase && !canImages)} onClick={() => void submit()}>
      {busy ? text("Preparing the approved steps…", "กำลังดำเนินขั้นตอนที่ยืนยัน…")
        : text("Confirm database preparation and application publication", "ยืนยันเตรียมฐานข้อมูลและเผยแพร่แอป")}
    </Button>
    {prepare.error ? <Text role="alert">{prepare.error.message}</Text> : null}
    {publish.error ? <Text role="alert">{publish.error.message}</Text> : null}
  </VStack>;
}
