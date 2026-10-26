import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/** No dependency on whole-platform inventory or M1 completion. */
export function CloudflareImagePublication({ tenantId, projectId, hideAction = false, replacementForSourceSha }: { tenantId: string; projectId: string; hideAction?: boolean; replacementForSourceSha?: string }) {
  const { i18n } = useTranslation();
  const th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const scope = { tenantId, projectId };
  const key = replacementForSourceSha ? `smartspec:cloudflare-image-repair:${tenantId}:${projectId}:${replacementForSourceSha}`
    : `smartspec:cloudflare-image-pair:${tenantId}:${projectId}`;
  const [submission, setSubmission] = useState<{ id: string; digest: string } | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return /^[a-f0-9-]{36}$/.test(value?.id ?? "") && /^[a-f0-9]{64}$/.test(value?.digest ?? "") ? value : null;
    } catch { return null; }
  });
  const inFlight = useRef(false);
  const preflight = trpc.infrastructure.getCloudflareHttpImagePairPreflight.useQuery(scope, { staleTime: 30_000, retry: false });
  const status = trpc.infrastructure.getCloudflareHttpImagePairSubmission.useQuery({ ...scope,
    ...(submission ? { submissionId: submission.id } : {}) },
  { refetchInterval: 5000, retry: false });
  const current = replacementForSourceSha ? status.data?.requestedPublication ??
    (status.data?.published && status.data.sourceSha !== replacementForSourceSha ? status.data : null) : status.data;
  useEffect(() => {
    if (current?.submissionId && current.planDigest &&
        (!submission || current.published && submission.id !== current.submissionId)) {
      const retained = { id: current.submissionId, digest: current.planDigest };
      setSubmission(retained);
      try { sessionStorage.setItem(key, JSON.stringify(retained)); } catch { /* Canonical registry remains authoritative. */ }
    }
  }, [submission, current]);
  const queue = trpc.infrastructure.queueCloudflareHttpImagePair.useMutation({ onSettled: () => { void status.refetch(); } });
  const jobs = current?.jobs ?? [];
  const correctedSourceReady = !replacementForSourceSha || preflight.data?.ready && preflight.data.sourceSha !== replacementForSourceSha;
  const admitted = jobs.length === 2 && jobs.every(job => job.status !== "NOT_ADMITTED");
  const submit = async () => {
    if (inFlight.current || !preflight.data?.ready || !correctedSourceReady) return;
    const request = submission ?? { id: crypto.randomUUID(), digest: preflight.data.planDigest };
    // Save BEFORE dispatch. Reload/lost responses reconcile the same pair.
    setSubmission(request);
    try { sessionStorage.setItem(key, JSON.stringify(request)); } catch { /* Canonical intent remains authoritative. */ }
    inFlight.current = true;
    try {
      const result = await queue.mutateAsync({ ...scope, submissionId: request.id, planDigest: request.digest });
      if (result?.submissionId && result.submissionId !== request.id) {
        const retained = { id: result.submissionId, digest: request.digest }; setSubmission(retained);
        try { sessionStorage.setItem(key, JSON.stringify(retained)); } catch { /* Canonical intent is retained. */ }
      }
    }
    catch { /* Mutation + canonical polling show the exact result below. */ }
    finally { inFlight.current = false; }
  };
  return <VStack as="section" gap={2} aria-label={text("Cloudflare application images", "Image แอปสำหรับ Cloudflare")}>
    <Heading level={3}>{replacementForSourceSha ? text("Publish corrected Node/Python runtime images", "เผยแพร่ image Node/Python รุ่นแก้ไข")
      : text("Publish Node and Python applications", "เผยแพร่แอป Node และ Python")}</Heading>
    {replacementForSourceSha ? <Text role="status">{text("The previous Node image contains 22.22.3; the application requires 22.23.4 or newer in Node 22. This publishes corrected images only. Existing Containers and production traffic remain unchanged.",
      "image Node เดิมเป็น 22.22.3 แต่แอปต้องใช้ 22.23.4 ขึ้นไปใน Node 22 ขั้นนี้เผยแพร่ image รุ่นแก้ไขเท่านั้น ใช้ Container เดิมและไม่เปลี่ยน traffic จริง")}</Text> : null}
    {replacementForSourceSha && preflight.data?.ready ? <Text>{text("Corrected source", "Source รุ่นแก้ไข")}: <code>{preflight.data.sourceSha}</code></Text> : null}
    <Text>{text("Publish two immutable images from one verified source. Production traffic continues through the accepted Linux bridge until runtime acceptance.",
      "เผยแพร่ image สองตัวจาก source ที่ตรวจสอบแล้วชุดเดียวกัน ระหว่างทดสอบ runtime ระบบจริงยังใช้ทางเข้า Linux ที่ผ่านการตรวจรับแล้ว")}</Text>
    {current?.published ? <Text>{text("Source", "Source")}: <code>{current.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{status.data?.accountRef}</code></Text>
      : preflight.data?.ready ? <Text>{text("Source", "Source")}: <code>{current?.sourceSha ?? preflight.data.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{preflight.data.accountRef}</code></Text>
      : <Text role="status">{preflight.isLoading ? text("Checking image publication readiness…", "กำลังตรวจความพร้อมเผยแพร่ image…")
        : preflight.data?.reason ?? preflight.error?.message ?? "HTTP_IMAGE_PREFLIGHT_UNAVAILABLE"}</Text>}
    {!hideAction ? <Button type="button" disabled={!preflight.data?.ready || !correctedSourceReady || status.isLoading || Boolean(status.error) || Boolean(status.data?.requestedPublicationError) || queue.isPending || admitted} onClick={() => void submit()}>
      {queue.isPending ? text("Submitting the paired publication…", "กำลังส่งงานเผยแพร่ทั้งคู่…")
        : admitted ? text("Publication jobs accepted", "รับงานเผยแพร่ทั้งคู่แล้ว")
          : submission ? text("Reconcile and continue the same publication", "ตรวจและดำเนินงานเผยแพร่เดิมต่อ")
            : replacementForSourceSha ? text("Authorize corrected Node/Python image publication", "อนุมัติเผยแพร่ image Node/Python รุ่นแก้ไข")
              : text("Authorize and publish Node/Python images", "อนุมัติและเผยแพร่ image Node/Python")}
    </Button> : null}
    {current?.submissionId || submission ? <Text>{text("Submission", "คำขอ")}: <code>{current?.submissionId ?? submission?.id}</code></Text> : null}
    {queue.error ? <Text role="alert">{queue.error.message}</Text> : null}
    {status.data?.requestedPublicationError ? <Text role="alert">{status.data.requestedPublicationError}</Text> : null}
    {status.error ? <Text role="alert">{status.error.message}</Text> : null}
    {current?.diagnostics.map(item => <Text key={`${item.runtime}:${item.stage}`} role="alert">{item.runtime}: {item.stage} · {item.code}</Text>)}
    {status.data?.pairResolution?.map(item => <Text key={`${item.submissionId}:${item.jobId ?? item.code}`} role="status">{item.submissionId} · {item.runtime} · {item.code}</Text>)}
    <VStack as="ul" gap={1} aria-live="polite">{jobs.map(job => <li key={job.jobId}>
      <code>{job.runtime}</code>: {job.status} · <code>{job.jobId}</code>
      {job.errorCode ? ` · ${job.errorCode}` : ""}{job.registryVerified && job.image ? <Text as="p"><code>{job.image}</code></Text> : null}
    </li>)}</VStack>
    {current?.published ? <Text role="status">{text("Both registry receipts verified. Runtime deployment and acceptance are next.", "ยืนยัน receipt จาก registry ครบทั้งคู่แล้ว ขั้นต่อไปคือ deploy และตรวจรับ runtime")}</Text> : null}
  </VStack>;
}
