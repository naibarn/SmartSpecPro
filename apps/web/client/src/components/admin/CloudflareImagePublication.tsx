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
  // Active Owner request identity is separate from the last published pair.
  const [submission, setSubmission] = useState<{ id: string; digest: string } | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return /^[a-f0-9-]{36}$/.test(value?.id ?? "") && /^[a-f0-9]{64}$/.test(value?.digest ?? "") ? value : null;
    } catch { return null; }
  });
  const inFlight = useRef(false);
  const preflight = trpc.infrastructure.getCloudflareHttpImagePairPreflight.useQuery(scope, { staleTime: 30_000, retry: false });
  // Keep the verified baseline separate from the exact active submission. A
  // delayed baseline response can no longer replace the corrected request ID.
  const baseline = trpc.infrastructure.getCloudflareHttpImagePairSubmission.useQuery(scope, { refetchInterval: 5000, retry: false });
  const requested = trpc.infrastructure.getCloudflareHttpImagePairSubmission.useQuery({ ...scope,
    ...(submission ? { submissionId: submission.id } : {}) }, { refetchInterval: 5000, retry: false });
  const baselinePair = baseline.data?.published ? baseline.data : null;
  const requestedRecord = submission && (requested.data?.requestedPublication?.submissionId === submission.id
    ? requested.data.requestedPublication
    : requested.data?.submissionId === submission.id ? requested.data : null);
  // A canonical row can reveal a changed digest even when the browser still
  // holds the matching old ID. Never submit a new plan against that old ID.
  const planChanged = Boolean(submission && preflight.data?.ready && (
    submission.digest !== preflight.data.planDigest ||
    requestedRecord?.submissionId === submission.id && requestedRecord.planDigest !== preflight.data.planDigest
  ));
  const activePlanMatches = Boolean(submission && requestedRecord && !planChanged && requestedRecord.planDigest === submission.digest);
  const current = activePlanMatches ? requestedRecord : baselinePair;
  const queue = trpc.infrastructure.queueCloudflareHttpImagePair.useMutation({ onSettled: () => {
    void baseline.refetch(); void requested.refetch();
  } });
  const jobs = activePlanMatches && requestedRecord ? requestedRecord.jobs : baselinePair?.jobs ?? [];
  const activeJobs = activePlanMatches && requestedRecord ? requestedRecord.jobs : [];
  const correctedSourceReady = !replacementForSourceSha || preflight.data?.ready && preflight.data.sourceSha !== replacementForSourceSha;
  const baselineMatchesPlan = Boolean(baselinePair && preflight.data?.ready && baselinePair.planDigest === preflight.data.planDigest);
  const admitted = activeJobs.length === 2 && activeJobs.every(job => job.status !== "NOT_ADMITTED") || baselineMatchesPlan;
  const submit = async () => {
    if (inFlight.current || !preflight.data?.ready || !correctedSourceReady) return;
    // Create a stable idempotency key only on the explicit Owner action. Reuse
    // it for this exact digest after uncertain responses; use a fresh one when
    // either the browser or canonical row proves the plan changed.
    const request = submission && !planChanged
      ? submission : { id: crypto.randomUUID(), digest: preflight.data.planDigest };
    setSubmission(request);
    try { sessionStorage.setItem(key, JSON.stringify(request)); } catch { /* Canonical admission remains authoritative. */ }
    inFlight.current = true;
    try {
      const result = await queue.mutateAsync({ ...scope, submissionId: request.id, planDigest: request.digest });
      if (result?.submissionId && result.submissionId !== request.id) {
        const retained = { id: result.submissionId, digest: request.digest };
        setSubmission(retained);
        try { sessionStorage.setItem(key, JSON.stringify(retained)); } catch { /* Canonical admission remains authoritative. */ }
      }
    } catch { /* Keep the ID; visible mutation error and exact-ID polling reconcile ambiguity. */ }
    finally { inFlight.current = false; }
  };
  const autoResumeAttempts = useRef(new Set<string>());
  useEffect(() => {
    const missingJob = activeJobs.find(job => job.status === "NOT_ADMITTED");
    const hasCanonicalProgress = activeJobs.some(job => job.status !== "NOT_ADMITTED");
    const rejected = missingJob && requestedRecord?.diagnostics?.some(item => item.runtime === missingJob.runtime);
    const attemptKey = submission ? `${submission.id}:${submission.digest}` : "";
    if (hideAction || !attemptKey || !activePlanMatches || !preflight.data?.ready || !hasCanonicalProgress ||
        !missingJob || rejected || queue.isPending || inFlight.current || autoResumeAttempts.current.has(attemptKey)) return;
    // The original Owner click authorized this exact paired submission. Resume
    // its missing half once the registry confirms partial admission; keep the
    // same plan and ID so a lost response cannot mint another grant or job.
    autoResumeAttempts.current.add(attemptKey);
    void submit();
  }, [activeJobs, activePlanMatches, hideAction, preflight.data?.ready, queue.isPending, requestedRecord, submission]);
  return <VStack as="section" gap={2} aria-label={text("Cloudflare application images", "Image แอปสำหรับ Cloudflare")}>
    <Heading level={3}>{replacementForSourceSha ? text("Publish corrected Node/Python runtime images", "เผยแพร่ image Node/Python รุ่นแก้ไข")
      : text("Publish Node and Python applications", "เผยแพร่แอป Node และ Python")}</Heading>
    {replacementForSourceSha ? <Text role="status">{text("The previous Node image contains 22.22.3; the application requires 22.23.4 or newer in Node 22. This publishes corrected images only. Existing Containers and production traffic remain unchanged.",
      "image Node เดิมเป็น 22.22.3 แต่แอปต้องใช้ 22.23.4 ขึ้นไปใน Node 22 ขั้นนี้เผยแพร่ image รุ่นแก้ไขเท่านั้น ใช้ Container เดิมและไม่เปลี่ยน traffic จริง")}</Text> : null}
    {replacementForSourceSha && preflight.data?.ready ? <Text>{text("Corrected source", "Source รุ่นแก้ไข")}: <code>{preflight.data.sourceSha}</code></Text> : null}
    {preflight.data?.ready ? <Text>{text("Reviewed plan digest", "Digest ของแผนที่ตรวจแล้ว")}: <code>{preflight.data.planDigest}</code></Text> : null}
    <Text>{text("Publish two immutable images from one verified source. Production traffic continues through the accepted Linux bridge until runtime acceptance.",
      "เผยแพร่ image สองตัวจาก source ที่ตรวจสอบแล้วชุดเดียวกัน ระหว่างทดสอบ runtime ระบบจริงยังใช้ทางเข้า Linux ที่ผ่านการตรวจรับแล้ว")}</Text>
    {baselinePair ? <Text>{text("Last verified published source", "Source ล่าสุดที่เผยแพร่และตรวจสอบแล้ว")}: <code>{baselinePair.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{baseline.data?.accountRef}</code></Text>
      : preflight.data?.ready ? <Text>{text("Source", "Source")}: <code>{preflight.data.sourceSha}</code> · {text("Registry account", "บัญชี registry")}: <code>{preflight.data.accountRef}</code></Text>
        : <Text role="status">{preflight.isLoading ? text("Checking image publication readiness…", "กำลังตรวจความพร้อมเผยแพร่ image…")
          : preflight.data?.reason ?? preflight.error?.message ?? "HTTP_IMAGE_PREFLIGHT_UNAVAILABLE"}</Text>}
    {submission && planChanged ? <Text role="status">{text(`Saved submission ${submission.id} belongs to a different plan (${submission.digest}). The current reviewed plan is ${preflight.data?.planDigest}; the next Owner action will use a new submission ID.`,
      `คำขอ ${submission.id} เป็นของแผนเก่า (${submission.digest}) แผนที่ตรวจล่าสุดคือ ${preflight.data?.planDigest} เมื่อกดยืนยันแผนใหม่นี้จะใช้ Submission ID ใหม่`)}</Text> : null}
    {submission && !planChanged && !requestedRecord && !requested.isLoading ? <Text role="status">{text(`Reconciling submission ${submission.id} against the canonical registry.`,
      `กำลังตรวจคำขอ ${submission.id} กับ canonical registry`)}</Text> : null}
    {submission && activePlanMatches && activeJobs.some(job => job.status !== "NOT_ADMITTED") && activeJobs.some(job => job.status === "NOT_ADMITTED")
      ? <Text role="status">{text("Continuing the already authorized image pair from its canonical checkpoint.", "กำลังทำคู่ image ที่อนุมัติไว้ต่อจาก checkpoint ใน registry")}</Text> : null}
    {!hideAction ? <Button type="button" disabled={!preflight.data?.ready || !correctedSourceReady || baseline.isLoading || requested.isLoading || Boolean(baseline.error) || Boolean(requested.error) || Boolean(requested.data?.requestedPublicationError) || queue.isPending || admitted} onClick={() => void submit()}>
      {queue.isPending ? text("Submitting the paired publication…", "กำลังส่งงานเผยแพร่ทั้งคู่…")
        : admitted ? text("Publication jobs accepted", "รับงานเผยแพร่ทั้งคู่แล้ว")
          : submission && !planChanged ? text("Reconcile and continue the same publication", "ตรวจและดำเนินงานเผยแพร่เดิมต่อ")
            : replacementForSourceSha ? text("Authorize corrected Node/Python image publication", "อนุมัติเผยแพร่ image Node/Python รุ่นแก้ไข")
              : submission && planChanged ? text("Authorize the current image plan", "อนุมัติแผน image ปัจจุบัน")
                : text("Authorize and publish Node/Python images", "อนุมัติและเผยแพร่ image Node/Python")}
    </Button> : null}
    {submission ? <Text>{text("Active submission", "คำขอที่กำลังดำเนินการ")}: <code>{submission.id}</code> · {text("Plan", "แผน")}: <code>{submission.digest}</code></Text> : null}
    {baselinePair && !baselineMatchesPlan ? <Text role="status">{text("The previous verified pair remains published while the corrected plan is reviewed and published.",
      "คู่ image เดิมที่ตรวจสอบแล้วจะยังคงใช้งานระหว่างตรวจและเผยแพร่แผนแก้ไข")}</Text> : null}
    {queue.error ? <Text role="alert">{queue.error.message}</Text> : null}
    {requested.data?.requestedPublicationError ? <Text role="alert">{requested.data.requestedPublicationError}</Text> : null}
    {baseline.error ? <Text role="alert">{baseline.error.message}</Text> : null}
    {requested.error ? <Text role="alert">{requested.error.message}</Text> : null}
    {current?.diagnostics.map(item => <Text key={`${item.runtime}:${item.stage}`} role="alert">{item.runtime}: {item.stage} · {item.code}</Text>)}
    {requested.data?.pairResolution?.map(item => <Text key={`${item.submissionId}:${item.jobId ?? item.code}`} role="status">{item.submissionId} · {item.runtime} · {item.code}</Text>)}
    <VStack as="ul" gap={1} aria-live="polite">{jobs.map(job => <li key={job.jobId}>
      <code>{job.runtime}</code>: {job.status} · <code>{job.jobId}</code>
      {job.errorCode ? ` · ${job.errorCode}` : ""}{job.registryVerified && job.image ? <Text as="p"><code>{job.image}</code></Text> : null}
    </li>)}</VStack>
    {current?.published && (activePlanMatches || baselineMatchesPlan) ? <Text role="status">{text("Both registry receipts verified. Runtime deployment and acceptance are next.", "ยืนยัน receipt จาก registry ครบทั้งคู่แล้ว ขั้นต่อไปคือ deploy และตรวจรับ runtime")}</Text> : null}
  </VStack>;
}
