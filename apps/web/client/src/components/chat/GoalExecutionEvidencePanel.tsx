import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { trpc } from "@/lib/trpc";
import { useTaskHarnessOutputEvents } from "@/lib/useTaskHarnessOutputEvents";

type GoalExecutionEvidencePanelProps = {
  job: {
    id: string;
    status: string;
  };
  approvalStatus?: string | null;
  admissionStatus?: string | null;
  admissionErrorCode?: string | null;
  presentationMode: "simple" | "developer";
};

type ExecutionNotice = {
  status: "info" | "warning" | "error";
  title: string;
  description: string;
};

export function goalExecutionNotice(input: {
  jobStatus: string;
  approvalStatus?: string | null;
  admissionStatus?: string | null;
  admissionErrorCode?: string | null;
}): ExecutionNotice | null {
  if (
    input.admissionStatus === "source_changed" ||
    input.admissionErrorCode === "EXECUTION_SOURCE_CHANGED"
  ) {
    return {
      status: "warning",
      title: "หยุดก่อนส่งให้ Runner เพราะ source เปลี่ยน",
      description:
        "การอนุมัติ Goal ผ่านแล้ว แต่ source ของ workspace เปลี่ยนก่อนเข้าคิว ระบบจึงยังไม่เรียก Codex ให้ตรวจ snapshot ปัจจุบันและเตรียมแผนของ Goal เดิมก่อนเริ่มใหม่",
    };
  }

  if (input.admissionStatus === "request_retry_required") {
    return {
      status: "error",
      title: "ยังส่งคำขออนุมัติไม่สำเร็จ",
      description:
        "งานยังไม่เข้า queue และ Runner ยังไม่ได้รับงาน โปรดเปิดรายละเอียด Goal เพื่อส่งคำขอเดิมอีกครั้งหลังตรวจสถานะ",
    };
  }

  if (input.approvalStatus === "pending") {
    return {
      status: "info",
      title: "รออนุมัติ Goal",
      description:
        "ยังไม่ส่งงานเข้า queue และ Codex ยังไม่เริ่มทำงาน",
    };
  }

  if (input.jobStatus === "pending") {
    return {
      status: "warning",
      title: "งานยังไม่เข้า queue",
      description:
        "Runner ยังไม่ได้รับงานและ Codex ยังไม่เริ่ม หากสถานะนี้ค้าง ให้ตรวจการเตรียมสิทธิ์และ source ใน Goal เดิม",
    };
  }

  if (input.jobStatus === "queued") {
    return {
      status: "info",
      title: "งานอยู่ใน queue แล้ว",
      description:
        "Runner ยังไม่ claim งาน จึงยังไม่มี Codex output",
    };
  }

  if (["running", "claimed", "leased", "preparing"].includes(input.jobStatus)) {
    return {
      status: "info",
      title: "Runner เริ่มรับงานแล้ว",
      description:
        "กำลังรอ Harness event แรกจาก Codex; เมื่อ Runner ส่ง event กลับ หน้านี้จะแสดงต่อเนื่อง",
    };
  }

  return null;
}

