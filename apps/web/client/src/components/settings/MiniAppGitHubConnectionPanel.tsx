import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";

export function MiniAppGitHubConnectionPanel() {
  const utils = trpc.useUtils();
  const connection = trpc.userGithubConnections.get.useQuery();
  const oauthFailed = new URLSearchParams(window.location.search).get("github") === "error";
  const disconnect = trpc.userGithubConnections.disconnect.useMutation({
    onSuccess: () => {
      toast.success("ยกเลิกการเชื่อม GitHub แล้ว");
      utils.userGithubConnections.get.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <DashboardCard
      title="Mini-App source repository"
      description="เชื่อม GitHub เพื่อสร้าง private repository แยกต่อ Mini-App หลังจากบันทึก source snapshot แล้ว การสร้างและทดสอบ preview ทำได้แม้ยังไม่เชื่อม GitHub"
    >
      <section aria-label="Mini-App GitHub connection" className="space-y-4">
        {connection.isLoading ? <p role="status">กำลังตรวจสอบสถานะ GitHub…</p> : null}
        {connection.isError ? <p role="alert">โหลดสถานะ GitHub ไม่สำเร็จ ลองโหลดหน้านี้ใหม่</p> : null}
        {oauthFailed ? <p role="alert">เชื่อม GitHub ไม่สำเร็จ: ให้ผู้ดูแลตั้งค่า GitHub Client ID, Client Secret และ Mini-App callback URI ในเมนู Admin Settings / OAuth ก่อน แล้วลองใหม่</p> : null}
        {connection.data?.configured ? (
          <p role="status">เชื่อมต่อเป็น @{connection.data.githubLogin}</p>
        ) : (
          <p>ยังไม่ได้เชื่อมต่อ GitHub; source snapshot จะถูกเก็บไว้และ preview ยังทดสอบได้</p>
        )}
        <p className="text-sm text-muted-foreground">
          เชื่อมผ่านหน้า GitHub โดยตรง GitHub จะแสดงสิทธิ์ repo ที่ระบบต้องใช้สร้างและอัปเดต private repository ในนามคุณ ระบบจะไม่ขอให้คัดลอก token มาใส่ใน SmartAIHub
        </p>
        <Button type="button" disabled={connection.isLoading} onClick={() => window.location.assign("/api/oauth/github/miniapp/connect")}>
          {connection.data?.configured ? "เชื่อมบัญชี GitHub ใหม่" : "เชื่อมต่อด้วย GitHub"}
        </Button>
        {connection.data?.configured ? (
          <Button type="button" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {disconnect.isPending ? "กำลังยกเลิก…" : "ยกเลิกการเชื่อมต่อ"}
          </Button>
        ) : null}
      </section>
    </DashboardCard>
  );
}
