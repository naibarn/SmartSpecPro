import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function CloudflareNativeCandidatePreparation({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const key = `smartspec:native-candidate:${tenantId}:${projectId}`;
  const [submission, setSubmission] = useState<{ id: string; digest: string; artifactRef?: string; workerSourceSha?: string } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const busy = useRef(false);
  const state = trpc.infrastructure.getCloudflareHttpCandidatePreparation.useQuery({ tenantId, projectId }, { refetchInterval: 5000 });
  const prepare = trpc.infrastructure.prepareCloudflareHttpCandidate.useMutation();
  const preflight = state.data?.preflight, job = state.data?.job;
  const submit = async () => {
    if (busy.current || job || !preflight?.ready) return;
    busy.current = true;
    const request = submission ?? { id: crypto.randomUUID(), digest: preflight.planDigest,
      artifactRef: preflight.plan.artifactRef, workerSourceSha: preflight.plan.workerSourceSha };
    setSubmission(request);
    try { sessionStorage.setItem(key, JSON.stringify(request)); } catch { /* Canonical intent is authoritative. */ }
    try { await prepare.mutateAsync({ tenantId, projectId, submissionId: request.id, planDigest: request.digest,
      artifactRef: request.artifactRef, workerSourceSha: request.workerSourceSha }); }
    catch { /* Display the precise error and reconcile the SAME submission. */ }
    finally { busy.current = false; void state.refetch(); }
  };
  return <VStack as="section" gap={3} aria-label={text("Isolated native candidate", "Native candidate แยกจากระบบจริง")}>
    <Heading level={3}>{text("Prepare isolated Production Worker and Containers", "เตรียม Worker และ Container แยกสำหรับ Production")}</Heading>
    <Text>{text("Uses the published Node/Python images and a separate Worker. This creates metadata only: no Container starts, database credentials, DNS changes or production traffic changes. Runtime acceptance and activation remain incomplete.",
      "ใช้ image Node/Python ที่เผยแพร่แล้วและ Worker คนละชื่อ ขั้นนี้สร้างข้อมูลทรัพยากรเท่านั้น ยังไม่เริ่ม Container ไม่ใส่ credential ฐานข้อมูล ไม่แก้ DNS และไม่เปลี่ยน traffic จริง การตรวจรับ runtime และ activation ยังไม่เสร็จ")}</Text>
    <Text>{text("DNS inventory permission is not required for this isolated preparation.", "การเตรียม candidate แยกนี้ไม่ต้องรอสิทธิ์อ่าน DNS")}</Text>
    {preflight?.ready ? <>
      <Text>{preflight.plan.workerName}</Text>
      <Text>{text("Image source", "Source ของ image")}: {preflight.plan.imageSourceSha}</Text>
      {preflight.plan.images.map(image => <Text key={image}>{image}</Text>)}
    </> : preflight ? <Text role="status">{preflight.reason}</Text> : null}
    <Button type="button" disabled={state.isLoading || Boolean(state.error) || !preflight?.ready || prepare.isPending || Boolean(job)} onClick={() => void submit()}>
      {job ? text("Tracking canonical preparation job", "กำลังติดตามงานเตรียมเดิม") : prepare.isPending ? text("Submitting…", "กำลังส่งงาน…")
        : submission ? text("Reconcile the same preparation", "ตรวจและดำเนินคำขอเตรียมเดิม")
          : text("Prepare isolated Worker and Containers", "เตรียม Worker และ Container แยก")}
    </Button>
    {job ? <Text role="status">{job.jobId} · {job.status} · {job.attempt}/{job.maxAttempts}{job.errorCode ? ` · ${job.errorCode}` : ""}</Text> : null}
    {job?.status === "succeeded" ? <Text>{text("Worker and Container metadata prepared. Native application runtime acceptance is still pending.",
      "เตรียมข้อมูล Worker และ Container แล้ว ยังรอตรวจรับแอปที่รันบน Cloudflare จริง")}</Text> : null}
    {prepare.error ? <Text role="alert">{prepare.error.message}</Text> : null}
    {state.error ? <Text role="alert">{state.error.message}</Text> : null}
  </VStack>;
}