export function GoalExecutionEvidencePanel({
  job,
  approvalStatus,
  admissionStatus,
  admissionErrorCode,
  presentationMode,
}: GoalExecutionEvidencePanelProps) {
  const developer = presentationMode === "developer";
  const output = useTaskHarnessOutputEvents(job.id, developer);
  const detailQuery = trpc.workerJobs.observabilityDetail.useQuery(
    { jobId: job.id },
    {
      enabled: developer,
      staleTime: 0,
      refetchInterval: developer ? 5_000 : false,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const notice = goalExecutionNotice({
    jobStatus: job.status,
    approvalStatus,
    admissionStatus,
    admissionErrorCode,
  });

  return (
    <VStack gap={3}>
      {notice ? (
        <Banner
          status={notice.status}
          title={notice.title}
          description={notice.description}
          collapsible={false}
        />
      ) : null}

      {!developer ? (
        <Text>
          <a href={`/agent-monitor?jobId=${encodeURIComponent(job.id)}&view=developer`}>
            ดูผลจาก Runner และ Timeline
          </a>
        </Text>
      ) : null}

      {developer ? (
        <Section variant="muted">
          <VStack gap={3}>
            <HStack gap={2} wrap="wrap">
              <Heading level={3}>Harness output และ execution timeline</Heading>
              <Text type="supporting">Job {job.id} · {job.status}</Text>
            </HStack>

            <VStack gap={1}>
              <Heading level={4}>ผลจาก Codex / Harness</Heading>
              {output.query.isLoading && output.events.length === 0 ? (
                <Text role="status">กำลังโหลด output จาก Runner…</Text>
              ) : null}
              {output.query.error ? (
                <Text role="alert">อ่าน output ของ Runner ไม่สำเร็จ ตรวจสิทธิ์หรือการเชื่อมต่อ</Text>
              ) : null}
              {!output.query.isLoading && !output.query.error && output.events.length === 0 ? (
                <Text role="status">
                  {admissionStatus === "source_changed" || admissionErrorCode === "EXECUTION_SOURCE_CHANGED"
                    ? "ยังไม่มี Codex output เพราะ source เปลี่ยนก่อน Job เข้า queue"
                    : job.status === "pending"
                      ? "ยังไม่มี Codex output เพราะ Job ยังไม่เข้า queue และ Runner ยังไม่ได้รับงาน"
                      : job.status === "queued"
                        ? "ยังไม่มี Codex output เพราะ Runner ยังไม่ claim งาน"
                        : "ยังไม่มี Harness event ถูกบันทึกสำหรับ Job นี้"}
                </Text>
              ) : null}
              {output.events.length > 0 ? (
                <VStack as="ol" gap={3} isScrollable maxHeight="32rem">
                  {output.events.map(event => (
                    <VStack as="li" key={event.id} gap={1}>
                      <Text type="supporting">
                        {event.kind.replaceAll("_", " ")}
                        {event.name ? ` · ${event.name}` : ""}
                        {event.status ? ` · ${event.status}` : ""}
                        {event.exitCode !== undefined ? ` · exit ${event.exitCode}` : ""}
                        {` · ${new Date(event.at).toLocaleTimeString()}`}
                      </Text>
                      {event.path ? <Text type="code" textWrap="wrap">{event.path}</Text> : null}
                      {event.detail ? (
                        <CodeBlock code={event.detail} language="plaintext" width="100%" maxHeight="24rem" isWrapped />
                      ) : null}
                      {event.text ? (
                        <CodeBlock code={event.text} language="plaintext" width="100%" maxHeight="24rem" isWrapped />
                      ) : null}
                      {event.diff ? (
                        <CodeBlock code={event.diff} language="diff" width="100%" maxHeight="24rem" isWrapped />
                      ) : null}
                    </VStack>
                  ))}
                </VStack>
              ) : null}
              {output.hasMore ? <Text type="supporting">กำลังโหลด event เก่าที่บันทึกไว้เพิ่มเติม…</Text> : null}
            </VStack>

            <VStack gap={1}>
              <Heading level={4}>เหตุการณ์ตลอดเส้นทาง</Heading>
              {detailQuery.isLoading ? <Text role="status">กำลังโหลด execution timeline…</Text> : null}
              {detailQuery.error ? <Text role="alert">โหลด execution timeline ไม่สำเร็จ</Text> : null}
              {!detailQuery.isLoading && !detailQuery.error && !detailQuery.data?.timeline.length ? (
                <Text>ยังไม่มีเหตุการณ์ lifecycle ที่บันทึกไว้</Text>
              ) : null}
              {detailQuery.data?.timeline.length ? (
                <VStack as="ol" gap={1} isScrollable maxHeight="20rem">
                  {detailQuery.data.timeline.map(event => (
                    <Text as="li" key={event.id}>
                      {new Date(event.at).toLocaleString()} · {event.type}
                      {event.attempt ? ` · attempt ${event.attempt}` : ""}
                      {event.phase ? ` · ${event.phase}` : ""}
                      {event.reasonCode ? ` · ${event.reasonCode}` : ""}
                    </Text>
                  ))}
                </VStack>
              ) : null}
            </VStack>
          </VStack>
        </Section>
      ) : null}
    </VStack>
  );
}
