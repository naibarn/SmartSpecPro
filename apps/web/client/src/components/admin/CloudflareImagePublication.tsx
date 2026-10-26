import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/** No dependency on whole-platform inventory or M1 completion. */
export function CloudflareImagePublication({ tenantId, projectId, hideAction = false }: { tenantId: string; projectId: string; hideAction?: boolean }) {
  const { i18n } = useTranslation();
  const th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const scope = { tenantId, projectId };
  const key = `smartspec:cloudflare-image-pair:${tenantId}:${projectId}`;
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
  useEffect(() => {
    if (status.data?.submissionId && status.data.planDigest &&
        (!submission || status.data.published && submission.id !== status.data.submissionId)) {
      const retained = { id: status.data.submissionId, digest: status.data.planDigest };
      setSubmission(retained);
      try { sessionStorage.setItem(key, JSON.stringify(retained)); } catch { /* Canonical registry remains authoritative. */ }
    }
  }, [submission, status.data]);
  const queue = trpc.infrastructure.queueCloudflareHttpImagePair.useMutation({ onSettled: () => { void status.refetch(); } });
  const jobs = status.data?.jobs ?? [];
  const admitted = jobs.length === 2 && jobs.every(job => job.status !== "NOT_ADMITTED");
  const submit = async () => {
    if (inFlight.current || !preflight.data?.ready) return;
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
    <Heading level={3}>{text("Publish Node and Python applications", "เผยแพร่แอป Node และ Python")}</Heading>
    <Text>{text("Publish two immutable images from one verified source. Production traffic continues through the accepted Linux bridge until runtime acceptance.",
      "เผยแพร่ image สองตัวจาก source ที่ตรวจสอบแล้วชุดเดียวกัน ระหว่างทดสอบ runtime ระบบจริงยังใช้ทางเข้า Linux ที่ผ่านการตรวจรับแล้ว")}</Text>
    {status.data?.published ? <Text>{text("Source", "Source")}: <code>{status.data.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{status.data.accountRef}</code></Text>
      : preflight.data?.ready ? <Text>{text("Source", "Source")}: <code>{status.data?.sourceSha ?? preflight.data.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{preflight.data.accountRef}</code></Text>
      : <Text role="status">{preflight.isLoading ? text("Checking image publication readiness…", "กำลังตรวจความพร้อมเผยแพร่ image…")
        : preflight.data?.reason ?? preflight.error?.message ?? "HTTP_IMAGE_PREFLIGHT_UNAVAILABLE"}</Text>}
    {!hideAction ? <Button type="button" disabled={!preflight.data?.ready || status.isLoading || Boolean(status.error) || queue.isPending || admitted} onClick={() => void submit()}>
      {queue.isPending ? text("Submitting the paired publication…", "กำลังส่งงานเผยแพร่ทั้งคู่…")
        : admitted ? text("Publication jobs accepted", "รับงานเผยแพร่ทั้งคู่แล้ว")
          : submission ? text("Reconcile and continue the same publication", "ตรวจและดำเนินงานเผยแพร่เดิมต่อ")
            : text("Authorize and publish Node/Python images", "อนุมัติและเผยแพร่ image Node/Python")}
    </Button> : null}
    {status.data?.submissionId || submission ? <Text>{text("Submission", "คำขอ")}: <code>{status.data?.submissionId ?? submission?.id}</code></Text> : null}
    {queue.error ? <Text role="alert">{queue.error.message}</Text> : null}
    {status.error ? <Text role="alert">{status.error.message}</Text> : null}
    {status.data?.diagnostics.map(item => <Text key={`${item.runtime}:${item.stage}`} role="alert">{item.runtime}: {item.stage} · {item.code}</Text>)}
    {status.data?.pairResolution?.map(item => <Text key={`${item.submissionId}:${item.jobId ?? item.code}`} role="status">{item.submissionId} · {item.runtime} · {item.code}</Text>)}
    <VStack as="ul" gap={1} aria-live="polite">{jobs.map(job => <li key={job.jobId}>
      <code>{job.runtime}</code>: {job.status} · <code>{job.jobId}</code>
      {job.errorCode ? ` · ${job.errorCode}` : ""}{job.registryVerified && job.image ? <Text as="p"><code>{job.image}</code></Text> : null}
    </li>)}</VStack>
    {status.data?.published ? <Text role="status">{text("Both registry receipts verified. Runtime deployment and acceptance are next.", "ยืนยัน receipt จาก registry ครบทั้งคู่แล้ว ขั้นต่อไปคือ deploy และตรวจรับ runtime")}</Text> : null}
  </VStack>;
}
