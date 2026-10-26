import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CloudflareNativeRuntimeOperation } from "./CloudflareNativeRuntimeOperation";

export function CloudflareNativeCandidatePreparation({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const runtimeActions: Record<string, string> = {
    APPLICATION_DATABASE_ROLE: "ระบบต้องเตรียม role ฐานข้อมูลสำหรับแอปแบบจำกัดสิทธิ์และระบุ table ที่ใช้ โดยรักษา role ของ Linux และ M1 เดิม",
    PRODUCTION_DATABASE_NETWORK: "ใช้ Tunnel/VPC เดิมผ่าน interface ภายในที่จำกัดปลายทาง โดยคง PostgreSQL TLS และ app role แยก ไม่ต้องสร้าง Access, DNS หรือ Hyperdrive เพิ่ม แต่ยังต้องตรวจจาก Container จริง",
    DATABASE_TRANSPORT_BINDING: "ระบบต้องผูก Tunnel เดิมกับ bridge ภายในและ startup contract ที่ตรวจแล้วกับ Candidate นี้ ก่อนเริ่มทดสอบ TLS/SQL จริงตามขอบเขตที่อนุมัติ",
    PRODUCTION_DATABASE_ACCESS_CONNECTOR: "เป็นทางเลือกที่ไม่ได้เลือกใช้ จึงไม่ต้องสร้าง Access application หรือ service token สำหรับเส้นทาง VPC นี้",
    PAIRED_RUNTIME_BINDINGS: "ระบบต้องผูก config และ secret ที่เข้ารหัส, role ฐานข้อมูล, CA สำหรับ verify-full และ profile ทดสอบที่มีอายุจำกัดกับ Candidate นี้",
    BOUNDED_RUNTIME_AUTHORITY: "คำอนุมัติเตรียม Candidate เดิมอนุญาตให้สร้างทรัพยากรเท่านั้น ขั้นทดสอบ runtime ต้องครอบคลุม role, connector, bindings, จำนวนครั้งเริ่ม Container และการคืนค่า ส่วนเปลี่ยน traffic จริงยังเป็นขั้นแยก",
    LIVE_RUNTIME_ACCEPTANCE: "หลังเริ่ม Container แบบจำกัด ต้องตรวจ Node/Python, SQL, API, login, ขอบเขต tenant, Gateway, billing, jobs และ rollback ด้วยข้อมูลทดสอบที่ได้รับอนุญาต",
  };
  const key = `smartspec:native-candidate:${tenantId}:${projectId}`;
  const [submission, setSubmission] = useState<{ id: string; digest: string; artifactRef?: string; workerSourceSha?: string } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const busy = useRef(false);
  const state = trpc.infrastructure.getCloudflareHttpCandidatePreparation.useQuery({ tenantId, projectId }, { refetchInterval: query => query.state.data?.job?.status === "succeeded" ? 30_000 : 5000 });
  const prepare = trpc.infrastructure.prepareCloudflareHttpCandidate.useMutation();
  const preflight = state.data?.preflight, job = state.data?.job;
  const runtime = trpc.infrastructure.getCloudflareHttpRuntimeReadiness.useQuery({ tenantId, projectId,
    jobId: job?.jobId ?? "00000000-0000-4000-8000-000000000000" }, { enabled: job?.status === "succeeded", refetchInterval: 30_000, retry: false });
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
    {job?.status !== "succeeded" && preflight?.ready ? <>
      <Text>{text("Published Pair: VERIFIED", "Published Pair: VERIFIED")} · {preflight.publishedPair?.submissionId}</Text>
      {preflight.publishedPair?.jobs.map(item => <Text key={item.jobId}>{item.runtime}: VERIFIED · {item.jobId}</Text>)}
      <Text>{preflight.plan.workerName}</Text>
      <Text>{text("Image source", "Source ของ image")}: {preflight.plan.imageSourceSha}</Text>
      {preflight.plan.images.map(image => <Text key={image}>{image}</Text>)}
    </> : job?.status !== "succeeded" && preflight ? <Text role="status">{preflight.reason}</Text> : null}
    {job?.status !== "succeeded" && preflight && !preflight.ready ? preflight.pairDiagnostics?.map(item => <Text key={`${item.submissionId}:${item.jobId ?? item.code}`} role="status">{item.submissionId} · {item.runtime} · {item.jobId} · {item.code}</Text>) : null}
    <Button type="button" disabled={state.isLoading || Boolean(state.error) || !preflight?.ready || prepare.isPending || Boolean(job)} onClick={() => void submit()}>
      {job ? text("Tracking canonical preparation job", "กำลังติดตามงานเตรียมเดิม") : prepare.isPending ? text("Submitting…", "กำลังส่งงาน…")
        : submission ? text("Reconcile the same preparation", "ตรวจและดำเนินคำขอเตรียมเดิม")
          : text("Prepare isolated Worker and Containers", "เตรียม Worker และ Container แยก")}
    </Button>
    {job ? <Text role="status">{job.jobId} · {job.status} · {job.attempt}/{job.maxAttempts}{job.errorCode ? ` · ${job.errorCode}` : ""}</Text> : null}
    {job?.status === "succeeded" ? <Text>{text("Worker and Container metadata prepared. Native application runtime acceptance is still pending.",
      "เตรียมข้อมูล Worker และ Container แล้ว ยังรอตรวจรับแอปที่รันบน Cloudflare จริง")}</Text> : null}
    {job?.status === "succeeded" ? <VStack as="section" gap={2} aria-label={text("Native runtime readiness", "ความพร้อม native runtime")}>
      <Heading level={4}>{text("Candidate resources and remaining runtime steps", "ทรัพยากร Candidate และขั้นตอน runtime ที่เหลือ")}</Heading>
      {runtime.isLoading ? <Text role="status">{text("Checking actual Cloudflare resources…", "กำลังอ่านทรัพยากรจริงจาก Cloudflare…")}</Text> : null}
      {runtime.data ? <>
        <Text>{runtime.data.metadata.workerName} · VERIFIED</Text>
        <Text>Deployment: {runtime.data.metadata.deploymentId}</Text>
        <Text>Version: {runtime.data.metadata.versionId}</Text>
        {runtime.data.databaseNetwork ? <Text>VPC: {runtime.data.databaseNetwork.vpcServiceId} · Hyperdrive: {runtime.data.databaseNetwork.hyperdriveId} · Tunnel: {runtime.data.databaseNetwork.tunnelId}</Text> : null}
        <VStack as="ul" gap={1}>{runtime.data.metadata.applications.map(app => <li key={app.applicationId}>
          {app.runtime}: {app.applicationId} · namespace {app.namespaceId} · VERIFIED
        </li>)}</VStack>
        <Text>{text("Runtime acceptance: NOT VERIFIED. Accepted production ingress and Linux fallback remain active.",
          "Runtime acceptance: ยังไม่ผ่านการตรวจรับ ทางเข้าระบบจริงและ Linux fallback ยังทำงานอยู่")}</Text>
        <VStack as="ul" gap={2}>{runtime.data.checks.map(check => <li key={check.code}>
          <Text>{check.code} · {check.status}{check.required === false ? text(" · OPTIONAL, not a blocker", " · ทางเลือก ไม่ขวางงานนี้") : ""}{check.http ? ` · HTTP ${check.http}` : ""}{check.providerCodes?.length ? ` · CF ${check.providerCodes.join(",")}` : ""}</Text>
          {check.permission ? <Text>{check.required === false ? text("Optional inspection permission", "สิทธิ์สำหรับตรวจทางเลือกเท่านั้น") : text("Required permission", "สิทธิ์ที่ต้องใช้")}: {check.permission} · <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Cloudflare API Tokens</a></Text> : null}
          <Text>{th && check.code === "PRODUCTION_DATABASE_DNS"
            ? "การอ่าน DNS เป็นข้อมูลทางเลือกเท่านั้น ใช้ DNS Read ก็เพียงพอ ไม่ต้องเพิ่ม DNS Edit เส้นทาง VPC ที่เลือกไม่ต้องเปลี่ยน DNS หรือเพิ่มสิทธิ์ token"
            : th ? runtimeActions[check.code] ?? check.nextAction : check.nextAction}</Text>
        </li>)}</VStack>
      </> : null}
      {runtime.error ? <Text role="alert">{runtime.error.message}</Text> : null}
    </VStack> : null}
    {job?.status === "succeeded" ? <CloudflareNativeRuntimeOperation tenantId={tenantId} projectId={projectId} candidateJobId={job.jobId} /> : null}
    {prepare.error ? <Text role="alert">{prepare.error.message}</Text> : null}
    {state.error ? <Text role="alert">{state.error.message}</Text> : null}
  </VStack>;
}
