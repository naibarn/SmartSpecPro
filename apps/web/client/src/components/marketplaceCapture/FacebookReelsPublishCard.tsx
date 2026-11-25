import { useEffect, useMemo, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";

import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { trpc } from "@/lib/trpc";

type AffiliateMode = "description" | "first_comment" | "manual_native" | "none";

const IN_PROGRESS = new Set([
  "queued", "preflight", "token_check", "uploading", "processing",
  "publish_requested", "reconciling",
]);
const PHOTO_IN_PROGRESS = new Set(["queued", "uploading", "publish_requested", "reconciling"]);
const PHOTO_VARIANT_LABELS: Record<string, string> = {
  caption_source: "ภาพจาก Caption",
  character_reference: "ภาพอ้างอิงตัวละคร",
  product_reference: "ภาพอ้างอิงสินค้า",
};

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
  const [format, setFormat] = useState<"reel" | "photo">("reel");
  const [photoVariant, setPhotoVariant] = useState("caption_source");
  const [affiliateMode, setAffiliateMode] = useState<AffiliateMode>("description");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [commercialDisclosure, setCommercialDisclosure] = useState("");
  const [allowNoAffiliate, setAllowNoAffiliate] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const photoReadiness = trpc.marketplaceAutoReviewPhotoPosts.readiness.useQuery({ runId: props.runId }, { retry: false });
  const photoHistory = trpc.marketplaceAutoReviewPhotoPosts.history.useQuery({ runId: props.runId }, {
    retry: false,
    refetchInterval: query => (query.state.data ?? []).some(item => PHOTO_IN_PROGRESS.has(String(item.status))) ? 5_000 : false,
  });
  const publishPhoto = trpc.marketplaceAutoReviewPhotoPosts.publish.useMutation({
    onSuccess: async () => { setError(null); await photoHistory.refetch(); },
    onError: () => setError("ส่งงาน Photo Post ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและสถานะด้านล่างก่อนลองอีกครั้ง"),
  });
  const reconcilePhoto = trpc.marketplaceAutoReviewPhotoPosts.reconcile.useMutation({
    onSuccess: async () => { await photoHistory.refetch(); },
    onError: () => setError("ตรวจสถานะ Photo Post กับ Facebook ไม่สำเร็จ กรุณาลองใหม่ภายหลัง"),
  });

  const caption = props.initialCaption?.trim()
    ? props.initialCaption
    : readiness.data?.savedCaption ?? photoReadiness.data?.savedCaption ?? props.initialCaption ?? "";
  const sourceHashtags = props.initialHashtags?.length
    ? props.initialHashtags
    : readiness.data?.savedHashtags ?? photoReadiness.data?.savedHashtags ?? props.initialHashtags ?? [];
  const hashtags = sourceHashtags.map(tag => `#${tag.replace(/^#+/, "")}`).join(" ");

  useEffect(() => {
    setPageId("");
    setFormat("reel");
    setPhotoVariant("caption_source");
    setAffiliateMode("description");
    setAllowNoAffiliate(false);
    setAiGenerated(false);
    setCommercialDisclosure("");
    setError(null);
  }, [props.runId]);

  useEffect(() => {
    const firstReady = photoReadiness.data?.imageVariants.find(image => image.status === "completed");
    if (firstReady && !photoReadiness.data?.imageVariants.some(image => image.variant === photoVariant && image.status === "completed")) {
      setPhotoVariant(firstReady.variant);
    }
  }, [photoReadiness.data, photoVariant]);

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
  const readyPhotoVariants = photoReadiness.data?.imageVariants.filter(image => image.status === "completed" && image.imageUrl) ?? [];
  const selectedPhotoPage = (photoReadiness.data?.pages ?? []).find(page => String(page.id) === pageId);
  const photoHistoryHasUncertain = (photoHistory.data ?? []).some(item => ["needs_user_action", "reconciling", "publish_requested", "published"].includes(String(item.status)));
  const photoCanPublish = Boolean(
    photoReadiness.data?.featureEnabled && readyPhotoVariants.some(image => image.variant === photoVariant) && selectedPhotoPage?.publishingReady && caption.trim() && caption.length <= 2000 &&
    commercialDisclosure.trim() && commercialDisclosure.length <= 500 && !invalidHashtags &&
    (affiliateMode === "description" ? photoReadiness.data?.hasAffiliateLink : affiliateMode === "none" || affiliateMode === "manual_native") &&
    (affiliateMode !== "none" || allowNoAffiliate) && affiliateMode !== "first_comment" && !photoHistoryHasUncertain &&
    !photoHistory.isLoading && !photoHistory.isError && !publishPhoto.isPending
  );

  const publishSelectedPhoto = () => {
    if (!photoCanPublish) return;
    publishPhoto.mutate({
      runId: props.runId,
      pageId: Number(pageId),
      snapshot: { variant: photoVariant as "caption_source" | "character_reference" | "product_reference", caption, hashtags: parsedHashtags, affiliateMode, commercialDisclosure, ...(affiliateMode === "none" ? { allowNoAffiliate } : {}) },
    });
  };

  if (format === "photo") {
    return (
      <Card>
        <Collapsible defaultIsOpen trigger={<Text type="label">เผยแพร่บน Facebook · Marketplace Auto Review</Text>}>
          <VStack gap={3}>
            <Heading level={3}>เผยแพร่บน Facebook</Heading>
            <HStack>
              <Button label="Facebook Reel" variant="secondary" onClick={() => setFormat("reel")} />
              <Button label="Facebook Photo Post" variant="primary" onClick={() => setFormat("photo")} />
            </HStack>
            <Text type="supporting" color="secondary">เลือกรูปที่สร้างไว้แล้วเพียง 1 ภาพ ระบบไม่สร้างภาพหรือเรนเดอร์วิดีโอซ้ำ</Text>
            {photoReadiness.isLoading ? <Text>กำลังตรวจรูปและความพร้อมเผยแพร่</Text> : null}
            {photoReadiness.isError ? <Banner title="ตรวจความพร้อม Photo Post ไม่สำเร็จ" collapsible={false}><Text>กรุณาลองโหลดส่วนนี้ใหม่ก่อนเผยแพร่</Text></Banner> : null}
            {photoReadiness.data && !photoReadiness.data.featureEnabled ? <Banner title="ยังไม่ได้เปิด Meta Channels" collapsible={false}><Text>เปิดใช้ Meta Channels สำหรับ Workspace นี้ก่อนเผยแพร่</Text><Link href="/social/channels">ไปที่ Social Channels</Link></Banner> : null}
            {photoReadiness.data && !readyPhotoVariants.length ? <Banner title="ยังไม่มีรูปที่พร้อมเผยแพร่" collapsible={false}><Text>{photoReadiness.data.reason || "สร้างภาพรีวิวสินค้าให้เสร็จก่อน"}</Text></Banner> : null}
            {photoReadiness.data && readyPhotoVariants.length && !photoReadiness.data.pages.some(page => page.publishingReady) ? (
              <Banner title="ยังไม่พร้อมเผยแพร่" collapsible={false}>
                <Text>Facebook Page ยังไม่เชื่อมต่อหรือยังไม่มีสิทธิ์เผยแพร่ กรุณาเชื่อมต่อ Meta App และเลือก Page ก่อน</Text>
                <Link href="/social/channels">ไปที่ Social Channels</Link>
              </Banner>
            ) : null}
            {readyPhotoVariants.length ? (
              <RadioList label="เลือกรูปสำหรับ Facebook Photo Post" value={photoVariant} onChange={setPhotoVariant} orientation="vertical">
                {readyPhotoVariants.map(image => (
                  <RadioListItem key={image.variant} value={image.variant} label={PHOTO_VARIANT_LABELS[image.variant] ?? image.sourceLabel} description={
                    <AuthenticatedMediaImage src={image.imageUrl!} alt={image.sourceLabel} style={{ aspectRatio: "4 / 5", borderRadius: "var(--radius-md)", objectFit: "contain", width: "100%" }} />
                  } />
                ))}
              </RadioList>
            ) : null}
            <Selector
              label="Facebook Page"
              options={(photoReadiness.data?.pages ?? []).map(page => ({ value: String(page.id), label: page.label, disabled: !page.publishingReady, description: page.publishingIssue ?? undefined }))}
              value={pageId}
              onChange={setPageId}
              placeholder="เลือก Page ที่จะเผยแพร่"
              emptyText="ยังไม่มี Page ที่เปิดใช้การเผยแพร่"
              isDisabled={!(photoReadiness.data?.pages.length)}
              width="100%"
            />
            <VStack gap={1}>
              <Heading level={4}>เนื้อหาจาก Caption สำหรับโพสต์โซเชียล</Heading>
              <Text>Caption · {caption.trim() ? "Available" : "Not configured"}</Text>
              <Text>Hashtag · {parsedHashtags.length ? "Available" : "Not configured"}</Text>
              <Text type="supporting" color="secondary">ใช้ Caption และ Hashtag ที่บันทึกไว้ใน Auto Review โดยแก้ไขได้จากส่วน Caption สำหรับโพสต์โซเชียล</Text>
            </VStack>
            {invalidHashtags ? <Text>ใช้ hashtag สูงสุด 20 รายการ โดยคั่นแต่ละรายการด้วยช่องว่าง</Text> : null}
            <Selector
              label="ตำแหน่ง Affiliate Link เดิม"
              value={affiliateMode}
              onChange={value => { setAffiliateMode(value as AffiliateMode); setAllowNoAffiliate(false); }}
              options={[
                { value: "description", label: "แนบในคำอธิบายโพสต์", disabled: !photoReadiness.data?.hasAffiliateLink },
                { value: "first_comment", label: "ความคิดเห็นแรก (ยังไม่พร้อม)", disabled: true },
                { value: "manual_native", label: "นำไปติดแท็กผ่าน Facebook ด้วยตนเอง" },
                { value: "none", label: "ไม่ใส่ Affiliate link" },
              ]}
              width="100%"
            />
            <Text type="supporting" color="secondary">Affiliate Link เดิม: {photoReadiness.data?.hasAffiliateLink ? "Available" : "Not configured"} · ระบบใช้ URL ที่บันทึกไว้และคง tracking เดิม</Text>
            {affiliateMode === "none" ? <CheckboxInput label="ยืนยันเผยแพร่โดยไม่ใส่ Affiliate link" value={allowNoAffiliate} onChange={setAllowNoAffiliate} /> : null}
            <TextArea label="ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์" value={commercialDisclosure} onChange={setCommercialDisclosure} rows={2} maxLength={500} width="100%" placeholder="ระบุข้อความเปิดเผยที่เหมาะสมกับโพสต์" />
            <Banner title="ภาพนี้สร้างด้วย AI" collapsible={false}><Text>กรุณาตรวจและเปิดเผยตามข้อกำหนดของ Facebook ก่อนเผยแพร่ การเผยแพร่ภาพผ่าน API นี้ไม่มีช่องส่งค่า is_ai_generated โดยเฉพาะ</Text></Banner>
            {photoHistoryHasUncertain ? <Banner title="ต้องตรวจสอบสถานะก่อนส่งซ้ำ" collapsible={false}><Text>Facebook อาจได้รับคำขอแล้ว กรุณาตรวจประวัติด้านล่างก่อนสร้างโพสต์ใหม่</Text></Banner> : null}
            {error ? <Banner title="ส่งงานไม่สำเร็จ" collapsible={false}><Text>{error}</Text></Banner> : null}
            <HStack hAlign="end"><Button label={affiliateMode === "manual_native" ? "เตรียมข้อความและภาพสำหรับติดแท็กใน Facebook" : "เผยแพร่ Photo Post"} variant="primary" isLoading={publishPhoto.isPending} isDisabled={!photoCanPublish} onClick={publishSelectedPhoto} /></HStack>
            <Heading level={4}>สถานะและประวัติ Photo Post</Heading>
            {photoHistory.isLoading ? <Text>กำลังโหลดประวัติ</Text> : null}
            {photoHistory.isError ? <Text>โหลดประวัติไม่สำเร็จ กรุณาลองใหม่ก่อนส่งงาน</Text> : null}
            {!photoHistory.isLoading && !photoHistory.isError && !photoHistory.data?.length ? <Text type="supporting" color="secondary">ยังไม่มีประวัติ Photo Post</Text> : null}
            {(photoHistory.data ?? []).map(item => {
              const status = String(item.status);
              const permalink = safeFacebookPermalink(item.permalink);
              return <VStack key={item.id} gap={1}>
                <Text type="label">{PHOTO_VARIANT_LABELS[String(item.selectedVariant)] ?? "Facebook Photo Post"} · {STATUS_LABELS[status] ?? status}</Text>
                <Text type="supporting">Affiliate: {String(item.affiliateLinkStatus)} · การเปิดเผยเชิงพาณิชย์: {String(item.commercialDisclosureStatus)} · การระบุยอดขาย: {String(item.attributionVerificationStatus)}</Text>
                {item.providerPostId ? <Text type="supporting">Facebook ID: {item.providerPostId}</Text> : null}
                {item.errorMessage ? <Text>{item.errorMessage}</Text> : null}
                {item.manualHandoff && typeof item.manualHandoff === "object" ? <VStack gap={1}>
                  <Text>{String((item.manualHandoff as Record<string, unknown>).instructions ?? "ใช้ Facebook เพื่อเผยแพร่และติดแท็กสินค้าด้วยตนเอง")}</Text>
                  {(item.manualHandoff as Record<string, unknown>).imageUrl ? <AuthenticatedMediaImage src={String((item.manualHandoff as Record<string, unknown>).imageUrl)} alt="ภาพที่เตรียมไว้สำหรับ Facebook" style={{ aspectRatio: "4 / 5", borderRadius: "var(--radius-md)", objectFit: "contain", width: "100%" }} /> : null}
                  {(item.manualHandoff as Record<string, unknown>).affiliateUrl ? <Text>Affiliate URL: {String((item.manualHandoff as Record<string, unknown>).affiliateUrl)}</Text> : null}
                  <Link href="/library">เปิด Library</Link>
                </VStack> : null}
                {item.canReconcile && status !== "published" ? <Button label="ตรวจสถานะกับ Facebook" variant="secondary" isLoading={reconcilePhoto.isPending} onClick={() => reconcilePhoto.mutate({ postId: item.id })} /> : null}
                {permalink ? <Link href={permalink} target="_blank">ดู Photo Post บน Facebook</Link> : null}
              </VStack>;
            })}
          </VStack>
        </Collapsible>
      </Card>
    );
  }

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
      <Collapsible defaultIsOpen trigger={<Text type="label">เผยแพร่บน Facebook · Marketplace Auto Review</Text>}>
      <VStack gap={3}>
        <HStack>
          <Button label="Facebook Reel" variant="primary" onClick={() => setFormat("reel")} />
          <Button label="Facebook Photo Post" variant="secondary" onClick={() => setFormat("photo")} />
        </HStack>
        <Heading level={3}>เผยแพร่ Facebook Reel</Heading>
        <Text type="supporting" color="secondary">
          ใช้วิดีโอสุดท้ายที่ผ่านการตรวจและบันทึกใน Library แล้ว ระบบใช้ Caption และ Hashtag จากส่วน Caption สำหรับโพสต์โซเชียล
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
        <VStack gap={1}>
          <Heading level={4}>เนื้อหาจาก Caption สำหรับโพสต์โซเชียล</Heading>
          <Text>Caption · {caption.trim() ? "Available" : "Not configured"}</Text>
          <Text>Hashtag · {parsedHashtags.length ? "Available" : "Not configured"}</Text>
          <Text type="supporting" color="secondary">ใช้ Caption และ Hashtag ที่บันทึกไว้ใน Auto Review โดยแก้ไขได้จากส่วน Caption สำหรับโพสต์โซเชียล</Text>
        </VStack>
        <Selector
          label="ตำแหน่ง Affiliate Link เดิม"
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
          Affiliate Link: {readiness.data?.hasAffiliateLink ? "Available" : "Not configured"} · ใช้ URL ที่บันทึกไว้และคง tracking เดิม การคลิกและ Affiliate Attribution ต้องตรวจสอบกับ Meta อีกครั้ง
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
    </Collapsible>
    </Card>
  );
}
