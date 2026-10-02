import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppPage } from "@/components/AppPage";
import { LocaleToggle } from "@/components/LocaleToggle";
import { trpc } from "@/lib/trpc";
import { i18n } from "@/i18n";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

interface RegistrySourceRow extends Record<string, unknown> {
  id: string;
  name: string;
  canonicalSourceId: string;
  sourceType: string;
  providerId: string;
  rightsPolicyRef: string;
  status: string;
  createdAt: string;
}

interface CandidateSourceRow extends Record<string, unknown> {
  sourceId: string;
  displayName: string;
  sourceFamily: string;
  capabilities: string;
  readiness: string;
  researchUrl: string;
  researchEvidence: string;
}

interface OperationalSource extends Record<string, unknown> {
  id: string;
  sourceRef: string;
  displayName: string;
  sourceType: string;
  dataClassification: string;
  canonicalOrigin: string | null;
  independenceGroup: string;
  jurisdictionRef: string;
  status: string;
  createdAt: string;
}

const reviewItems = [
  "endpoint",
  "schema",
  "cadence",
  "rights",
  "attribution",
  "purpose",
] as const;
type ReviewItem = (typeof reviewItems)[number];
type ReviewChecklist = Record<ReviewItem, boolean>;
const newReviewChecklist = (): ReviewChecklist => ({
  endpoint: false,
  schema: false,
  cadence: false,
  rights: false,
  attribution: false,
  purpose: false,
});

