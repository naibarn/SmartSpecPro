import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

type ExtensionDeliveryStatus = "idle" | "sending" | "sent" | "manual" | "failed";

export default function MarketplaceCaptureConnect() {
  const [origin, setOrigin] = useState(() => new URLSearchParams(window.location.search).get("origin") ?? "");
  const [deviceId] = useState(() => new URLSearchParams(window.location.search).get("deviceId") ?? "");
  const [deliveryStatus, setDeliveryStatus] = useState<ExtensionDeliveryStatus>("idle");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const { user } = useAuth();
  const { tenant } = useTenant();
  const brandName = tenant?.name || "SmartAIHub";
  const extensionId = origin.match(/^chrome-extension:\/\/([^/]+)$/)?.[1] ?? "";
  const sendTokenToExtension = async (data: { accessToken: string; expiresAt: string }) => {
    if (!extensionId) {
      setDeliveryStatus("manual");
      setDeliveryMessage("ไม่พบ Extension ID กรุณาคัดลอก token ไปวางใน extension เอง");
      return;
    }
    const runtime = (window as any).chrome?.runtime;
    if (!runtime?.sendMessage) {
      setDeliveryStatus("manual");
      setDeliveryMessage("เบราว์เซอร์ไม่อนุญาตให้ส่ง token เข้า extension อัตโนมัติ กรุณาคัดลอก token ไปวางเอง");
      return;
    }
    setDeliveryStatus("sending");
    await new Promise<void>((resolve) => {
      runtime.sendMessage(extensionId, {
        type: "SMARTAIHUB_MARKETPLACE_EXTENSION_TOKEN",
        accessToken: data.accessToken,
        expiresAt: data.expiresAt,
        baseUrl: window.location.origin,
        deviceId,
      }, (response: any) => {
        const lastError = runtime.lastError;
        if (lastError || !response?.ok) {
          setDeliveryStatus("failed");
          setDeliveryMessage(lastError?.message || response?.error || "ส่ง token เข้า extension ไม่สำเร็จ");
        } else {
          setDeliveryStatus("sent");
          setDeliveryMessage("เชื่อมต่อ extension สำเร็จแล้ว กลับไปที่ side panel ได้เลย");
        }
        resolve();
      });
    });
  };
  const tokenMutation = trpc.marketplaceCapture.issueExtensionToken.useMutation({
    onSuccess: (data) => {
      sendTokenToExtension(data).catch((error) => {
        setDeliveryStatus("failed");
        setDeliveryMessage(error?.message || "ส่ง token เข้า extension ไม่สำเร็จ");
      });
    },
  });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-medium text-slate-500">{brandName}</p>
          <h1 className="text-3xl font-semibold">Marketplace Capture Connect</h1>
          <p className="mt-2 text-slate-600">
            สร้าง short-lived token สำหรับ Chrome Extension เท่านั้น ไม่ต้องใส่ Shopee/TikTok cookie หรือ password
          </p>
        </header>

        <section className="rounded-lg border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Chrome Extension</h2>
              <p className="mt-1 text-sm text-slate-600">
                ดาวน์โหลด build ล่าสุด แล้วติดตั้งแบบ Load unpacked ใน Chrome Extensions
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>ดาวน์โหลดไฟล์ zip และแตกไฟล์ในเครื่อง</li>
                <li>เปิด <span className="font-mono text-xs">chrome://extensions</span></li>
                <li>เปิด Developer mode แล้วเลือก Load unpacked</li>
                <li>เลือกโฟลเดอร์ที่แตกไฟล์ไว้ แล้วกลับมากด Generate extension token</li>
              </ol>
            </div>
            <a
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              href="/extension/smartspecpro-marketplace-extension.zip"
              download
            >
              Download extension
            </a>
          </div>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Extension origin</label>
          <input
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="chrome-extension://..."
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          />
          <button
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={tokenMutation.isPending || deliveryStatus === "sending" || !deviceId}
            onClick={() => tokenMutation.mutate({ origin: origin || undefined, extensionId: extensionId || undefined, deviceId: deviceId || undefined })}
          >
            {deliveryStatus === "sending" ? "Connecting extension..." : "Generate extension token"}
          </button>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p>
              Token จะออกให้บัญชีที่ login อยู่ตอนนี้:
              {" "}
              <span className="font-medium text-slate-900">{user?.email || user?.name || `User #${user?.id ?? ""}`}</span>
            </p>
            {extensionId ? (
              <p className="mt-1">
                Extension ID:
                {" "}
                <span className="font-mono text-xs text-slate-700">{extensionId}</span>
              </p>
            ) : null}
            {deviceId ? (
              <p className="mt-1">
                Device binding:
                {" "}
                <span className="font-mono text-xs text-slate-700">{deviceId.slice(0, 14)}...{deviceId.slice(-8)}</span>
              </p>
            ) : (
              <p className="mt-1 text-amber-700">
                ไม่พบ device binding กรุณากด Connect จาก extension บนเครื่องนี้อีกครั้ง
              </p>
            )}
            <p className="mt-1">
              เชื่อมต่อกับ workspace:
              {" "}
              <span className="font-medium text-slate-900">{brandName}</span>
            </p>
          </div>
        </section>

        {tokenMutation.data ? (
          <section className="rounded-lg border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Token ready</h2>
            <p className="mt-1 text-sm text-slate-600">หมดอายุ: {tokenMutation.data.expiresAt}</p>
            {deliveryStatus !== "idle" ? (
              <p className={`mt-2 rounded-md border p-3 text-sm ${
                deliveryStatus === "sent"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : deliveryStatus === "failed"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                {deliveryMessage}
              </p>
            ) : null}
            <textarea
              className="mt-3 h-36 w-full rounded-md border bg-slate-50 p-3 font-mono text-xs"
              readOnly
              value={tokenMutation.data.accessToken}
            />
            <p className="mt-3 text-sm text-amber-700">
              ใช้ token นี้เฉพาะใน extension ของคุณสำหรับ {brandName} และ revoke/สร้างใหม่เมื่อไม่ใช้งานแล้ว
            </p>
          </section>
        ) : null}

        {tokenMutation.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {tokenMutation.error.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
