import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type ReviewedSubmission = { submissionId: string; planDigest: string; candidateJobId: string; artifactRef: string; workerSourceSha: string };
export function CloudflareNativeRuntimeOperation({ tenantId, projectId, candidateJobId }: {
  tenantId: string; projectId: string; candidateJobId: string;
}) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const key = `smartspec:native-runtime:${tenantId}:${projectId}:${candidateJobId}`, busy = useRef(false);
  const [submission, setSubmission] = useState<ReviewedSubmission | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const state = trpc.infrastructure.getCloudflareHttpRuntimeOperation.useQuery({ tenantId, projectId, candidateJobId },
    { refetchInterval: query => ["queued", "running", "retry_wait"].includes(query.state.data?.job?.status ?? "") ? 5000 : 30_000, retry: false });
  const mutation = trpc.infrastructure.prepareCloudflareHttpRuntime.useMutation();
  const preflight = state.data?.preflight, job = state.data?.job, pending = state.data?.pending;
  const submit = async () => {
    if (busy.current || job || !preflight?.ready || pending?.revoked || pending && Date.parse(pending.expiresAt) <= Date.now()) return;
    busy.current = true;
    const request: ReviewedSubmission = pending ?? submission ?? { submissionId: crypto.randomUUID(), planDigest: preflight.planDigest,
      candidateJobId, artifactRef: preflight.plan.artifactRef, workerSourceSha: preflight.plan.workerSourceSha };
    setSubmission(request);
    try { sessionStorage.setItem(key, JSON.stringify(request)); } catch { /* Server intent remains authoritative. */ }
    try { await mutation.mutateAsync({ tenantId, projectId, candidateJobId: request.candidateJobId, submissionId: request.submissionId,
      planDigest: request.planDigest, artifactRef: request.artifactRef, workerSourceSha: request.workerSourceSha }); }
    catch { /* Show the sanitized error; reconcile the same canonical intent. */ }
    finally { busy.current = false; void state.refetch(); }
  };
  return <VStack as="section" gap={2} aria-label={text("Bounded native runtime test", "ทดสอบ native runtime แบบจำกัดขอบเขต")}>
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
    <Button type="button" onClick={() => void submit()} disabled={state.isLoading || Boolean(state.error) || !preflight?.ready || Boolean(job) || mutation.isPending ||
      Boolean(pending && (pending.revoked || Date.parse(pending.expiresAt) <= Date.now()))}>
      {job ? text("Tracking the existing runtime test", "กำลังติดตามงานทดสอบเดิม") : mutation.isPending ? text("Submitting…", "กำลังส่งงาน…")
        : pending || submission ? text("Reconcile the same runtime test", "ตรวจและดำเนินงานทดสอบเดิม")
          : text("Authorize and test Node/Python on Cloudflare", "อนุมัติและทดสอบ Node/Python บน Cloudflare")}
    </Button>
    {pending && !job ? <Text role="status">{text("Admission pending canonical reconciliation", "กำลังตรวจผลรับงานจาก canonical registry")}: {pending.submissionId}</Text> : null}
    {job ? <Text role="status"><StatusDot variant={job.status === "failed" ? "error" : job.status === "succeeded" ? "success" : "accent"}
      label={job.status} isPulsing={job.status === "running"} /> {job.jobId} · {job.status} · {job.attempt}/{job.maxAttempts}{job.errorCode ? ` · ${job.errorCode}` : ""}</Text> : null}
    {job?.checkpoint ? <Text>{job.checkpoint.stage}{job.checkpoint.failure ? ` · ${job.checkpoint.failure}` : ""}{job.checkpoint.deploymentId ? ` · Deployment ${job.checkpoint.deploymentId}` : ""}</Text> : null}
    {job?.receipt ? <Text>{text("Runtime boot test", "ผลทดสอบเริ่ม runtime")}: {job.receipt.runtimeBootVerified ? "VERIFIED" : "UNVERIFIED"} · M3_ACCEPTED: {job.receipt.m3Accepted ? "YES" : "NO"}</Text> : null}
    {state.error ? <Text role="alert">{state.error.message}</Text> : null}
    {mutation.error ? <Text role="alert">{mutation.error.message}</Text> : null}
  </VStack>;
}
