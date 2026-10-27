import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const active = new Set(["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing"]);
export function missionCondition(job: { status: string; heartbeatAt?: Date | string | null; leaseExpiresAt?: Date | string | null }, now: number) {
  if (job.status === "succeeded") return "SUCCEEDED";
  if (["failed", "cancelled"].includes(job.status)) return "FAILED";
  if (["pending", "queued", "retry_scheduled"].includes(job.status)) return "QUEUED";
  if (job.status === "waiting_external") return "WAITING";
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now) return "LEASE_EXPIRED";
  if (job.heartbeatAt && now - new Date(job.heartbeatAt).getTime() > 90_000) return "HEARTBEAT_STALE";
  if (["leased", "claimed", "preparing"].includes(job.status)) return "CLAIMED";
  return active.has(job.status) ? "RUNNING" : "UNKNOWN";
}
export function CloudflareLiveMissionStatus({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const candidate = trpc.infrastructure.getCloudflareHttpCandidatePreparation.useQuery({ tenantId, projectId }, { refetchInterval: 30_000, retry: false });
  if (candidate.isError) return <Section variant="muted"><Text role="alert">อ่านสถานะ Candidate ไม่สำเร็จ</Text><Button type="button" onClick={() => void candidate.refetch()}>ตรวจสถานะแบบอ่านอย่างเดียวอีกครั้ง</Button></Section>;
  if (!candidate.data?.job || candidate.data.job.status !== "succeeded") return <Section variant="muted"><Text role="status">{candidate.isLoading ? "กำลังตรวจสถานะการย้ายระบบ" : "ยังไม่พบ Candidate ที่เตรียมสำเร็จสำหรับขอบเขตนี้"}</Text></Section>;
  return <MissionJob tenantId={tenantId} projectId={projectId} candidateJobId={candidate.data.job.jobId} />;
}
function MissionJob({ tenantId, projectId, candidateJobId }: { tenantId: string; projectId: string; candidateJobId: string }) {
  const { i18n } = useTranslation(), th = i18n.language?.startsWith("th"), t = (en: string, thai: string) => th ? thai : en;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const query = trpc.infrastructure.getCloudflareHttpRuntimeOperation.useQuery({ tenantId, projectId, candidateJobId, operation: "application" },
    { refetchInterval: q => active.has(q.state.data?.job?.status ?? "") ? 5000 : 30_000, retry: false });
  const job = query.data?.job, condition = job ? missionCondition(job, now) : null;
  const format = (value?: Date | string | null) => value ? new Date(value).toLocaleString(th ? "th-TH" : "en-US") : t("not recorded", "ไม่มีข้อมูล");
  const start = job?.startedAt ? new Date(job.startedAt).getTime() : null, end = job?.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const labels: Record<string, string> = { QUEUED: t("Queued", "รอ worker รับงาน"), CLAIMED: t("Claimed", "worker รับงานแล้ว"), RUNNING: t("Running", "กำลังทำงาน"), WAITING: t("Waiting", "รอผลจากระบบภายนอก"), HEARTBEAT_STALE: t("Heartbeat stale", "สัญญาณ worker เก่า ต้องตรวจสอบ"), LEASE_EXPIRED: t("Lease expired", "lease หมดอายุ ต้องตรวจสอบ"), SUCCEEDED: t("Succeeded", "งานตรวจแอปสำเร็จ"), FAILED: t("Failed", "งานตรวจแอปไม่สำเร็จ"), UNKNOWN: t("Unknown", "ยังระบุสถานะไม่ได้") };
  const cleanup = job?.checkpoint?.cleanup as Record<string, unknown> | null | undefined;
  const receipt = job?.receipt;
  return <Section variant="muted" aria-label={t("Live migration mission status", "สถานะงานย้ายระบบล่าสุด")}><VStack gap={2}>
    <Heading level={3}>{t("Live mission status", "สถานะงานย้ายระบบล่าสุด")}</Heading>
    {query.isError ? <Text role="alert">{t("Status refresh failed; displayed data may be stale.", "อ่านสถานะล่าสุดไม่สำเร็จ ข้อมูลที่แสดงอาจเก่า")}</Text> : null}
    {!job ? <Text role="status">{query.isLoading ? t("Reading the canonical job…", "กำลังอ่านสถานะงานจริง…") : t("No application acceptance job found.", "ยังไม่พบงานตรวจรับแอป")}</Text> : <>
      <Text role="status">{labels[condition ?? "UNKNOWN"]} · {job.jobId} · {t("Attempt", "ครั้งที่")} {job.attempt}/{job.maxAttempts}</Text>
      <Text>{t("Executor stage", "ขั้นตอน executor")}: {job.checkpoint?.stage ?? job.progressStage ?? t("not recorded", "ยังไม่มีข้อมูล")}</Text>
      <Text>{t("Last successful update", "อ่านข้อมูลสำเร็จล่าสุด")}: {format(query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null)} · {t("Heartbeat", "สัญญาณล่าสุด")}: {format(job.heartbeatAt)}</Text>
      <Text>{t("Elapsed", "เวลาทำงาน")}: {start ? `${Math.max(0, Math.floor((end - start) / 1000))} ${t("seconds", "วินาที")}` : t("not started", "ยังไม่เริ่ม")} · {t("Lease expires", "lease หมดอายุ")}: {format(job.leaseExpiresAt)}</Text>
      <Text>{t("Timeline", "ลำดับที่มีหลักฐาน")}: {t("Job admitted", "รับงานแล้ว")}{job.startedAt ? ` → ${t("worker started", "worker เริ่มงาน")}` : ""}{job.checkpoint?.probes && Array.isArray(job.checkpoint.probes) && job.checkpoint.probes.length ? ` → ${t("runtime probes recorded", "บันทึกผลตรวจ runtime แล้ว")}` : ""}{cleanup?.candidateRestored === true ? ` → ${t("candidate restored", "คืน Candidate แล้ว")}` : ""}{job.finishedAt ? ` → ${labels[condition ?? "UNKNOWN"]}` : ""}</Text>
      {job.errorCode ? <Text role="alert">{t("Failure", "ข้อผิดพลาด")}: {job.errorCode}</Text> : null}
      {receipt?.authenticatedApplicationAcceptance ? <Text>{t("Authenticated application acceptance passed; M3 is not yet accepted. Credit settlement, jobs/recovery and native activation remain.", "ตรวจแอปหลังเข้าสู่ระบบผ่านแล้ว แต่ M3 ยังไม่ผ่าน ต้องตรวจ credit settlement, jobs/recovery และการเปิด native แยก")}</Text> : null}
    </>}
    <Text>{t("Next action", "ขั้นตอนถัดไป")}: {query.isError ? t("Retry read-only status retrieval.", "ตรวจสถานะแบบอ่านอย่างเดียวอีกครั้ง") : condition === "SUCCEEDED" ? t("Continue remaining M3 acceptance.", "ดำเนินการตรวจรับ M3 ส่วนที่เหลือ") : condition === "FAILED" || condition === "HEARTBEAT_STALE" || condition === "LEASE_EXPIRED" ? t("Investigate the recorded job; do not resubmit blindly.", "ตรวจหลักฐาน job เดิม ไม่ต้องส่งซ้ำโดยไม่ตรวจ") : job ? t("No Owner action needed; monitor this job.", "ยังไม่ต้องดำเนินการ ติดตาม job เดิม") : t("Review application acceptance readiness.", "ตรวจความพร้อม application acceptance")}</Text>
    {query.isError ? <Button type="button" onClick={() => void query.refetch()}>{t("Retry read-only status", "ตรวจสถานะแบบอ่านอย่างเดียวอีกครั้ง")}</Button> : null}
  </VStack></Section>;
}
