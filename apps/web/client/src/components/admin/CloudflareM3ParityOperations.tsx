import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Operation = "credit_billing_acceptance" | "queue_recovery_acceptance";
const operations: Operation[] = [
  "credit_billing_acceptance",
  "queue_recovery_acceptance",
];
const active = new Set([
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
]);

function storedId(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function ParityOperation({
  tenantId,
  projectId,
  candidateJobId,
  operation,
}: {
  tenantId: string;
  projectId: string;
  candidateJobId: string;
  operation: Operation;
}) {
  const { i18n } = useTranslation(),
    th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => (th ? thai : en);
  const key = `smarthub:m3-parity:${tenantId}:${projectId}:${candidateJobId}:${operation}`;
  const [submissionId, setSubmissionId] = useState<string | undefined>(
    () => storedId(key) ?? undefined
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "submitting" | "unknown" | "rejected"
  >("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const query = trpc.infrastructure.getCloudflareM3ParityOperation.useQuery(
    {
      tenantId,
      projectId,
      candidateJobId,
      operation,
      ...(submissionId ? { submissionId } : {}),
    },
    {
      refetchInterval: result =>
        active.has(result.state.data?.job?.status ?? "") ? 5000 : 30_000,
      retry: false,
    }
  );
  const mutation =
    trpc.infrastructure.prepareCloudflareM3ParityOperation.useMutation();
  const preflight = query.data?.preflight;
  const job = query.data?.job;
  const title =
    operation === "credit_billing_acceptance"
      ? text(
          "Credit reserve, settlement and billing",
          "ทดสอบสำรองเครดิต การ settle และ billing"
        )
      : text(
          "Queue, cancellation and recovery",
          "ทดสอบ Queue การยกเลิก และ recovery"
        );
  const submit = async () => {
    if (
      !preflight?.ready ||
      !preflight.planDigest ||
      mutation.isPending ||
      (job && active.has(job.status))
    )
      return;
    const id = submissionId ?? crypto.randomUUID();
    setSubmissionId(id);
    try {
      sessionStorage.setItem(key, id);
    } catch {
      /* canonical intent remains authoritative */
    }
    setPhase("submitting");
    setErrorCode(null);
    try {
      await mutation.mutateAsync({
        tenantId,
        projectId,
        candidateJobId,
        operation,
        submissionId: id,
        planDigest: preflight.planDigest,
      });
      setPhase("unknown");
    } catch (error) {
      const value = error as { message?: unknown };
      const message =
        typeof value.message === "string" &&
        /^[A-Z0-9_]{5,120}$/.test(value.message)
          ? value.message
          : "M3_PARITY_ADMISSION_UNKNOWN";
      setErrorCode(message);
      setPhase(
        message.includes("OWNER") || message.includes("FORBIDDEN")
          ? "rejected"
          : "unknown"
      );
    } finally {
      setDialogOpen(false);
      await query.refetch();
    }
  };
  useEffect(() => {
    if (!submissionId || !job || job.jobId !== submissionId) return;
    if (["succeeded", "failed", "cancelled", "expired"].includes(job.status))
      setPhase("idle");
  }, [submissionId, job?.jobId, job?.status]);

  const accepted = job?.acceptance?.accepted === true;
  const blocked = !preflight?.ready;
  return (
    <Section variant="muted" aria-label={title}>
      <VStack gap={2}>
        <Heading level={4}>{title}</Heading>
        <Text>
          {operation === "credit_billing_acceptance"
            ? text(
                "Runs bounded synthetic credit reservation, settlement, replay, refund, cancellation, conservation and tenant-isolation checks. It never calls a payment provider or changes a real customer balance.",
                "ตรวจ reserve, settlement, replay, refund, cancellation, conservation และ tenant isolation ด้วยบัญชีสังเคราะห์แบบจำกัด ไม่เรียก payment provider หรือแก้ยอดลูกค้าจริง"
              )
            : text(
                "Runs bounded synthetic jobs through the existing canonical outbox and Cloudflare Queue. It must verify delivery, leases, retries, cancellation, recovery, dead-letter handling and compensation from live receipts.",
                "ส่ง synthetic job แบบจำกัดผ่าน canonical outbox และ Cloudflare Queue เดิม ต้องตรวจ delivery, lease, retry, cancellation, recovery, dead-letter และ compensation จาก receipt จริง"
              )}
        </Text>
        <Text role={query.isError ? "alert" : "status"}>
          {text("Readiness", "ความพร้อม")}:{" "}
          {query.isError
            ? text("Registry read failed", "อ่าน registry ไม่สำเร็จ")
            : preflight?.ready
              ? "READY"
              : `BLOCKED · ${preflight?.reason ?? text("checking", "กำลังตรวจ")}`}
        </Text>
        {preflight?.missingLifecycleChecks?.length ? (
          <Text role="alert">
            {text(
              "Full live lifecycle evidence is still missing",
              "หลักฐาน lifecycle แบบ live ที่ยังขาด"
            )}
            : {preflight.missingLifecycleChecks.join(", ")}
          </Text>
        ) : null}
        {job ? (
          <>
            <Text role="status">
              <StatusDot
                variant={
                  job.status === "failed"
                    ? "error"
                    : job.status === "succeeded"
                      ? "success"
                      : "accent"
                }
                label={job.status}
                isPulsing={active.has(job.status)}
              />{" "}
              {job.jobId} · {job.status} · {text("Attempt", "ครั้งที่")}{" "}
              {job.attempt}/{job.maxAttempts}
            </Text>
            <Text>
              {text("Stage", "ขั้นตอน")}:{" "}
              {(
                job.progress as Record<string, unknown> | null
              )?.stage?.toString() ?? text("not reported", "ยังไม่มีข้อมูล")}
              {job.heartbeatAt
                ? ` · ${text("Heartbeat", "สัญญาณล่าสุด")}: ${new Date(job.heartbeatAt).toLocaleString(th ? "th-TH" : "en-US")}`
                : ""}
            </Text>
            {job.errorCode ? (
              <Text role="alert">
                {text("Failure", "ข้อผิดพลาด")}: {job.errorCode}
              </Text>
            ) : null}
            {job.receipt ? (
              <Text>
                {text("Verified receipt", "หลักฐานตรวจรับ")}:{" "}
                {accepted ? "ACCEPTED" : text("INCOMPLETE", "หลักฐานยังไม่ครบ")}
              </Text>
            ) : null}
          </>
        ) : null}
        {query.isError ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            {text(
              "Retry read-only status",
              "อ่านสถานะแบบไม่เปลี่ยนข้อมูลอีกครั้ง"
            )}
          </Button>
        ) : null}
        {preflight?.ready && !job && phase === "idle" ? (
          <Button type="button" onClick={() => setDialogOpen(true)}>
            {text(
              "Review and authorize this bounded test",
              "ตรวจแผนและอนุมัติการทดสอบแบบจำกัด"
            )}
          </Button>
        ) : null}
        {preflight?.ready && !job && phase === "unknown" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDialogOpen(true)}
          >
            {text(
              "Reconcile the same submission",
              "ตรวจ submission เดิมอีกครั้ง"
            )}
          </Button>
        ) : null}
        {phase === "submitting" ? (
          <Text role="status">
            {text("Submitting once…", "กำลังส่งคำขอครั้งเดียว…")}
          </Text>
        ) : null}
        {phase === "unknown" ? (
          <Text role="status">
            {text(
              "Reconciling the same submission ID; do not submit again.",
              "กำลังตรวจ submission ID เดิม โปรดอย่าส่งซ้ำ"
            )}
            {submissionId ? ` · ${submissionId}` : ""}
          </Text>
        ) : null}
        {phase === "rejected" || errorCode ? (
          <Text role="alert">
            {text("Admission result", "ผลรับคำขอ")}: {errorCode}
          </Text>
        ) : null}
        {!preflight?.ready && !query.isError ? (
          <Text>
            {text(
              "No operation was submitted. Resolve this exact prerequisite, then refresh readiness.",
              "ยังไม่มีการส่งงาน ให้แก้ prerequisite นี้แล้วตรวจความพร้อมใหม่"
            )}
          </Text>
        ) : null}
      </VStack>
      <Dialog
        isOpen={dialogOpen}
        onOpenChange={open => {
          if (!mutation.isPending) setDialogOpen(open);
        }}
        purpose="required"
        width={560}
      >
        <Layout
          header={
            <DialogHeader
              title={text(
                "Confirm bounded synthetic operation",
                "ยืนยันการทดสอบสังเคราะห์แบบจำกัด"
              )}
              subtitle={title}
              onOpenChange={mutation.isPending ? undefined : setDialogOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <Text>
                  {text(
                    "This submits one canonical Job under your authenticated Owner scope. It uses synthetic data, makes no real charges and does not change production traffic.",
                    "คำสั่งนี้ส่ง canonical Job หนึ่งรายการภายใต้สิทธิ์ Owner ที่เข้าสู่ระบบ ใช้ข้อมูลสังเคราะห์ ไม่เรียกเก็บเงินจริง และไม่เปลี่ยน production traffic"
                  )}
                </Text>
                <Text>
                  {text("Reviewed plan digest", "digest ของแผนที่ตรวจแล้ว")}:{" "}
                  {preflight?.planDigest ?? "—"}
                </Text>
                {submissionId ? (
                  <Text>
                    {text(
                      "Existing submission ID will be reconciled",
                      "จะตรวจ submission ID เดิม"
                    )}
                    : {submissionId}
                  </Text>
                ) : null}
                {mutation.isPending ? (
                  <Text role="status">
                    {text(
                      "Submitting. Keep this window open; duplicate submission is locked.",
                      "กำลังส่งคำขอ โปรดเปิดหน้าต่างนี้ไว้ ระบบล็อกการส่งซ้ำ"
                    )}
                  </Text>
                ) : null}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={mutation.isPending}
                  onClick={() => setDialogOpen(false)}
                >
                  {text("Cancel", "ยกเลิก")}
                </Button>
                <Button
                  type="button"
                  disabled={mutation.isPending || !preflight?.ready}
                  onClick={() => void submit()}
                >
                  {text("Authorize and submit once", "อนุมัติและส่งครั้งเดียว")}
                </Button>
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </Section>
  );
}

export function CloudflareM3ParityOperations({
  tenantId,
  projectId,
  candidateJobId,
}: {
  tenantId: string;
  projectId: string;
  candidateJobId: string;
}) {
  const { i18n } = useTranslation(),
    th = i18n.language?.startsWith("th");
  return (
    <VStack
      as="section"
      gap={2}
      aria-label={
        th ? "การตรวจรับ Credit และ Queue" : "Credit and Queue acceptance"
      }
    >
      <Heading level={3}>
        {th
          ? "ขั้น M3 · Credit/Billing และ Queue/Recovery"
          : "M3 · Credit/Billing and Queue/Recovery"}
      </Heading>
      {operations.map(operation => (
        <ParityOperation
          key={operation}
          {...{ tenantId, projectId, candidateJobId, operation }}
        />
      ))}
    </VStack>
  );
}
