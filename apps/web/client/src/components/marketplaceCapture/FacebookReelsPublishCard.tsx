import { useEffect, useMemo, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";

import { trpc } from "@/lib/trpc";

type AffiliateMode = "description" | "first_comment" | "manual_native" | "none";

const IN_PROGRESS = new Set([
  "queued", "preflight", "token_check", "uploading", "processing",
  "publish_requested", "reconciling",
]);

const STATUS_LABELS: Record<string, string> = {
  queued: "รอเริ่มเผยแพร่",
  preflight: "กำลังตรวจวิดีโอ",
  needs_connection: "ต้องเชื่อมต่อ Facebook Page",
  token_check: "กำลังตรวจการเชื่อมต่อ",
  uploading: "กำลังอัปโหลดวิดีโอ",
  processing: "Facebook กำลังประมวลผล",
  publish_requested: "ส่งคำขอเผยแพร่แล้ว",
  reconciling: "กำลังตรวจสถานะกับ Facebook",
  published: "Facebook ยืนยันเผยแพร่แล้ว",
  needs_user_action: "ต้องตรวจสอบก่อนดำเนินการต่อ",
  failed: "เผยแพร่ไม่สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

function normalizedHashtags(value: string): string[] {
  return value.split(/\s+/).filter(Boolean).map(tag => `#${tag.replace(/^#+/, "")}`);
}

function safeFacebookPermalink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !["facebook.com", "www.facebook.com", "web.facebook.com", "m.facebook.com"].includes(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Optional downstream publishing; this card never starts a new render. */
export function FacebookReelsPublishCard(props: {
  runId: string;
  initialCaption?: string;
  initialHashtags?: string[];
}) {
  const [pageId, setPageId] = useState("");
  const [caption, setCaption] = useState(props.initialCaption ?? "");
  const [hashtags, setHashtags] = useState((props.initialHashtags ?? []).map(tag => `#${tag.replace(/^#+/, "")}`).join(" "));
  const [affiliateMode, setAffiliateMode] = useState<AffiliateMode>("description");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [commercialDisclosure, setCommercialDisclosure] = useState("");
  const [allowNoAffiliate, setAllowNoAffiliate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededRun, setSeededRun] = useState("");
  const [seededReadinessRun, setSeededReadinessRun] = useState("");
  const readiness = trpc.marketplaceAutoReviewReels.readiness.useQuery({ runId: props.runId }, { retry: false });
  const history = trpc.marketplaceAutoReviewReels.history.useQuery({ runId: props.runId }, {
    retry: false,
    refetchInterval: query => (query.state.data ?? []).some(item => IN_PROGRESS.has(String(item.status))) ? 5_000 : false,
  });
  const publish = trpc.marketplaceAutoReviewReels.publish.useMutation({
    onSuccess: async () => {
      setError(null);
      await history.refetch();
    },
    onError: () => setError("ส่งงานเผยแพร่ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและสถานะด้านล่างก่อนลองอีกครั้ง"),
  });
  const reconcile = trpc.marketplaceAutoReviewReels.reconcile.useMutation({
    onSuccess: async () => { await history.refetch(); },
    onError: () => setError("ตรวจสถานะ Reel กับ Facebook ไม่สำเร็จ กรุณาลองใหม่ภายหลัง"),
  });
  const resume = trpc.marketplaceAutoReviewReels.resume.useMutation({
    onSuccess: async () => { setError(null); await history.refetch(); },
    onError: () => setError("ส่งงาน resume ไม่สำเร็จ กรุณาตรวจสถานะกับ Facebook ก่อนลองใหม่"),
  });

  useEffect(() => {
    if (seededRun === props.runId) return;
    setSeededRun(props.runId);
    setCaption(props.initialCaption ?? "");
    setHashtags((props.initialHashtags ?? []).map(tag => `#${tag.replace(/^#+/, "")}`).join(" "));
    setPageId("");
    setAffiliateMode("description");
    setAllowNoAffiliate(false);
    setAiGenerated(false);
    setCommercialDisclosure("");
    setError(null);
  }, [props.runId, props.initialCaption, props.initialHashtags, seededRun]);

  useEffect(() => {
    if (seededReadinessRun === props.runId || !readiness.data || !("savedCaption" in readiness.data)) return;
    setSeededReadinessRun(props.runId);
    if (typeof readiness.data.savedCaption === "string") setCaption(readiness.data.savedCaption);
    if ("savedHashtags" in readiness.data && Array.isArray(readiness.data.savedHashtags)) {
      setHashtags(readiness.data.savedHashtags.join(" "));
    }
  }, [props.runId, readiness.data, seededReadinessRun]);

  const pages = readiness.data?.pages ?? [];
  const selectedPage = pages.find(page => String(page.id) === pageId);
  const parsedHashtags = useMemo(() => normalizedHashtags(hashtags), [hashtags]);
  const invalidHashtags = parsedHashtags.length > 20 || parsedHashtags.some(tag => !/^#[\p{L}\p{N}_]{1,80}$/u.test(tag));
  const activePublication = (history.data ?? []).some(item => IN_PROGRESS.has(String(item.status)) || String(item.status) === "needs_user_action");
  const noLinkConfirmed = affiliateMode !== "none" || allowNoAffiliate;
  const disclosureReady = Boolean(commercialDisclosure.trim());
  const canPublish = Boolean(
    readiness.data?.ready && selectedPage?.publishingReady && caption.trim() &&
    caption.length <= 2000 && commercialDisclosure.length <= 500 && !invalidHashtags &&
    (affiliateMode === "description" ? readiness.data?.hasAffiliateLink : affiliateMode === "none") &&
    noLinkConfirmed && disclosureReady && !activePublication && !history.isLoading && !history.isError && !publish.isPending
  );
  const canPrepareManualHandoff = Boolean(
    affiliateMode === "manual_native" && readiness.data?.ready && selectedPage?.publishingReady &&
    caption.trim() && caption.length <= 2000 && commercialDisclosure.trim() && !invalidHashtags &&
    !activePublication && !history.isLoading && !history.isError && !publish.isPending
  );

  const submit = () => {
    if (!canPublish && !canPrepareManualHandoff) return;
    publish.mutate({
      runId: props.runId,
      pageId: Number(pageId),
      snapshot: {
        caption,
        hashtags: parsedHashtags,
        affiliateMode,
        aiGenerated,
        commercialDisclosure,
        ...(affiliateMode === "none" ? { allowNoAffiliate } : {}),
      },
    });
  };

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={3}>เผยแพร่ Facebook Reel</Heading>
        <Text type="supporting" color="secondary">
          ใช้วิดีโอสุดท้ายที่ผ่านการตรวจและบันทึกใน Library แล้ว ตรวจข้อความและการเปิดเผยข้อมูลก่อนส่งเผยแพร่
        </Text>
        {readiness.isLoading ? <Text>กำลังตรวจความพร้อมเผยแพร่</Text> : null}
        {readiness.isError ? (
          <Banner title="ยังเปิดใช้ Facebook Publishing ไม่ได้" collapsible={false}>
            <Text>ตรวจการเปิดใช้ Meta Channels และเชื่อมต่อ Facebook Page ในหน้าตั้งค่า Social Channels</Text>
            <Link href="/social/channels">ไปที่ Social Channels</Link>
          </Banner>
        ) : null}
        {readiness.data && !readiness.data.ready ? (
          <Banner title="ยังไม่พร้อมเผยแพร่" collapsible={false}>
            <Text>{readiness.data.reason || "ตรวจวิดีโอสุดท้ายและการเชื่อมต่อ Facebook Page"}</Text>
          </Banner>
        ) : null}
        <Selector
          label="Facebook Page"
          options={pages.map(page => ({ value: String(page.id), label: page.label, disabled: !page.publishingReady, description: page.publishingIssue ?? undefined }))}
          value={pageId}
          onChange={setPageId}
          placeholder="เลือก Page ที่จะเผยแพร่"
          emptyText="ยังไม่มี Page ที่เปิดใช้การเผยแพร่"
          isDisabled={!pages.length}
          width="100%"
        />
        <TextArea label="Caption สำหรับ Reel" value={caption} onChange={setCaption} rows={4} maxLength={2000} width="100%" />
        <TextArea label="Hashtag" value={hashtags} onChange={setHashtags} rows={2} width="100%" />
        {invalidHashtags ? <Text>ใช้ hashtag สูงสุด 20 รายการ โดยคั่นแต่ละรายการด้วยช่องว่าง</Text> : null}
        <Selector
          label="วิธีใส่ Affiliate link"
          value={affiliateMode}
          onChange={value => { setAffiliateMode(value as AffiliateMode); setAllowNoAffiliate(false); }}
          options={[
            { value: "description", label: "ใส่ Affiliate URL ในคำอธิบาย", disabled: !readiness.data?.hasAffiliateLink },
            { value: "first_comment", label: "ใส่ในความคิดเห็นแรก (ยังไม่พร้อม)", disabled: true },
            { value: "manual_native", label: "ติดแท็กสินค้าผ่าน Facebook ด้วยตนเอง" },
            { value: "none", label: "เผยแพร่โดยไม่ใส่ Affiliate link" },
          ]}
          width="100%"
        />
        <Text type="supporting" color="secondary">
          URL ในคำอธิบายยังไม่ได้รับการยืนยันว่าคลิกได้หรือระบุยอดขายได้ การใส่ URL ในความคิดเห็นแรกยังรอตรวจสิทธิ์ Meta
        </Text>
        {affiliateMode === "manual_native" ? (
          <Banner title="ดำเนินการติดแท็กสินค้าใน Facebook ด้วยตนเอง" collapsible={false}>
            <Text>การติดแท็กสินค้าแบบ Native ยังไม่มี API ที่ยืนยันว่าใช้ได้ กรุณาใช้เครื่องมือของ Facebook</Text>
          </Banner>
        ) : null}
        {affiliateMode === "none" ? (
          <CheckboxInput label="ยืนยันเผยแพร่โดยไม่ใส่ Affiliate link" value={allowNoAffiliate} onChange={setAllowNoAffiliate} />
        ) : null}
        <TextArea
          label="ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"
          value={commercialDisclosure}
          onChange={setCommercialDisclosure}
          rows={2}
          maxLength={500}
          width="100%"
          placeholder="ระบุข้อความเปิดเผยที่เหมาะสมกับโพสต์"
        />
        <CheckboxInput label="วิดีโอนี้สร้างหรือดัดแปลงด้วย AI" value={aiGenerated} onChange={setAiGenerated} />
        <Text type="supporting" color="secondary">การระบุ AI แยกจากการเปิดเผยความสัมพันธ์เชิงพาณิชย์</Text>
        <Heading level={4}>ตัวอย่างข้อความ</Heading>
        <Text>{[caption, parsedHashtags.join(" "), commercialDisclosure].filter(Boolean).join("\n\n") || "ยังไม่มีข้อความ"}</Text>
        {affiliateMode === "description" && readiness.data?.hasAffiliateLink ? <Text>ระบบจะเพิ่ม Affiliate URL ที่บันทึกไว้พร้อม tracking เดิมในคำอธิบาย</Text> : null}
        {error ? <Banner title="ส่งงานไม่สำเร็จ" collapsible={false}><Text>{error}</Text></Banner> : null}
        <HStack hAlign="end">
          <Button label={affiliateMode === "manual_native" ? "เตรียมส่งต่อให้ติดแท็กใน Facebook" : "เผยแพร่ Reel"} variant="primary" isLoading={publish.isPending} isDisabled={!canPublish && !canPrepareManualHandoff} onClick={submit} />
        </HStack>
        <Heading level={4}>สถานะและประวัติการเผยแพร่</Heading>
        {history.isLoading ? <Text>กำลังโหลดประวัติ</Text> : null}
        {history.isError ? <Text>โหลดประวัติไม่สำเร็จ กรุณาลองใหม่ก่อนส่งงาน</Text> : null}
        {!history.isLoading && !history.isError && !history.data?.length ? <Text type="supporting" color="secondary">ยังไม่มีประวัติการเผยแพร่</Text> : null}
        {(history.data ?? []).map(item => {
          const permalink = safeFacebookPermalink(item.permalink);
          const status = String(item.status);
          return (
            <VStack key={item.id} gap={1}>
              <Text type="label">{STATUS_LABELS[status] ?? status}</Text>
              <Text type="supporting">Affiliate: {String(item.affiliateLinkStatus)} · การเปิดเผยเชิงพาณิชย์: {String(item.commercialDisclosureStatus)} · การระบุยอดขาย: {String(item.attributionVerificationStatus)}</Text>
              {item.providerPostId ? <Text type="supporting">Facebook ID: {item.providerPostId}</Text> : null}
              {item.errorMessage ? <Text>{item.errorMessage}</Text> : null}
              {["needs_user_action", "reconciling"].includes(status) ? <Text>Facebook อาจได้รับคำขอแล้ว กรุณาตรวจสถานะก่อนส่งซ้ำเพื่อป้องกันโพสต์ซ้ำ</Text> : null}
              {item.manualHandoff && typeof item.manualHandoff === "object" ? (
                <VStack gap={1}>
                  <Text>{String((item.manualHandoff as Record<string, unknown>).instructions ?? "ไปที่ Library แล้วดำเนินการติดแท็กสินค้าผ่าน Facebook ด้วยตนเอง")}</Text>
                  {(item.manualHandoff as Record<string, unknown>).libraryItemId ? <Text type="supporting">Library item ID: {String((item.manualHandoff as Record<string, unknown>).libraryItemId)}</Text> : null}
                  <Link href="/library">เปิด Library</Link>
                </VStack>
              ) : null}
              {item.canReconcile && status !== "published" ? (
                <Button label="ตรวจสถานะกับ Facebook" variant="secondary" isLoading={reconcile.isPending} onClick={() => reconcile.mutate({ postId: item.id })} />
              ) : null}
              {item.canResume ? (
                <Button label="ดำเนินการอัปโหลดต่ออย่างปลอดภัย" variant="secondary" isLoading={resume.isPending} onClick={() => resume.mutate({ postId: item.id })} />
              ) : null}
              {permalink ? <Link href={permalink} target="_blank">ดู Reel บน Facebook</Link> : null}
            </VStack>
          );
        })}
      </VStack>
    </Card>
  );
}