function copy(isThai: boolean) {
  return isThai
    ? {
        title: "แหล่งข้อมูลอัจฉริยะ",
        description:
          "แค็ตตาล็อกแหล่งข้อมูลที่ research แล้ว และคิวตรวจสอบก่อนเปิดใช้จริง",
        catalogSection: "แหล่งข้อมูลต้นแบบที่ research แล้ว",
        catalogDescription:
          "รายการจาก Thailand provider pack ใช้เป็นจุดเริ่มต้นสำหรับตรวจ endpoint, schema, ความถี่, สิทธิ์ และการเผยแพร่ ยังไม่ใช่แหล่งข้อมูลที่เชื่อมต่อหรือดึงข้อมูลได้",
        catalogStatus: "ต้นแบบ · ยังไม่ตรวจสอบ",
        inspect: "ดูข้อมูลและหลักฐานต้นทาง",
        sourceEvidence: "หน้าข้อมูลอ้างอิงจากหน่วยงานต้นทาง",
        evidenceKind: "ชนิดหลักฐาน",
        apiDocumentation: "มีเอกสาร API",
        officialDataPage: "หน้าบริการข้อมูลทางการ",
        officialPortal: "เว็บไซต์หน่วยงาน",
        researchLead: "เบาะแสวิจัยเบื้องต้น",
        apiEvidence:
          "มีเอกสาร API ของหน่วยงาน แต่ยังต้องตรวจ endpoint, สิทธิ์ และ adapter",
        portalEvidence:
          "มีหน้าเว็บไซต์หรือหน้าข้อมูลทางการ ต้องยืนยันช่องทาง/API และเงื่อนไขก่อนเชื่อมต่อ",
        leadEvidence:
          "เป็นแหล่งวิจัยเบื้องต้น ต้องยืนยันเจ้าของข้อมูลและช่องทางใช้งานก่อน",
        submitCandidate: "ส่งรายการนี้เข้าคิวตรวจสอบ",
        registerTitle: "ส่งแหล่งข้อมูลเข้าคิวตรวจสอบ",
        registerDescription:
          "การส่งรายการจะไม่เปิดการเชื่อมต่อหรือดึงข้อมูล ต้องตรวจหลักฐานและอนุมัติแยกต่างหาก",
        registerSuccess:
          "ส่งเข้าคิวตรวจสอบแล้ว รายการยังไม่เชื่อมต่อหรือดึงข้อมูล",
        registerFailure: "ส่งรายการไม่สำเร็จ ตรวจสิทธิ์หรือรายการซ้ำ",
        sourceRef: "รหัสอ้างอิง",
        canonicalOrigin: "โดเมนต้นทาง HTTPS",
        register: "ส่งเข้าคิว",
        nextSteps: "ขั้นตอนหลังส่งรายการ",
        nextStepsDescription:
          "1) ตรวจ URL และรูปแบบข้อมูล 2) ยืนยันรอบเวลาและพื้นที่ครอบคลุม 3) บันทึกสิทธิ์ การเก็บรักษา และการแสดงผล 4) ติดตั้ง/ตรวจ adapter และทดสอบข้อมูลตัวอย่าง 5) ผู้มีสิทธิ์ตรวจสอบเหตุฉุกเฉินจึงอนุมัติ สถานะ active เพียงอย่างเดียวยังไม่เปิดการดึงข้อมูลอัตโนมัติ",
        catalogEmpty: "ไม่มีแหล่งข้อมูลต้นแบบ",
        sourceFamily: "หน่วยงาน / กลุ่มแหล่งข้อมูล",
        capabilities: "ข้อมูลที่รองรับ",
        readiness: "ความพร้อม",
        section: "ข้อเสนอที่รอตรวจสอบ",
        safetyTitle: "ข้อเสนอเหล่านี้ยังไม่ถูกเปิดใช้งาน",
        safetyDescription:
          "รายการ pending_review จะไม่เชื่อมต่อ provider ไม่ดึงข้อมูล และไม่ถูกใช้คำนวณจนกว่าจะมี policy, สิทธิ์, adapter และขั้นตอนอนุมัติที่ตรวจสอบย้อนหลังได้",
        name: "ชื่อแหล่งข้อมูล",
        identity: "รหัสอ้างอิง",
        type: "ชนิด",
        provider: "Provider",
        rights: "Rights policy",
        status: "สถานะ",
        submitted: "ส่งเมื่อ",
        empty: "ยังไม่มีข้อเสนอแหล่งข้อมูล",
        emptyDescription:
          "เมื่อมีการส่งข้อเสนอจาก tenant รายการจะปรากฏที่นี่ การเพิ่มรายการยังไม่ทำให้ระบบเชื่อมต่อหรือใช้งานแหล่งข้อมูล",
        loadError: "โหลดรายการไม่สำเร็จ",
        retry: "ลองอีกครั้ง",
        refresh: "โหลดใหม่",
        loading: "กำลังโหลดรายการ…",
        pending: "รอตรวจสอบ",
        dashboard: "กลับแดชบอร์ด",
        operationalSection: "คิวอนุมัติแหล่งข้อมูลปฏิบัติการ",
        operationalDescription:
          "รายการจาก Spec 260 ที่อยู่ในวงจรตรวจสอบจริง การอนุมัติเปิดให้บันทึกหลักฐานจากแหล่งนี้ แต่ไม่ได้เปิดการดึงข้อมูลอัตโนมัติ",
        operationalEmpty: "ไม่มีแหล่งข้อมูลรออนุมัติ",
        operationalError:
          "โหลดคิวไม่ได้: ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลและ tenant ที่ถูกต้อง หากยังพบปัญหาให้ตรวจ policy emergency operations ของบัญชี",
        origin: "ต้นทาง",
        sourceReference: "รหัสอ้างอิง",
        jurisdiction: "พื้นที่รับผิดชอบ",
        approve: "ตรวจและอนุมัติ",
        reviewTitle: "ตรวจสอบก่อนอนุมัติแหล่งข้อมูล",
        reviewSubtitle: "ยืนยันรายการตรวจสอบทุกข้อก่อนเปิดสถานะ active",
        endpointCheck: "ยืนยัน URL ต้นทาง HTTPS และเจ้าของข้อมูล",
        schemaCheck: "ยืนยัน schema และความหมายของข้อมูล",
        cadenceCheck: "ยืนยันความถี่และเวลาที่อัปเดต",
        rightsCheck: "ยืนยันสิทธิ์ใช้งานและเงื่อนไขเผยแพร่",
        attributionCheck: "ยืนยันข้อกำหนดการระบุแหล่งที่มา",
        purposeCheck: "ยืนยันขอบเขตวัตถุประสงค์และพื้นที่ใช้งาน",
        reason: "เหตุผลการอนุมัติ",
        reasonPlaceholder: "ระบุหลักฐานหรือเอกสารอ้างอิงที่ตรวจแล้ว",
        cancel: "ยกเลิก",
        confirmApprove: "ยืนยันอนุมัติ",
        reviewRequired: "กรุณายืนยันทุกข้อและระบุเหตุผลอย่างน้อย 8 ตัวอักษร",
        reviewSuccess: "อนุมัติแหล่งข้อมูลแล้ว",
        reviewFailure: "อนุมัติไม่สำเร็จ ตรวจสอบสิทธิ์หรือสถานะรายการ",
        sourceStatus: "สถานะ",
        classification: "ชั้นข้อมูล",
        general: "ทั่วไป",
        unclassified: "ยังไม่จำแนก",
        sensitive: "อ่อนไหว",
        restricted: "จำกัดสิทธิ์",
      }
    : {
        title: "Intelligence sources",
        description:
          "Research-backed source catalog and review queue before activation.",
        catalogSection: "Researched source catalog",
        catalogDescription:
          "Candidates from the Thailand provider pack are starting points for endpoint, schema, cadence, rights, and redistribution review. They are not connected sources and cannot fetch data yet.",
        catalogStatus: "Candidate · unverified",
        inspect: "View source details and evidence",
        sourceEvidence: "Reference page from the source organization",
        evidenceKind: "Evidence type",
        apiDocumentation: "API documentation",
        officialDataPage: "Official data-service page",
        officialPortal: "Agency portal",
        researchLead: "Initial research lead",
        apiEvidence:
          "Agency API documentation exists; endpoint, rights, and adapter still need validation",
        portalEvidence:
          "An official portal or data page exists; confirm access/API and terms before connecting",
        leadEvidence:
          "Initial research lead; verify data owner and access path before onboarding",
        submitCandidate: "Send this candidate for review",
        registerTitle: "Submit source for review",
        registerDescription:
          "Submitting does not connect to or fetch data. Evidence review and approval are separate steps.",
        registerSuccess:
          "Submitted for review. This source is not connected and does not fetch data.",
        registerFailure:
          "Could not submit the source. Check access or duplicate reference.",
        sourceRef: "Source reference",
        canonicalOrigin: "HTTPS source domain",
        register: "Submit for review",
        nextSteps: "What happens next",
        nextStepsDescription:
          "1) Verify URL and data format 2) Confirm update schedule and geographic coverage 3) Record rights, retention, and display terms 4) install/validate an adapter with sample data 5) an emergency verifier reviews and approves. Active status alone does not enable automatic data retrieval.",
        catalogEmpty: "No candidate sources are defined",
        sourceFamily: "Agency / source family",
        capabilities: "Available data types",
        readiness: "Readiness",
        section: "Pending source proposals",
        safetyTitle: "Proposals are not active sources",
        safetyDescription:
          "This queue does not activate or fetch data. pending_review records do not connect to providers or participate in analysis. Activation requires verified policy, rights, adapter, and an auditable approval path.",
        name: "Source",
        identity: "Reference",
        type: "Type",
        provider: "Provider",
        rights: "Rights policy",
        status: "Status",
        submitted: "Submitted",
        empty: "No source proposals yet",
        emptyDescription:
          "This is a separate queue for tenant-submitted proposals. Adding a record does not connect or use the source.",
        loadError: "Could not load source proposals",
        retry: "Retry",
        refresh: "Refresh",
        loading: "Loading proposals…",
        pending: "Pending review",
        dashboard: "Back to dashboard",
        operationalSection: "Operational source approval queue",
        operationalDescription:
          "Spec 260 records in the real review lifecycle. Approval allows evidence capture from a source; it does not enable automatic data retrieval.",
        operationalEmpty: "No sources are waiting for approval",
        operationalError:
          "Queue unavailable: sign in as an administrator in the correct tenant. If this persists, check the account's emergency operations policy.",
        origin: "Origin",
        sourceReference: "Source reference",
        jurisdiction: "Jurisdiction",
        approve: "Review and approve",
        reviewTitle: "Review source before approval",
        reviewSubtitle:
          "Confirm every review item before setting this source active",
        endpointCheck: "Verify the HTTPS origin and data owner",
        schemaCheck: "Verify the schema and meaning of the data",
        cadenceCheck: "Verify the update cadence and timestamps",
        rightsCheck: "Verify usage rights and redistribution terms",
        attributionCheck: "Verify attribution requirements",
        purposeCheck: "Verify permitted purpose and geographic scope",
        reason: "Approval rationale",
        reasonPlaceholder:
          "Record the evidence or document references reviewed",
        cancel: "Cancel",
        confirmApprove: "Approve source",
        reviewRequired:
          "Confirm every item and enter a rationale of at least 8 characters.",
        reviewSuccess: "Source approved",
        reviewFailure:
          "Approval failed. Check your access or the source status.",
        sourceStatus: "Status",
        classification: "Data class",
        general: "General",
        unclassified: "Unclassified",
        sensitive: "Sensitive",
        restricted: "Restricted",
      };
}

