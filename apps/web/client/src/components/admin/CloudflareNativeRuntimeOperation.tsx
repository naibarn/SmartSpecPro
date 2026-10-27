import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Button } from "@/components/ui/button";
import { CloudflareImagePublication } from "./CloudflareImagePublication";
import { trpc } from "@/lib/trpc";

type ReviewedSubmission = { submissionId: string; planDigest: string; candidateJobId: string; artifactRef: string; workerSourceSha: string };
export function CloudflareNativeRuntimeOperation({ tenantId, projectId, candidateJobId }: {
  tenantId: string; projectId: string; candidateJobId: string;
}) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const preflightHelp = (reason: string) => {
    if (reason.includes("M1_EVIDENCE") || reason.startsWith("HTTP_APPLICATION_M1_")) return text(
      "The accepted M1 synthetic tenant evidence could not be verified. No application job was submitted; review the existing M1 evidence record.",
      "ตรวจหลักฐาน synthetic tenant ของ M1 ที่ผ่านการยอมรับไม่ได้ ระบบยังไม่ได้ส่ง application job ให้ตรวจหลักฐาน M1 เดิมก่อน");
    if (reason.includes("CLOUDFLARE_READBACK")) return text(
      "Cloudflare could not confirm the existing Candidate resources. No new resources or application job were created.",
      "Cloudflare ยืนยันทรัพยากร Candidate เดิมไม่ได้ ระบบยังไม่ได้สร้างทรัพยากรหรือ application job ใหม่");
    if (reason.includes("DATABASE_SCHEMA") || reason.includes("DATABASE_ROLE")) return text(
      "The read-only database scope check failed. No role or production data was changed.",
      "ตรวจ schema และขอบเขตฐานข้อมูลแบบอ่านอย่างเดียวไม่ผ่าน ระบบยังไม่ได้เปลี่ยน role หรือข้อมูล Production");
    if (reason.includes("REGISTRY_UNAVAILABLE")) return text(
      "The canonical job registry could not be read. Refresh to reconcile before submitting.",
      "อ่าน canonical job registry ไม่สำเร็จ ให้ตรวจสถานะเดิมก่อนส่งคำขอ");
    return text("Preflight failed at the stage shown above. No new application job was submitted.",
      "การตรวจความพร้อมไม่ผ่านในขั้นที่ระบุด้านบน ระบบยังไม่ได้ส่ง application job ใหม่");
  };
  const key = `smartspec:native-runtime:${tenantId}:${projectId}:${candidateJobId}`, busy = useRef(false);
  const [submission, setSubmission] = useState<ReviewedSubmission | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const state = trpc.infrastructure.getCloudflareHttpRuntimeOperation.useQuery({ tenantId, projectId, candidateJobId },
    { refetchInterval: query => ["queued", "running", "retry_wait"].includes(query.state.data?.job?.status ?? "") ? 5000 : 30_000, retry: false });
  const applicationState = trpc.infrastructure.getCloudflareHttpRuntimeOperation.useQuery({ tenantId, projectId, candidateJobId, operation: "application" },
    { refetchInterval: query => ["queued", "running", "retry_wait"].includes(query.state.data?.job?.status ?? "") ? 5000 : 30_000, retry: false });
  const mutation = trpc.infrastructure.prepareCloudflareHttpRuntime.useMutation();
  const preflight = state.data?.preflight, job = state.data?.job, pending = state.data?.pending;
  const continuation = job?.status === "failed" && preflight?.ready && preflight.plan.previousRuntime?.jobId === job.jobId;
  const pendingExpired = Boolean(pending && Date.parse(pending.expiresAt) <= Date.now());
  const pendingRevoked = Boolean(pending?.revoked);
  // An expired intent for the fully compensated historical job is evidence,
  // not renewable authority. A corrected-image continuation must receive a
  // fresh submission ID and fresh Owner action instead of being disabled or
  // replaying that exhausted job's ID.
  const usablePending = pending && !pendingRevoked && !pendingExpired ? pending : null;
  const appPreflight = applicationState.data?.preflight, appJob = applicationState.data?.job, appPending = applicationState.data?.pending;
  const appPreflightStage = appPreflight && !appPreflight.ready
    ? /HTTP_RUNTIME_PREFLIGHT_([A-Z_]+)_/.exec(appPreflight.reason)?.[1] ?? null
    : null;
  const applicationContinuation = Boolean(appJob?.status === "failed" && appPreflight?.ready &&
    appPreflight.plan.previousApplicationAcceptance?.jobId === appJob.jobId);
  const previousFailedApplicationIntent = Boolean(applicationContinuation && appPending?.submissionId === appJob?.jobId);
  const usableApplicationPending = appPending && !previousFailedApplicationIntent && !appPending.revoked && Date.parse(appPending.expiresAt) > Date.now() ? appPending : null;
  const appKey = `smarthub:native-application:${tenantId}:${projectId}:${candidateJobId}`;
  const [applicationSubmission, setApplicationSubmission] = useState<ReviewedSubmission | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(appKey) ?? "null"); } catch { return null; }
  });
  const canReplaceExpiredIntent = Boolean(continuation && pendingExpired && !pendingRevoked && pending?.submissionId === job?.jobId);
  const submit = async () => {
    if (busy.current || job && !continuation || !preflight?.ready || pendingRevoked || pendingExpired && !canReplaceExpiredIntent) return;
    busy.current = true;
    const retained = submission?.submissionId === job?.jobId ? null : submission;
    const request: ReviewedSubmission = usablePending ?? (continuation && retained?.planDigest !== preflight.planDigest ? null : retained) ?? { submissionId: crypto.randomUUID(), planDigest: preflight.planDigest,
      candidateJobId, artifactRef: preflight.plan.artifactRef, workerSourceSha: preflight.plan.workerSourceSha };
    setSubmission(request);
    try { sessionStorage.setItem(key, JSON.stringify(request)); } catch { /* Server intent remains authoritative. */ }
    try { await mutation.mutateAsync({ tenantId, projectId, candidateJobId: request.candidateJobId, submissionId: request.submissionId,
      planDigest: request.planDigest, artifactRef: request.artifactRef, workerSourceSha: request.workerSourceSha }); }
    catch { /* Show the sanitized error; reconcile the same canonical intent. */ }
    finally { busy.current = false; void state.refetch(); }
  };
  const submitApplicationAcceptance = async () => {
    if (busy.current || !appPreflight?.ready || appJob && !applicationContinuation || appPending?.revoked && !applicationContinuation ||
        appPending && !usableApplicationPending && !applicationContinuation) return;
    busy.current = true;
    const request: ReviewedSubmission = usableApplicationPending ?? (applicationSubmission?.planDigest === appPreflight.planDigest ? applicationSubmission : null) ?? { submissionId: crypto.randomUUID(), planDigest: appPreflight.planDigest,
      candidateJobId, artifactRef: appPreflight.plan.artifactRef, workerSourceSha: appPreflight.plan.workerSourceSha };
    if (request.planDigest !== appPreflight.planDigest) { busy.current = false; return; }
    setApplicationSubmission(request);
    try { sessionStorage.setItem(appKey, JSON.stringify(request)); } catch { /* Server intent remains authoritative. */ }
    try { await mutation.mutateAsync({ tenantId, projectId, candidateJobId, submissionId: request.submissionId,
      planDigest: request.planDigest, artifactRef: request.artifactRef, workerSourceSha: request.workerSourceSha, operation: "application" }); }
    catch { /* Retain the same ID so the canonical intent/job can be reconciled. */ }
    finally { busy.current = false; void applicationState.refetch(); }
  };
  return <VStack as="section" gap={2} id="cloudflare-m3-runtime-operation" aria-label={text("Bounded native runtime test", "ทดสอบ native runtime แบบจำกัดขอบเขต")}>
    <Heading level={3}>{text("Cloudflare migration control center", "ศูนย์ควบคุมการย้ายระบบ Cloudflare")}</Heading>
    <Text>{text("Current phase: authenticated application acceptance. Earlier accepted infrastructure and bounded boot evidence are retained; this page will not repeat them.",
      "ขั้นปัจจุบัน: ตรวจรับแอปที่ต้องเข้าสู่ระบบ โดยคงผล infrastructure และ boot test ที่ผ่านแล้วไว้ และไม่ทำขั้นเดิมซ้ำ")}</Text>
    <VStack as="ol" gap={1} aria-label={text("Migration progress", "ความคืบหน้าการย้ายระบบ")}>
      <li>{text("M1 database and tenant isolation", "M1 ฐานข้อมูลและการแยก tenant")}: {text("ACCEPTED", "ผ่าน")}</li>
      <li>{text("M2 Cloudflare ingress", "M2 ทางเข้า Cloudflare")}: {text("ACCEPTED", "ผ่าน")}</li>
      <li>{text("Node/Python on-demand boot and SQL", "Node/Python เริ่มแบบ on-demand และ SQL")}: {job?.receipt?.runtimeBootVerified ? text("VERIFIED", "ตรวจแล้ว") : job?.status ?? text("Checking", "กำลังตรวจ")}</li>
      <li>{text("Authenticated application/API", "แอปและ API ที่ต้องเข้าสู่ระบบ")}: {appJob?.status ?? (appPreflight?.ready ? text("READY TO SUBMIT", "พร้อมส่งงาน") : text("PREFLIGHT BLOCKED", "ติดเงื่อนไข preflight"))}</li>
      <li>{text("Gateway/Credit/Billing and Jobs/Recovery parity", "ความเท่าเทียม Gateway/Credit/Billing และ Jobs/Recovery")}: {appJob?.receipt?.runtimeAcceptance ? text("IN REVIEW", "อยู่ระหว่างตรวจ") : text("NOT ACCEPTED", "ยังไม่ผ่าน")}</li>
      <li>{text("Native production activation", "เปิด native production")}: {text("SEPARATE AUTHORIZATION REQUIRED", "ต้องอนุมัติแยก")}</li>
    </VStack>
    <Heading level={4}>{text("Test the existing Node/Python Containers", "ทดสอบ Container Node/Python เดิม")}</Heading>
    <Text>{text("Prepares a separate application database role, encrypted bindings and the private VPC connection, then starts and tests the existing Containers. Stops both Containers, disables the test database login and restores the Candidate deployment afterward.",
      "ระบบจะเตรียม role ฐานข้อมูลแยก ผูก secret แบบเข้ารหัสและ VPC เดิม แล้วเริ่มทดสอบ Container ที่มีอยู่ เมื่อจบจะหยุด Container ปิด login ของ role ทดสอบ และคืน deployment ของ Candidate")}</Text>
    <Text>{text("No new images, Container applications, DNS, Access application or production traffic changes. Boot/SQL readiness does not complete authenticated application acceptance or activate native production traffic.",
      "ไม่สร้าง image, Container application, DNS หรือ Access เพิ่ม และไม่เปลี่ยน traffic จริง ผลเริ่มระบบและ SQL ผ่านยังต้องตรวจรับการใช้งานที่ล็อกอินและขั้นเปิดใช้งาน production ต่อ")}</Text>
    {preflight?.ready ? <>
      <Text>{preflight.plan.candidate.workerName} · {text("Preflight READY", "ตรวจความพร้อมแล้ว")}</Text>
      <Text>{text("Application role", "Role สำหรับแอป")}: {preflight.plan.role} · {preflight.plan.relations.tables.length} tables · RLS {preflight.plan.relations.rlsPolicyCount} policies preserved</Text>
      <Text>{text("At most 2 starts and 1,200 reserved compute seconds per runtime; each process stops within 10 minutes.",
        "เริ่มได้ไม่เกิน 2 ครั้ง และจอง compute ไม่เกิน 1,200 วินาทีต่อ runtime แต่ละ process หยุดภายใน 10 นาที")}</Text>
      <Text>{text("Reviewed source", "Source ที่ตรวจแล้ว")}: {preflight.plan.workerSourceSha} · {preflight.planDigest}</Text>
    </> : preflight ? <Text role="status">{preflight.reason}</Text> : null}
    {continuation ? <Text role="status">{text("The previous test is fully compensated. This reviews the verified corrected images for the same applications, rotates the disabled application login, and performs a new bounded test. The historical job and its expired authority stay unchanged.",
      "งานเดิมคืนค่าเรียบร้อยแล้ว รอบนี้ใช้ image รุ่นแก้ไขกับ Container เดิม เปลี่ยนรหัส role ที่ปิด login และทดสอบแบบจำกัดขอบเขต โดยไม่แก้งานหรือสิทธิ์ที่หมดอายุของรอบเก่า")}</Text> : null}
    <Button type="button" onClick={() => void submit()} disabled={state.isLoading || Boolean(state.error) || !preflight?.ready || Boolean(job && !continuation) || mutation.isPending ||
      pendingRevoked || pendingExpired && !canReplaceExpiredIntent}>
      {job && !continuation ? text("Tracking the existing runtime test", "กำลังติดตามงานทดสอบเดิม") : mutation.isPending ? text("Submitting…", "กำลังส่งงาน…")
        : continuation && !usablePending && (!submission || submission.submissionId === job.jobId || submission.planDigest !== preflight.planDigest) ? text("Authorize corrected images and bounded runtime test", "อนุมัติใช้ image รุ่นแก้ไขและทดสอบ runtime")
        : usablePending || submission ? text("Reconcile the same runtime test", "ตรวจและดำเนินงานทดสอบเดิม")
          : text("Authorize and test Node/Python on Cloudflare", "อนุมัติและทดสอบ Node/Python บน Cloudflare")}
    </Button>
    {pending && (!pendingExpired || pending.submissionId !== job?.jobId) && !job ? <Text role="status">{text("Admission pending canonical reconciliation", "กำลังตรวจผลรับงานจาก canonical registry")}: {pending.submissionId}</Text> : null}
    {canReplaceExpiredIntent ? <Text role="status">{text("The previous runtime authorization expired after its attempts were exhausted. This action creates a fresh bounded test authorization for the corrected images; it does not retry the old job.",
      "สิทธิ์ทดสอบรอบก่อนหมดอายุหลังใช้ attempt ครบแล้ว การกดครั้งนี้จะสร้างคำขอทดสอบใหม่แบบจำกัดสำหรับ image ที่แก้ไข โดยไม่ retry งานเดิม")}</Text> : null}
    {job ? <Text role="status"><StatusDot variant={job.status === "failed" ? "error" : job.status === "succeeded" ? "success" : "accent"}
      label={job.status} isPulsing={job.status === "running"} /> {job.jobId} · {job.status} · {job.attempt}/{job.maxAttempts}{job.errorCode ? ` · ${job.errorCode}` : ""}</Text> : null}
    {job?.checkpoint ? <Text>{job.checkpoint.stage}{job.checkpoint.failure ? ` · ${job.checkpoint.failure}` : ""}{job.checkpoint.deploymentId ? ` · Deployment ${job.checkpoint.deploymentId}` : ""}</Text> : null}
    {job?.receipt ? <Text>{text("Runtime boot test", "ผลทดสอบเริ่ม runtime")}: {job.receipt.runtimeBootVerified ? "VERIFIED" : "UNVERIFIED"} · M3_ACCEPTED: {job.receipt.m3Accepted ? "YES" : "NO"}</Text> : null}
    <Heading level={4}>{text("Authenticated application acceptance", "ทดสอบการใช้งานแอปเมื่อเข้าสู่ระบบ")}</Heading>
    <Text>{text("Runs a synthetic-only login/session test through the existing Node and Python APIs, checks cross-tenant denial, session revocation and authenticated Gateway model-catalog routing without calling a model provider. It creates one temporary synthetic login in the active tenant; no business rows, credit reservation, billing writes, real charges, DNS, or production traffic are changed. The temporary user is deleted and test role disabled afterward. Credit reserve/settlement, application job delivery/recovery and native traffic activation remain separate acceptance gates.",
      "ทดสอบ login/session ด้วยข้อมูลสังเคราะห์ผ่าน API ของ Node/Python ตรวจการปฏิเสธข้าม tenant การเพิกถอน session และ Gateway model catalog ที่ต้อง login โดยไม่เรียก model provider ระบบสร้างบัญชีทดสอบชั่วคราวหนึ่งบัญชีใน tenant ที่เลือก โดยไม่อ่าน/เขียนข้อมูลธุรกิจ ไม่จอง credit ไม่เขียน billing ไม่เรียกเก็บเงินจริง ไม่แก้ DNS หรือ production traffic จากนั้นลบบัญชีและปิด role ทดสอบ ส่วน reserve/settle credit การส่งและกู้คืน application job และการเปิด native traffic ยังเป็นเกณฑ์แยก")}</Text>
    {applicationState.isLoading ? <Text role="status">{text("Checking authenticated application prerequisites…", "กำลังตรวจ prerequisite ของแอปที่ต้องเข้าสู่ระบบ…")}</Text> : null}
    {appPreflight?.ready ? <>
      <Text>{text("Application preflight READY", "ตรวจความพร้อม acceptance แล้ว")}: {appPreflight.planDigest}</Text>
      <Text>{text("Existing M1 synthetic tenant", "Tenant สังเคราะห์ M1 เดิม")}: {appPreflight.plan.applicationFixture.foreignTestTenantId} · {text("existing Candidate", "Candidate เดิม")}: {candidateJobId}</Text>
      {applicationContinuation ? <Text role="status">{text("The previous application attempt is terminal and fully compensated. A fresh Owner action will use the same Candidate and a new reviewed plan; the old Job and authority remain unchanged.",
        "งาน application รอบก่อนจบและคืนค่าครบแล้ว การกดครั้งนี้จะใช้ Candidate เดิมกับแผนที่ตรวจใหม่ โดยไม่แก้ Job หรือสิทธิ์รอบเก่า")}</Text> : null}
      <Button type="button" onClick={() => void submitApplicationAcceptance()} disabled={applicationState.isLoading || Boolean(applicationState.error) || Boolean(appJob && !applicationContinuation) ||
        !appPreflight.ready || mutation.isPending || Boolean(appPending?.revoked && !applicationContinuation) ||
        Boolean(appPending && Date.parse(appPending.expiresAt) <= Date.now() && !applicationContinuation) ||
        Boolean(appPending && !usableApplicationPending && !applicationContinuation)}>
        {mutation.isPending ? text("Submitting…", "กำลังส่งงาน…") : applicationContinuation ? text("Authorize a fresh compensated application acceptance", "อนุมัติทดสอบใหม่หลังคืนค่ารอบก่อนแล้ว")
          : usableApplicationPending || applicationSubmission?.planDigest === appPreflight.planDigest ? text("Reconcile the same application acceptance", "ตรวจงาน application acceptance เดิม")
          : text("Authorize synthetic application acceptance", "อนุมัติทดสอบการใช้งานด้วยข้อมูลสังเคราะห์")}
      </Button>
    </> : appPreflight ? <VStack gap={1} role="status">
      <Text>{appPreflightStage ? text(`Blocked at ${appPreflightStage}`, `ติดเงื่อนไขขั้น ${appPreflightStage}`) : text("Application preflight is not ready", "preflight ของแอปยังไม่พร้อม")}</Text>
      <Text>{preflightHelp(appPreflight.reason)}</Text>
      <details><summary>{text("Exact sanitized preflight result", "ผล preflight แบบไม่เปิดเผยข้อมูลลับ")}</summary><Text>{appPreflight.reason}</Text></details>
      <Button type="button" onClick={() => void applicationState.refetch()} disabled={applicationState.isFetching || Boolean(appJob && !applicationContinuation)}>
        {applicationState.isFetching ? text("Rechecking the same Candidate…", "กำลังตรวจ Candidate เดิม…") : text("Recheck application preflight", "ตรวจ preflight แอปอีกครั้ง")}
      </Button>
    </VStack> : applicationState.error ? <VStack gap={1} role="alert">
      <Text>{text("Authenticated application preflight request failed; no job was submitted.", "คำขอตรวจ preflight แอปที่ต้องเข้าสู่ระบบล้มเหลว และยังไม่มีการส่ง job")}</Text>
      <Text>{applicationState.error.message}</Text>
      <Button type="button" onClick={() => void applicationState.refetch()} disabled={applicationState.isFetching}>
        {applicationState.isFetching ? text("Rechecking the same Candidate…", "กำลังตรวจ Candidate เดิม…") : text("Retry read-only preflight", "ตรวจ preflight แบบอ่านอย่างเดียวอีกครั้ง")}
      </Button>
    </VStack> : null}
    {appPending && !appJob ? <Text role="status">{text("Admission pending canonical reconciliation", "กำลังตรวจผลรับงานจาก canonical registry")}: {appPending.submissionId}</Text> : null}
    {appJob ? <Text role="status"><StatusDot variant={appJob.status === "failed" ? "error" : appJob.status === "succeeded" ? "success" : "accent"}
      label={appJob.status} isPulsing={appJob.status === "running"} /> {appJob.jobId} · {appJob.status} · {appJob.attempt}/{appJob.maxAttempts}{appJob.errorCode ? ` · ${appJob.errorCode}` : ""}</Text> : null}
    {appJob?.receipt ? <Text>{text("Authenticated application checks", "ผลตรวจ authenticated application")}: {appJob.receipt.authenticatedApplicationAcceptance ? "PASS" : "FAIL"} ·
      {text("M3 acceptance", "ตรวจรับ M3")}: {appJob.receipt.runtimeAcceptance ? "PASS" : "PENDING"} · {text("Credit settlement, application jobs/recovery and native activation remain separate gates", "การ settle credit, application jobs/recovery และการเปิด native traffic ยังเป็นเกณฑ์แยก")}</Text> : null}
    {job?.imageRepair ? <>
      <Text role="alert">{job.imageRepair.code} · Node {job.imageRepair.observedVersion} · {text("Required", "ต้องใช้")} {job.imageRepair.requiredVersion}</Text>
      <CloudflareImagePublication tenantId={tenantId} projectId={projectId} replacementForSourceSha={job.imageRepair.sourceSha} />
    </> : null}
    {state.error ? <Text role="alert">{state.error.message}</Text> : null}
    {mutation.error ? <Text role="alert">{mutation.error.message}</Text> : null}
  </VStack>;
}
