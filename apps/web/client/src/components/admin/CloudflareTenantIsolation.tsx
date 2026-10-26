import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function CloudflareTenantIsolation({ hideAction = false, ...scope }: { tenantId: string; projectId: string; jobId: string; hideAction?: boolean }) {
  const { i18n } = useTranslation();
  const th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const inFlight = useRef(false);
  const preflight = trpc.infrastructure.getCloudflareProductionTenantIsolationPreflight.useQuery(scope, { retry: false, staleTime: 30_000 });
  const prepare = trpc.infrastructure.prepareCloudflareProductionTenantIsolation.useMutation({ onSettled: () => { void preflight.refetch(); } });
  const ready = preflight.data?.ready === true && !preflight.data.prepared;
  const submit = async () => {
    if (inFlight.current || !preflight.data?.ready || preflight.data.prepared) return;
    inFlight.current = true;
    try { await prepare.mutateAsync({ ...scope, actionDigest: preflight.data.actionDigest }); }
    catch { /* Exact sanitized failure remains visible; transaction is atomic. */ }
    finally { inFlight.current = false; }
  };
  return <VStack as="section" gap={2} aria-label={text("Production tenant isolation acceptance", "ตรวจรับการแยก tenant Production")}>
    <Heading level={3}>{text("Finish database tenant isolation", "ตรวจการแยกข้อมูล tenant ของฐานข้อมูล")}</Heading>
    <Text>{text("The existing Hyperdrive login currently has column restrictions. This action also restricts its rows to this exact tenant and requires transaction-local tenant context.",
      "Hyperdrive เดิมจำกัดสิทธิ์คอลัมน์แล้ว ขั้นนี้จะเพิ่ม RLS ให้ role เดิมอ่านหรือเขียนได้เฉพาะ tenant นี้ และต้องมี tenant context ภายใน transaction")}</Text>
    {preflight.data?.ready && !preflight.data.prepared ? <>
      <Text>{text("Restricted role", "Role ที่จำกัดสิทธิ์")}: <code>{preflight.data.plan.role}</code> · {text("Tenant", "Tenant")}: <code>{scope.tenantId}</code></Text>
      <Text>{text("Create six synthetic rows in the three intake tables, test only those IDs through Cloudflare, and keep customer rows and production traffic unchanged.",
        "สร้างข้อมูลสังเคราะห์ 6 แถวใน 3 ตารางของ intake และทดสอบเฉพาะ ID เหล่านี้ผ่าน Cloudflare ไม่อ่านหรือแก้ข้อมูลธุรกิจ และไม่เปลี่ยน traffic")}</Text>
      {preflight.data.plan.createInactiveTestTenant ? <Text>{text("One inactive test tenant will be created for the cross-tenant negative checks.", "จะสร้าง test tenant ที่ปิดใช้งาน 1 รายการสำหรับตรวจการปฏิเสธข้อมูลข้าม tenant")}</Text> : null}
    </> : null}
    {preflight.data?.ready && preflight.data.prepared ? <Text role="status">{text("Fixture preparation recorded. Ready for the independent Cloudflare SQL isolation check; no provisioning retry is needed.",
      "บันทึกการเตรียมข้อมูลทดสอบแล้ว พร้อมตรวจ SQL แยก tenant จาก Cloudflare โดยไม่ต้อง retry provisioning")}</Text> : null}
    {!preflight.data?.ready ? <Text role="status">{preflight.isLoading ? text("Checking exact database scope…", "กำลังตรวจ scope ฐานข้อมูล…")
      : preflight.data?.reason ?? preflight.error?.message ?? "M1_ISOLATION_PREFLIGHT_UNAVAILABLE"}</Text> : null}
    {!hideAction ? <Button type="button" disabled={!ready || prepare.isPending} onClick={() => void submit()}>
      {prepare.isPending ? text("Preparing tenant isolation…", "กำลังเตรียมการแยก tenant…")
        : text("Authorize tenant isolation and M1 synthetic fixtures", "อนุมัติการแยก tenant และข้อมูลทดสอบ M1")}
    </Button> : null}
    {prepare.error ? <Text role="alert">{prepare.error.message}</Text> : null}
  </VStack>;
}