export default function AdminIntelligenceRegistry() {
  const [, setLocation] = useLocation();
  const isThai = i18n.language.toLowerCase().startsWith("th");
  const text = copy(isThai);
  const catalogQuery =
    trpc.intelligenceRegistry.listCandidateCatalog.useQuery();
  const pendingQuery = trpc.intelligenceRegistry.listPendingSources.useQuery();
  const [operationalSources, setOperationalSources] = useState<
    OperationalSource[]
  >([]);
  const [operationalLoading, setOperationalLoading] = useState(true);
  const [operationalError, setOperationalError] = useState(false);
  const [reviewSource, setReviewSource] = useState<OperationalSource | null>(
    null
  );
  const [checklist, setChecklist] =
    useState<ReviewChecklist>(newReviewChecklist);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [detailSource, setDetailSource] = useState<CandidateSourceRow | null>(
    null
  );
  const [registerSource, setRegisterSource] =
    useState<CandidateSourceRow | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);

  const loadOperationalSources = useCallback(async () => {
    setOperationalLoading(true);
    setOperationalError(false);
    try {
      const response = await fetch(
        getSpec260ApiPath("operations.intel.sources"),
        { credentials: "include", cache: "no-store" }
      );
      if (!response.ok) throw new Error("SOURCE_QUEUE_UNAVAILABLE");
      const payload = (await response.json()) as {
        items?: OperationalSource[];
      };
      setOperationalSources(payload.items ?? []);
    } catch {
      setOperationalError(true);
    } finally {
      setOperationalLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOperationalSources();
  }, [loadOperationalSources]);
  const catalogRows: CandidateSourceRow[] = (
    catalogQuery.data?.sources ?? []
  ).map(source => ({
    sourceId: source.sourceId,
    displayName: source.displayName,
    sourceFamily: source.sourceFamily,
    capabilities: source.capabilities
      .map(capability => capability.label)
      .join(", "),
    readiness: text.catalogStatus,
    researchUrl: source.researchUrl,
    researchEvidence: source.researchEvidence,
  }));
  const rows: RegistrySourceRow[] = (pendingQuery.data ?? []).map(source => ({
    id: source.id,
    name:
      typeof source.sourceJson?.name === "string"
        ? source.sourceJson.name
        : source.canonicalSourceId,
    canonicalSourceId: source.canonicalSourceId,
    sourceType:
      typeof source.sourceJson?.sourceType === "string"
        ? source.sourceJson.sourceType
        : "—",
    providerId: source.providerId,
    rightsPolicyRef:
      typeof source.sourceJson?.rightsPolicyRef === "string"
        ? source.sourceJson.rightsPolicyRef
        : "—",
    status: source.status,
    createdAt: new Date(source.createdAt).toLocaleString(
      isThai ? "th-TH" : "en-US"
    ),
  }));

  const submitApproval = async () => {
    if (
      !reviewSource ||
      !reviewItems.every(item => checklist[item]) ||
      reviewReason.trim().length < 8
    )
      return;
    setReviewBusy(true);
    setReviewMessage("");
    const attestation = reviewItems.map(item => `${item}=verified`).join(", ");
    try {
      const response = await fetch(
        getSpec260ApiPath("operations.intel.source.review", {
          sourceId: reviewSource.id,
        }),
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            status: "active",
            reason: `${reviewReason.trim()} [${attestation}]`,
          }),
        }
      );
      if (!response.ok) throw new Error("SOURCE_REVIEW_FAILED");
      setReviewMessage(text.reviewSuccess);
      setReviewSource(null);
      setChecklist(newReviewChecklist());
      setReviewReason("");
      await loadOperationalSources();
    } catch {
      setReviewMessage(text.reviewFailure);
    } finally {
      setReviewBusy(false);
    }
  };

  const submitCandidate = async () => {
    if (!registerSource) return;
    setRegisterBusy(true);
    setReviewMessage("");
    try {
      const sourceUrl = new URL(registerSource.researchUrl);
      const response = await fetch(
        getSpec260ApiPath("operations.intel.source.create"),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            sourceRef: registerSource.sourceId,
            displayName: registerSource.displayName,
            sourceType: "official",
            dataClassification: "general",
            canonicalOrigin: sourceUrl.origin,
            independenceGroup: registerSource.sourceFamily,
            jurisdictionRef: "TH",
          }),
        }
      );
      if (!response.ok) throw new Error("SOURCE_SUBMIT_FAILED");
      setRegisterSource(null);
      setReviewMessage(text.registerSuccess);
      await loadOperationalSources();
    } catch {
      setReviewMessage(text.registerFailure);
    } finally {
      setRegisterBusy(false);
    }
  };

  const evidenceLabel = (source: CandidateSourceRow) => {
    if (source.researchEvidence === "API_DOCUMENTATION")
      return text.apiDocumentation;
    if (source.researchEvidence === "OFFICIAL_DATA_PAGE")
      return text.officialDataPage;
    if (source.researchEvidence === "RESEARCH_LEAD") return text.researchLead;
    return text.officialPortal;
  };

  const columns = [
    { key: "name", header: text.name, width: proportional(2) },
    {
      key: "canonicalSourceId",
      header: text.identity,
      width: proportional(1.5),
    },
    { key: "sourceType", header: text.type, width: proportional(1) },
    { key: "providerId", header: text.provider, width: proportional(1) },
    { key: "rightsPolicyRef", header: text.rights, width: proportional(1) },
    {
      key: "status",
      header: text.status,
      width: proportional(1),
      renderCell: (row: RegistrySourceRow) => (
        <HStack gap={2} align="center">
          <StatusDot variant="warning" label={text.pending} />
          <Text>{row.status}</Text>
        </HStack>
      ),
    },
    { key: "createdAt", header: text.submitted, width: proportional(1.5) },
  ];

  return (
    <AppPage
      constrainToParent
      title={text.title}
      description={text.description}
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: text.title },
      ]}
      actions={
        <HStack gap={2} align="center" wrap="wrap">
          <LocaleToggle />
          <Button
            label={text.dashboard}
            variant="secondary"
            onClick={() => setLocation("/dashboard")}
          />
          <Button
            label={text.refresh}
            variant="secondary"
            onClick={() => {
              void catalogQuery.refetch();
              void pendingQuery.refetch();
              void loadOperationalSources();
            }}
            disabled={
              catalogQuery.isFetching ||
              pendingQuery.isFetching ||
              operationalLoading
            }
          />
        </HStack>
      }
      state={
        catalogQuery.isLoading || pendingQuery.isLoading
          ? "loading"
          : catalogQuery.isError || pendingQuery.isError
            ? "error"
            : "ready"
      }
      error={{
        title: text.loadError,
        onRetry: () => {
          void catalogQuery.refetch();
          void pendingQuery.refetch();
        },
      }}
    >
      <VStack gap={4}>
        <Banner
          status="warning"
          title={text.safetyTitle}
          description={text.safetyDescription}
          collapsible={false}
        />
        <Banner
          status="info"
          title={text.nextSteps}
          description={text.nextStepsDescription}
          collapsible={false}
        />
        <Section>
          <VStack gap={3}>
            <Heading level={2}>{text.catalogSection}</Heading>
            <Text>{text.catalogDescription}</Text>
            {catalogQuery.isLoading ? (
              <Text role="status">{text.loading}</Text>
            ) : catalogRows.length === 0 ? (
              <EmptyState title={text.catalogEmpty} headingLevel={3} />
            ) : (
              <Table
                data={catalogRows}
                columns={[
                  {
                    key: "displayName",
                    header: text.name,
                    width: proportional(2),
                  },
                  {
                    key: "sourceFamily",
                    header: text.sourceFamily,
                    width: proportional(1),
                  },
                  {
                    key: "capabilities",
                    header: text.capabilities,
                    width: proportional(2),
                  },
                  {
                    key: "readiness",
                    header: text.readiness,
                    width: proportional(1.25),
                    renderCell: (row: CandidateSourceRow) => (
                      <HStack gap={2} align="center">
                        <StatusDot variant="warning" label={row.readiness} />
                        <Text>{row.readiness}</Text>
                      </HStack>
                    ),
                  },
                  {
                    key: "actions",
                    header: "",
                    width: proportional(1),
                    renderCell: (row: CandidateSourceRow) => (
                      <Button
                        label={text.inspect}
                        variant="secondary"
                        onClick={() => setDetailSource(row)}
                      />
                    ),
                  },
                ]}
                idKey="sourceId"
                density="balanced"
                dividers="rows"
                hasHover
              />
            )}
          </VStack>
        </Section>
        <Section>
          <VStack gap={3}>
            <Heading level={2}>{text.operationalSection}</Heading>
            <Text>{text.operationalDescription}</Text>
            {reviewMessage && <Text role="status">{reviewMessage}</Text>}
            {operationalLoading ? (
              <Text role="status">{text.loading}</Text>
            ) : operationalError ? (
              <Banner status="error" title={text.operationalError} />
            ) : operationalSources.length === 0 ? (
              <EmptyState title={text.operationalEmpty} headingLevel={3} />
            ) : (
              <Table
                data={operationalSources}
                idKey="id"
                density="balanced"
                dividers="rows"
                hasHover
                columns={[
                  {
                    key: "displayName",
                    header: text.name,
                    width: proportional(2),
                  },
                  {
                    key: "sourceRef",
                    header: text.sourceReference,
                    width: proportional(1),
                  },
                  {
                    key: "canonicalOrigin",
                    header: text.origin,
                    width: proportional(2),
                    renderCell: (row: OperationalSource) =>
                      row.canonicalOrigin ? (
                        <a
                          href={row.canonicalOrigin}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.canonicalOrigin}
                        </a>
                      ) : (
                        <Text>—</Text>
                      ),
                  },
                  {
                    key: "jurisdictionRef",
                    header: text.jurisdiction,
                    width: proportional(1),
                  },
                  {
                    key: "dataClassification",
                    header: text.classification,
                    width: proportional(1),
                    renderCell: (row: OperationalSource) =>
                      text[
                        (row.dataClassification ||
                          "unclassified") as keyof typeof text
                      ] ??
                      row.dataClassification,
                  },
                  {
                    key: "status",
                    header: text.sourceStatus,
                    width: proportional(1),
                    renderCell: (row: OperationalSource) => (
                      <HStack gap={2} align="center">
                        <StatusDot
                          variant={
                            row.status === "active"
                              ? "success"
                              : row.status === "pending_review"
                                ? "warning"
                                : "neutral"
                          }
                          label={row.status}
                        />
                        <Text>{row.status}</Text>
                      </HStack>
                    ),
                  },
                  {
                    key: "actions",
                    header: "",
                    width: proportional(1),
                    renderCell: (row: OperationalSource) =>
                      row.status === "pending_review" ? (
                        <Button
                          label={text.approve}
                          onClick={() => {
                            setReviewSource(row);
                            setChecklist(newReviewChecklist());
                            setReviewReason("");
                            setReviewMessage("");
                          }}
                        />
                      ) : (
                        <Text>—</Text>
                      ),
                  },
                ]}
              />
            )}
          </VStack>
        </Section>
        <Section>
          <VStack gap={4}>
            <Heading level={2}>{text.section}</Heading>
            {pendingQuery.isLoading ? (
              <Text role="status">{text.loading}</Text>
            ) : rows.length === 0 ? (
              <EmptyState
                title={text.empty}
                description={text.emptyDescription}
                headingLevel={3}
              />
            ) : (
              <Table
                data={rows}
                columns={columns}
                idKey="id"
                density="balanced"
                dividers="rows"
                hasHover
              />
            )}
          </VStack>
        </Section>
      </VStack>
      <Dialog
        isOpen={Boolean(reviewSource)}
        onOpenChange={open => {
          if (!open && !reviewBusy) setReviewSource(null);
        }}
        purpose="form"
        width={560}
      >
        <VStack gap={3}>
          <DialogHeader
            title={text.reviewTitle}
            subtitle={reviewSource?.displayName ?? text.reviewSubtitle}
            onOpenChange={() => {
              if (!reviewBusy) setReviewSource(null);
            }}
          />
          {reviewItems.map(item => (
            <CheckboxInput
              key={item}
              label={text[`${item}Check` as keyof typeof text] as string}
              value={checklist[item]}
              onChange={value =>
                setChecklist(current => ({ ...current, [item]: value }))
              }
            />
          ))}
          <TextInput
            label={text.reason}
            value={reviewReason}
            onChange={setReviewReason}
            placeholder={text.reasonPlaceholder}
          />
          <Text>{text.operationalDescription}</Text>
          <HStack gap={2} justify="end" wrap="wrap">
            <Button
              label={text.cancel}
              variant="secondary"
              onClick={() => setReviewSource(null)}
              disabled={reviewBusy}
            />
            <Button
              label={text.confirmApprove}
              onClick={() => void submitApproval()}
              disabled={
                reviewBusy ||
                !reviewItems.every(item => checklist[item]) ||
                reviewReason.trim().length < 8
              }
            />
          </HStack>
        </VStack>
      </Dialog>
      <Dialog
        isOpen={Boolean(detailSource)}
        onOpenChange={open => {
          if (!open) setDetailSource(null);
        }}
        purpose="info"
        width={640}
      >
        {detailSource && (
          <VStack gap={3}>
            <DialogHeader
              title={detailSource.displayName}
              subtitle={`${detailSource.sourceFamily} · ${detailSource.capabilities}`}
              onOpenChange={() => setDetailSource(null)}
            />
            <Text weight="semibold">{text.sourceEvidence}</Text>
            <Text>
              {detailSource.researchEvidence === "API_DOCUMENTATION"
                ? text.apiEvidence
                : detailSource.researchEvidence === "RESEARCH_LEAD"
                  ? text.leadEvidence
                  : text.portalEvidence}
            </Text>
            <Text weight="semibold">
              {text.evidenceKind}: {evidenceLabel(detailSource)}
            </Text>
            <a
              href={detailSource.researchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {detailSource.researchUrl}
            </a>
            <Banner
              status="warning"
              title={text.nextSteps}
              description={text.nextStepsDescription}
              collapsible={false}
            />
            <HStack gap={2} justify="end" wrap="wrap">
              <Button
                label={text.cancel}
                variant="secondary"
                onClick={() => setDetailSource(null)}
              />
              <Button
                label={text.submitCandidate}
                onClick={() => {
                  setRegisterSource(detailSource);
                  setDetailSource(null);
                }}
              />
            </HStack>
          </VStack>
        )}
      </Dialog>
      <Dialog
        isOpen={Boolean(registerSource)}
        onOpenChange={open => {
          if (!open && !registerBusy) setRegisterSource(null);
        }}
        purpose="form"
        width={560}
      >
        <VStack gap={3}>
          <DialogHeader
            title={text.registerTitle}
            subtitle={registerSource?.displayName ?? text.registerDescription}
            onOpenChange={() => {
              if (!registerBusy) setRegisterSource(null);
            }}
          />
          <TextInput
            label={text.sourceRef}
            value={registerSource?.sourceId ?? ""}
            isReadOnly
          />
          <TextInput
            label={text.canonicalOrigin}
            value={
              registerSource ? new URL(registerSource.researchUrl).origin : ""
            }
            isReadOnly
          />
          <Banner status="info" title={text.registerDescription} />
          <HStack gap={2} justify="end" wrap="wrap">
            <Button
              label={text.cancel}
              variant="secondary"
              onClick={() => setRegisterSource(null)}
              disabled={registerBusy}
            />
            <Button
              label={text.register}
              onClick={() => void submitCandidate()}
              disabled={registerBusy || !registerSource}
            />
          </HStack>
        </VStack>
      </Dialog>
    </AppPage>
  );
}
