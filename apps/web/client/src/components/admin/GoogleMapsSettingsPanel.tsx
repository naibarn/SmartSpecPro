import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import EmergencyPublicMap from "@/components/emergency/EmergencyPublicMap";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Map, RefreshCw, Save, ShieldAlert, XCircle } from "lucide-react";

type GoogleMapType = "roadmap" | "satellite" | "terrain";

type GeoMapForm = {
  primaryProvider: "google" | "maplibre";
  fallbackProvider: "maplibre" | "none";
  emergencyOfflineProvider: "pmtiles";
  googleEnabled: boolean;
  googleMapTypes: Record<GoogleMapType, boolean>;
  defaultBasemap: GoogleMapType;
  defaultCenter: { latitude: number; longitude: number };
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  mapLibreStyleUrl: string;
  failureThreshold: number;
  recoveryProbeIntervalSeconds: number;
  dailyWarningThreshold: number;
  monthlyWarningThreshold: number;
};

const mapTypeLabels: Record<GoogleMapType, { en: string; th: string }> = {
  roadmap: { en: "Roadmap", th: "แผนที่ถนน" },
  satellite: { en: "Satellite", th: "ภาพดาวเทียม" },
  terrain: { en: "Terrain", th: "ภูมิประเทศ" },
};

function googleMapsFailureGuidance(code: string | undefined, isThai: boolean): string {
  const messages: Record<string, { en: string; th: string }> = {
    GOOGLE_MAPS_CREDENTIALS_NOT_CONFIGURED: {
      en: "No saved server key was found. Enter the Google server API key and save settings first.",
      th: "ไม่พบ server key ที่บันทึกไว้ กรุณากรอก Google server API key แล้วบันทึกการตั้งค่าก่อน",
    },
    GOOGLE_MAPS_NO_BASEMAP_ENABLED: {
      en: "No Google basemap is enabled in the saved settings. Enable at least one map type, save settings, then test again.",
      th: "ค่าที่บันทึกไว้ยังไม่ได้เปิดแผนที่ Google สักประเภท ให้เปิดอย่างน้อยหนึ่งประเภท บันทึกการตั้งค่า แล้วทดสอบอีกครั้ง",
    },
    GOOGLE_MAPS_AUTHENTICATION_FAILED: {
      en: "Google rejected the key. In Cloud Console, enable Map Tiles API, confirm billing is active, and allow this server's public outbound IP under the key's IP restrictions. Restrict the key to Map Tiles API.",
      th: "Google ปฏิเสธ key: ตรวจว่าเปิด Map Tiles API และ billing แล้ว จากนั้นเพิ่ม public outbound IP ของเซิร์ฟเวอร์ใน IP restriction ของ key และจำกัด API ให้ใช้ Map Tiles API",
    },
    GOOGLE_MAPS_INVALID_API_KEY: {
      en: "Google reports this API key is invalid. Confirm the exact server key saved in Infrastructure → Maps belongs to this Google Cloud project and has not been deleted or rotated.",
      th: "Google แจ้งว่า API key ใช้ไม่ได้ ตรวจว่า server key ที่บันทึกใน Infrastructure → Maps เป็น key จาก Google Cloud project นี้ และยังไม่ถูกลบหรือเปลี่ยนใหม่",
    },
    GOOGLE_MAPS_API_NOT_ENABLED: {
      en: "Google reports Map Tiles API is not enabled for the key's project. Enable it in the same project that owns this key.",
      th: "Google แจ้งว่ายังไม่ได้เปิด Map Tiles API ใน project ของ key นี้ ให้เปิด API ใน project เดียวกับที่สร้าง key",
    },
    GOOGLE_MAPS_BILLING_NOT_ENABLED: {
      en: "Google reports billing is not enabled for the key's project. Link an active billing account to that same project.",
      th: "Google แจ้งว่า project ของ key ยังไม่ได้เปิด billing ให้ผูก billing account ที่ใช้งานได้กับ project เดียวกัน",
    },
    GOOGLE_MAPS_IP_RESTRICTION_FAILED: {
      en: "Google blocked this server's source IP. Confirm the backend process egresses from the IP address allowlisted on the key.",
      th: "Google ปฏิเสธ source IP ของเซิร์ฟเวอร์ ตรวจว่า backend ออกอินเทอร์เน็ตด้วย IP ที่เพิ่มไว้ใน key จริง",
    },
    GOOGLE_MAPS_APPLICATION_RESTRICTION_FAILED: {
      en: "Google reports an application restriction mismatch. This server key must use IP address restrictions, not website referrers.",
      th: "Google แจ้งว่า application restriction ไม่ตรง สำหรับ server key ให้ใช้การจำกัดตาม IP ไม่ใช่ website referrer",
    },
    GOOGLE_MAPS_API_RESTRICTION_FAILED: {
      en: "Google reports this key is not allowed to call Map Tiles API. Add Map Tiles API to this key's API restrictions.",
      th: "Google แจ้งว่า key นี้ไม่มีสิทธิ์เรียก Map Tiles API ให้เพิ่ม Map Tiles API ใน API restrictions ของ key",
    },
    GOOGLE_MAPS_QUOTA_EXHAUSTED: {
      en: "Google reports the Map Tiles quota or billing limit is exhausted. Check Map Tiles API quotas and billing in Cloud Console.",
      th: "โควตาหรือวงเงิน Map Tiles ของ Google เต็มแล้ว ตรวจ quota และ billing ของ Map Tiles API ใน Cloud Console",
    },
    GOOGLE_MAPS_REQUEST_REJECTED: {
      en: "Google rejected the request. Check the Map Tiles API is enabled and the key's API restrictions allow it.",
      th: "Google ไม่รับคำขอ ตรวจว่าเปิด Map Tiles API และ API restriction ของ key อนุญาต API นี้",
    },
    GOOGLE_MAPS_PROVIDER_UNAVAILABLE: {
      en: "Google Maps is temporarily unavailable. Retry shortly; if it persists, check server outbound connectivity and Google Maps Platform status.",
      th: "Google Maps ไม่พร้อมให้บริการชั่วคราว ลองใหม่ภายหลัง หากยังเกิดซ้ำให้ตรวจการเชื่อมต่อขาออกของเซิร์ฟเวอร์และสถานะ Google Maps Platform",
    },
    GOOGLE_MAPS_CIRCUIT_OPEN: {
      en: "Recent requests failed, so the provider is temporarily paused. Wait for the recovery probe interval, then retry.",
      th: "คำขอก่อนหน้าล้มเหลว ระบบจึงพักผู้ให้บริการชั่วคราว รอช่วง recovery probe แล้วลองใหม่",
    },
    MAP_SESSION_SIGNING_KEY_NOT_CONFIGURED: {
      en: "The server map-session signing key is missing or too short. Configure LLM_ENCRYPTION_KEY (at least 32 characters) for the web backend.",
      th: "ยังไม่ได้ตั้ง signing key สำหรับ map session หรือสั้นเกินไป ให้ตั้งค่า LLM_ENCRYPTION_KEY อย่างน้อย 32 ตัวอักษรใน web backend",
    },
    GOOGLE_MAPS_SESSION_RESPONSE_INVALID: {
      en: "Google returned an invalid map session. Check the enabled map type and Map Tiles API configuration.",
      th: "Google ส่ง map session กลับมาในรูปแบบไม่ถูกต้อง ตรวจประเภทแผนที่ที่เปิดใช้และการตั้งค่า Map Tiles API",
    },
    GOOGLE_MAPS_TILE_CHECK_FAILED: {
      en: "The tile request failed without a specific Google error. Check backend egress, key restrictions, and Map Tiles API configuration.",
      th: "คำขอ tile ล้มเหลวแต่ไม่มีรหัสสาเหตุจาก Google ตรวจการเชื่อมต่อขาออกของ backend, key restrictions และการตั้งค่า Map Tiles API",
    },
    GOOGLE_MAPS_SESSION_NOT_INITIALIZED: {
      en: "The server could not initialize a Google map session. Check the backend logs and map provider configuration.",
      th: "เซิร์ฟเวอร์เริ่ม Google map session ไม่สำเร็จ ตรวจ log ของ backend และการตั้งค่าผู้ให้บริการแผนที่",
    },
  };
  const message = code ? messages[code] : undefined;
  return message ? (isThai ? message.th : message.en) : (isThai
    ? "ตรวจ log ของ backend โดยใช้รหัสนี้ประกอบ (ไม่แสดง API key ในหน้าจอ)"
    : "Check backend logs using this code. API keys are not shown in this page.");
}

function toForm(value: GeoMapForm): GeoMapForm {
  return {
    ...value,
    googleMapTypes: { ...value.googleMapTypes },
    defaultCenter: { ...value.defaultCenter },
  };
}

export default function GoogleMapsSettingsPanel() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const text = (en: string, th: string) => isThai ? th : en;
  const { data, isLoading, refetch } = trpc.infrastructure.getGeoMapConfiguration.useQuery();
  const [form, setForm] = useState<GeoMapForm | null>(null);
  const [googleProjectId, setGoogleProjectId] = useState("");
  const [googleServerApiKey, setGoogleServerApiKey] = useState("");
  const [googleBrowserApiKey, setGoogleBrowserApiKey] = useState("");
  const [clearGoogleServerApiKey, setClearGoogleServerApiKey] = useState(false);
  const [clearGoogleBrowserApiKey, setClearGoogleBrowserApiKey] = useState(false);
  const [previewMapType, setPreviewMapType] = useState<GoogleMapType>("roadmap");
  const [previewCenter, setPreviewCenter] = useState<[number, number]>([100.5018, 13.7563]);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewItems, setPreviewItems] = useState<Array<Record<string, unknown>>>([]);
  const handlePreviewItemsChange = useCallback((items: Array<Record<string, unknown>>) => setPreviewItems(items), []);
  const [connectionResult, setConnectionResult] = useState<{
    credentials: "PASS" | "FAIL";
    mapTiles: Array<{ mapType: GoogleMapType; status: "PASS" | "FAIL"; error?: string; latencyMs?: number }>;
    optionalCapabilities: Record<string, "DISABLED">;
    checkedAt: string;
  } | null>(null);

  useEffect(() => {
    if (!data) return;
    const initialForm = toForm(data.settings);
    if (initialForm.primaryProvider === "google") initialForm.googleEnabled = true;
    if (initialForm.primaryProvider === "google" && initialForm.fallbackProvider === "maplibre" && !initialForm.mapLibreStyleUrl.trim()) {
      initialForm.fallbackProvider = "none";
    }
    setForm(initialForm);
    setGoogleProjectId(data.googleProjectId ?? "");
    setPreviewMapType(data.settings.defaultBasemap);
    setPreviewCenter([data.settings.defaultCenter.longitude, data.settings.defaultCenter.latitude]);
    setGoogleServerApiKey("");
    setGoogleBrowserApiKey("");
    setClearGoogleServerApiKey(false);
    setClearGoogleBrowserApiKey(false);
  }, [data]);

  const enabledMapTypes = useMemo(() => form
    ? (Object.keys(form.googleMapTypes) as GoogleMapType[]).filter((mapType) => form.googleMapTypes[mapType])
    : [], [form]);
  const defaultMapTypeEnabled = form ? form.googleMapTypes[form.defaultBasemap] : false;
  const hasGoogleServerKey = !!googleServerApiKey.trim() || (!!data?.googleServerKeyConfigured && !clearGoogleServerApiKey);
  const hasValidMapLibreStyle = (() => {
    if (!form?.mapLibreStyleUrl.trim()) return false;
    try { const url = new URL(form.mapLibreStyleUrl.trim()); return url.protocol === "https:" && !url.username && !url.password; }
    catch { return false; }
  })();
  const canSave = !!form
    && form.minZoom < form.maxZoom
    && form.defaultZoom >= form.minZoom
    && form.defaultZoom <= form.maxZoom
    && defaultMapTypeEnabled
    && (!form.googleEnabled || enabledMapTypes.length > 0)
    && (form.primaryProvider !== "google" || form.googleEnabled && hasGoogleServerKey)
    && (form.primaryProvider !== "maplibre" || hasValidMapLibreStyle)
    && (form.primaryProvider !== "google" || form.fallbackProvider !== "maplibre" || hasValidMapLibreStyle);

  const saveConfiguration = trpc.infrastructure.saveGeoMapConfiguration.useMutation({
    onSuccess: async () => {
      toast.success(text("Map provider settings saved.", "บันทึกการตั้งค่าผู้ให้บริการแผนที่แล้ว"));
      await refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const testConnection = trpc.infrastructure.testGeoMapGoogleConnection.useMutation({
    onSuccess: (result) => {
      setConnectionResult(result);
      const hasFailure = result.credentials === "FAIL" || result.mapTiles.some((tile) => tile.status === "FAIL");
      if (hasFailure) {
        const firstError = result.mapTiles.find((tile) => tile.status === "FAIL")?.error
          ?? (result.mapTiles.length === 0 ? "GOOGLE_MAPS_NO_BASEMAP_ENABLED" : "GOOGLE_MAPS_CREDENTIALS_NOT_CONFIGURED");
        toast.error(`${firstError}: ${googleMapsFailureGuidance(firstError, !!isThai)}`);
      }
      else toast.success(text("Google Maps connection check passed.", "การตรวจการเชื่อมต่อ Google Maps ผ่าน"));
    },
    onError: (error) => toast.error(error.message),
  });

  const updateForm = (update: (current: GeoMapForm) => GeoMapForm) => {
    setForm((current) => current ? update(current) : current);
  };
  const setMapType = (mapType: GoogleMapType, enabled: boolean) => {
    updateForm((current) => {
      if (!enabled && current.googleMapTypes[mapType] && enabledMapTypes.length === 1) return current;
      const googleMapTypes = { ...current.googleMapTypes, [mapType]: enabled };
      const nextDefault = !enabled && current.defaultBasemap === mapType
        ? (Object.keys(googleMapTypes) as GoogleMapType[]).find((candidate) => googleMapTypes[candidate]) ?? current.defaultBasemap
        : current.defaultBasemap;
      return { ...current, googleMapTypes, defaultBasemap: nextDefault };
    });
  };
  const numberUpdate = (field: "defaultZoom" | "minZoom" | "maxZoom" | "failureThreshold" | "recoveryProbeIntervalSeconds" | "dailyWarningThreshold" | "monthlyWarningThreshold", raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value)) updateForm((current) => ({ ...current, [field]: Math.trunc(value) }));
  };
  const updatePreview = () => {
    if (!form) return;
    setPreviewMapType(form.defaultBasemap);
    setPreviewCenter([form.defaultCenter.longitude, form.defaultCenter.latitude]);
    setPreviewKey((current) => current + 1);
  };

  if (isLoading || !form) return <HStack justify="center" paddingBlock={6}><Loader2 size={20} /></HStack>;

  const configuredGoogle = data?.googleServerKeyConfigured;
  const providerHealth = data?.providerHealth as { status?: "healthy" | "degraded" | "unavailable"; consecutiveFailures?: number; retryAfterSeconds?: number } | undefined;
  const healthIsGood = providerHealth?.status === "healthy";

  return <VStack as="section" gap={4}>
    <DashboardCard>
      <VStack as="header" gap={2}>
        <HStack gap={2} align="center" wrap="wrap">
          <Map size={20} />
          <h3>{text("Google Maps Platform & emergency map", "Google Maps Platform และแผนที่เหตุฉุกเฉิน")}</h3>
          <Badge variant={configuredGoogle ? "default" : "secondary"}>{configuredGoogle ? text("Server key configured", "ตั้งค่า server key แล้ว") : text("Server key not configured", "ยังไม่ได้ตั้งค่า server key")}</Badge>
          {providerHealth?.status ? <Badge variant={healthIsGood ? "default" : "secondary"}>{text("Google Maps circuit", "สถานะ Google Maps")}: {providerHealth.status}</Badge> : null}
        </HStack>
        <p>{text(
          "Google Map Tiles runs through the server-side, no-store proxy. The browser never receives the server API key. MapLibre remains the configured failover path.",
          "Google Map Tiles ทำงานผ่าน proxy ฝั่งเซิร์ฟเวอร์แบบ no-store โดย browser จะไม่ได้รับ server API key และ MapLibre เป็นเส้นทางสำรองตามที่ตั้งค่า"
        )}</p>
        <p>{text("These settings are platform-wide in the existing system_settings authority. Tenant-specific map overrides are not supported by the current settings hierarchy; tenant users cannot read this platform credential.", "การตั้งค่านี้เป็นระดับแพลตฟอร์มใน system_settings เดิม ลำดับการตั้งค่าปัจจุบันยังไม่รองรับ tenant override และผู้ใช้ tenant อ่าน credential ของแพลตฟอร์มไม่ได้")}</p>
        <p role="status">{text(
          "Use an IP-restricted server key for Map Tiles API. Confirm restrictions in Google Cloud Console before enabling Google as primary; this page cannot verify Google Cloud key restrictions.",
          "ใช้ server key ที่จำกัดตาม IP สำหรับ Map Tiles API และตรวจ restriction ใน Google Cloud Console ก่อนเปิด Google เป็นผู้ให้บริการหลัก หน้านี้ไม่สามารถยืนยัน restriction ของ key บน Google Cloud ได้"
        )}</p>
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={3}>
        <h4>{text("Google Cloud setup: API, billing, and key restrictions", "ตั้งค่า Google Cloud: API, billing และข้อจำกัดของ key")}</h4>
        <p className="text-sm">{text(
          "Complete these steps in Google Cloud before saving a key here. The backend server calls Google; visitors’ browsers never receive this key.",
          "ทำขั้นตอนเหล่านี้ใน Google Cloud ก่อนบันทึก key ที่นี่ ตัว backend เป็นผู้เรียก Google และ browser ของผู้เข้าชมจะไม่ได้รับ key นี้"
        )}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{text("Select or create a dedicated Google Cloud project. Record its Project ID and enter it in the field below.", "เลือกหรือสร้าง Google Cloud project สำหรับแผนที่ จด Project ID แล้วกรอกในช่องด้านล่าง")}</li>
          <li>{text("Link the project to an active Cloud Billing account. Map Tiles requests are billable; enabling the API alone does not activate billing.", "ผูก project กับ Cloud Billing account ที่ใช้งานได้ เพราะ Map Tiles มีค่าใช้จ่าย การเปิด API อย่างเดียวไม่ทำให้ billing พร้อม")}</li>
          <li>{text("In APIs & Services → Library, enable Map Tiles API (tile.googleapis.com). This map does not need Maps JavaScript, Places, Geocoding, Routes, or Street View APIs.", "ไปที่ APIs & Services → Library แล้วเปิด Map Tiles API (tile.googleapis.com) แผนที่นี้ไม่ต้องเปิด Maps JavaScript, Places, Geocoding, Routes หรือ Street View API")}</li>
          <li>{text("Create a server API key. Under Application restrictions choose IP addresses and allow the public outbound IP of the host running this web backend. Do not use website/referrer restrictions for this server-side key.", "สร้าง server API key ใน Application restrictions เลือก IP addresses แล้วอนุญาต public outbound IP ของเครื่องที่รัน web backend ห้ามใช้ Website/HTTP referrer restriction กับ server key นี้")}</li>
          <li>{text("Under API restrictions choose Restrict key and allow Map Tiles API only. Save the key, paste it into Server API key below, save settings, then run Test Google Maps connection.", "ใน API restrictions เลือก Restrict key และอนุญาตเฉพาะ Map Tiles API บันทึก key แล้ววางในช่อง Server API key ด้านล่าง จากนั้นบันทึกการตั้งค่าและกดทดสอบการเชื่อมต่อ Google Maps")}</li>
        </ol>
        <HStack gap={3} wrap="wrap" className="text-sm">
          <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noreferrer" className="underline">{text("Open Map Tiles API", "เปิดหน้า Map Tiles API")}</a>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline">{text("Open API credentials", "เปิดหน้า API credentials")}</a>
          <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="underline">{text("Open Cloud Billing", "เปิดหน้า Cloud Billing")}</a>
          <a href="https://developers.google.com/maps/api-security-best-practices" target="_blank" rel="noreferrer" className="underline">{text("Google key security guidance", "แนวทางรักษาความปลอดภัย key ของ Google")}</a>
        </HStack>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{text("Which Google Cloud permissions are needed?", "ต้องขอสิทธิ์ Google Cloud อะไรบ้าง?")}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{text("To enable Map Tiles API: Service Usage Admin (roles/serviceusage.serviceUsageAdmin) on the project.", "เพื่อเปิด Map Tiles API: Service Usage Admin (roles/serviceusage.serviceUsageAdmin) ใน project")}</li>
            <li>{text("To create or edit API keys: API Keys Admin (roles/serviceusage.apiKeysAdmin) on the project.", "เพื่อสร้างหรือแก้ API key: API Keys Admin (roles/serviceusage.apiKeysAdmin) ใน project")}</li>
            <li>{text("Only if billing needs to be linked: the operation requires Billing Account User on the billing account and Project Billing Manager on the project, or equivalent permissions. Ask the billing administrator to do this if you do not hold both roles.", "เฉพาะกรณีต้องผูก billing: ต้องมี Billing Account User ที่ billing account และ Project Billing Manager ที่ project หรือสิทธิ์เทียบเท่า หากไม่มีทั้งสองสิทธิ์ ให้ผู้ดูแล billing เป็นผู้ผูกให้")}</li>
            <li>{text("The running app needs no Google Cloud IAM role or service account for this flow; it uses the restricted server API key. The Browser API key field is unused and should stay blank.", "ตัวแอปไม่ต้องมี Google Cloud IAM role หรือ service account สำหรับวิธีนี้ เพราะใช้ server API key ที่จำกัดสิทธิ์ ช่อง Browser API key ยังไม่ได้ใช้และควรเว้นว่าง")}</li>
          </ul>
        </details>
        <p className="text-xs text-muted-foreground">{text(
          "If a key is rejected, verify the API restriction, the backend host’s actual outbound IP, project billing status, and that Map Tiles API is enabled. This app can test a tile request but cannot inspect Google Cloud IAM or key restrictions.",
          "หาก key ถูกปฏิเสธ ให้ตรวจ API restriction, outbound IP จริงของ backend, สถานะ billing ของ project และการเปิด Map Tiles API แอปนี้ทดสอบการขอ tile ได้ แต่ตรวจ IAM หรือ key restriction ใน Google Cloud แทนคุณไม่ได้"
        )}</p>
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={4}>
        <HStack gap={2} align="center"><KeyRound size={18} /><h4>{text("Credentials and project", "Credential และโปรเจกต์")}</h4></HStack>
        <VStack as="label" gap={1}>
          <Label htmlFor="geo-google-project-id">Google Cloud project ID</Label>
          <Input id="geo-google-project-id" value={googleProjectId} maxLength={256} onChange={(event) => setGoogleProjectId(event.target.value)} autoComplete="off" />
        </VStack>
        <HStack gap={3} wrap="wrap">
          <VStack as="label" gap={1} className="min-w-[18rem] flex-1">
            <Label htmlFor="geo-google-server-key">{text("Server API key", "Server API key")} {data?.googleServerKeyMasked ? `(${data.googleServerKeyMasked})` : ""}</Label>
            <Input id="geo-google-server-key" type="password" autoComplete="new-password" value={googleServerApiKey} maxLength={512}
              placeholder={configuredGoogle ? text("Leave blank to retain", "เว้นว่างเพื่อเก็บค่าเดิม") : text("Paste replacement key", "วาง key ที่ต้องการใช้")}
              onChange={(event) => { setGoogleServerApiKey(event.target.value); setClearGoogleServerApiKey(false); }} />
            <HStack gap={2} align="center"><Switch checked={clearGoogleServerApiKey} onCheckedChange={setClearGoogleServerApiKey} /><span>{text("Clear saved server key", "ลบ server key ที่บันทึกไว้")}</span></HStack>
          </VStack>
          <VStack as="label" gap={1} className="min-w-[18rem] flex-1">
            <Label htmlFor="geo-google-browser-key">{text("Browser API key (reserved)", "Browser API key (สงวนไว้)")} {data?.googleBrowserKeyMasked ? `(${data.googleBrowserKeyMasked})` : ""}</Label>
            <Input id="geo-google-browser-key" type="password" autoComplete="new-password" value={googleBrowserApiKey} maxLength={512}
              placeholder={data?.googleBrowserKeyConfigured ? text("Leave blank to retain", "เว้นว่างเพื่อเก็บค่าเดิม") : text("Optional; not used by Map Tiles", "ไม่บังคับ; Map Tiles ไม่ได้ใช้")}
              onChange={(event) => { setGoogleBrowserApiKey(event.target.value); setClearGoogleBrowserApiKey(false); }} />
            <HStack gap={2} align="center"><Switch checked={clearGoogleBrowserApiKey} onCheckedChange={setClearGoogleBrowserApiKey} /><span>{text("Clear saved browser key", "ลบ browser key ที่บันทึกไว้")}</span></HStack>
          </VStack>
        </HStack>
        <p className="text-xs text-muted-foreground">{text("Server key last updated", "อัปเดต server key ล่าสุด")}: {data?.googleServerKeyUpdatedAt ? new Date(data.googleServerKeyUpdatedAt).toLocaleString() : text("never", "ยังไม่เคย")}</p>
        <p>{text("The browser key is encrypted if stored, but it is not sent to public map pages and is not needed for the Map Tiles proxy.", "browser key จะถูกเข้ารหัสหากบันทึก แต่จะไม่ถูกส่งไปยังหน้าแผนที่สาธารณะและไม่จำเป็นสำหรับ Map Tiles proxy")}</p>
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={4}>
        <h4>{text("Provider routing and basemaps", "เส้นทางผู้ให้บริการและแผนที่ฐาน")}</h4>
        <HStack gap={3} wrap="wrap">
          <VStack as="label" gap={1} className="min-w-[14rem] flex-1">
            <Label>{text("Primary provider", "ผู้ให้บริการหลัก")}</Label>
            <Select value={form.primaryProvider} onValueChange={(value: "google" | "maplibre") => updateForm((current) => ({
              ...current,
              primaryProvider: value,
              googleEnabled: value === "google" ? true : current.googleEnabled,
              fallbackProvider: value === "google" && !current.mapLibreStyleUrl.trim() ? "none" : current.fallbackProvider,
            }))}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maplibre">MapLibre</SelectItem><SelectItem value="google">Google Map Tiles</SelectItem></SelectContent>
            </Select>
          </VStack>
          <VStack as="label" gap={1} className="min-w-[14rem] flex-1">
            <Label>{text("Fallback provider", "ผู้ให้บริการสำรอง")}</Label>
            <Select value={form.fallbackProvider} onValueChange={(value: "maplibre" | "none") => updateForm((current) => ({ ...current, fallbackProvider: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maplibre">MapLibre</SelectItem><SelectItem value="none">{text("No fallback", "ไม่มีเส้นทางสำรอง")}</SelectItem></SelectContent>
            </Select>
          </VStack>
          <VStack as="label" gap={1} className="min-w-[14rem] flex-1">
            <Label>{text("MapLibre style URL", "MapLibre style URL")}</Label>
            <Input value={form.mapLibreStyleUrl} type="url" maxLength={2048} placeholder="https://…/style.json" onChange={(event) => updateForm((current) => ({ ...current, mapLibreStyleUrl: event.target.value }))} />
          </VStack>
        </HStack>
        <HStack gap={2} align="center"><Switch checked={form.googleEnabled} disabled={form.primaryProvider === "google"} onCheckedChange={(googleEnabled) => updateForm((current) => ({ ...current, googleEnabled }))} /><strong>{text("Enable Google Map Tiles", "เปิดใช้ Google Map Tiles")}</strong></HStack>
        <HStack gap={4} wrap="wrap">
          {(Object.keys(mapTypeLabels) as GoogleMapType[]).map((mapType) => <HStack key={mapType} gap={2} align="center">
            <Switch checked={form.googleMapTypes[mapType]} disabled={form.googleMapTypes[mapType] && enabledMapTypes.length === 1} onCheckedChange={(enabled) => setMapType(mapType, enabled)} />
            <Label>{isThai ? mapTypeLabels[mapType].th : mapTypeLabels[mapType].en}</Label>
          </HStack>)}
          <VStack as="label" gap={1} className="min-w-[14rem]">
            <Label>{text("Default basemap", "แผนที่ฐานเริ่มต้น")}</Label>
            <Select value={form.defaultBasemap} onValueChange={(value: GoogleMapType) => updateForm((current) => ({ ...current, defaultBasemap: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{enabledMapTypes.map((mapType) => <SelectItem value={mapType} key={mapType}>{isThai ? mapTypeLabels[mapType].th : mapTypeLabels[mapType].en}</SelectItem>)}</SelectContent>
            </Select>
          </VStack>
        </HStack>
        <p>{text("PMTiles is registered as the emergency offline option, but no PMTiles package is available yet. This does not claim offline maps are ready.", "PMTiles ถูกระบุเป็นตัวเลือก offline สำหรับเหตุฉุกเฉิน แต่ยังไม่มี package PMTiles พร้อมใช้งาน จึงยังไม่อ้างว่าแผนที่ offline พร้อมแล้ว")}</p>
        {form.primaryProvider === "google" && form.fallbackProvider === "none" && <p role="status" className="text-sm text-amber-700">{text("Google Maps can be saved without a fallback. If Google is unavailable, the public map will be unavailable until Google recovers.", "บันทึก Google Maps โดยไม่มีผู้ให้บริการสำรองได้ หาก Google ใช้งานไม่ได้ หน้าแผนที่จะหยุดให้บริการจนกว่า Google จะกลับมาปกติ")}</p>}
        {form.primaryProvider === "google" && !hasGoogleServerKey && <p role="alert" className="text-sm text-destructive">{text("Enter a Google server API key above before saving Google as the primary provider.", "กรอก Google server API key ด้านบนก่อนบันทึก Google เป็นผู้ให้บริการหลัก")}</p>}
        {form.primaryProvider === "maplibre" && !hasValidMapLibreStyle && <p role="alert" className="text-sm text-destructive">{text("Enter a valid HTTPS MapLibre style URL before saving MapLibre as the primary provider.", "กรอก MapLibre style URL แบบ HTTPS ที่ถูกต้องก่อนบันทึก MapLibre เป็นผู้ให้บริการหลัก")}</p>}
        {form.primaryProvider === "google" && form.fallbackProvider === "maplibre" && !hasValidMapLibreStyle && <p role="alert" className="text-sm text-destructive">{text("To keep MapLibre as fallback, enter its valid HTTPS style URL; otherwise choose No fallback.", "หากต้องการใช้ MapLibre สำรอง ให้กรอก style URL แบบ HTTPS ที่ถูกต้อง หรือเลือกไม่มีผู้ให้บริการสำรอง")}</p>}
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={4}>
        <h4>{text("Default view, safeguards, and usage warning thresholds", "มุมมองเริ่มต้น การป้องกัน และเกณฑ์แจ้งเตือนการใช้งาน")}</h4>
        <HStack gap={3} wrap="wrap">
          <VStack as="label" gap={1}><Label>{text("Latitude", "ละติจูด")}</Label><Input type="number" min={-85} max={85} step="0.000001" value={form.defaultCenter.latitude} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateForm((current) => ({ ...current, defaultCenter: { ...current.defaultCenter, latitude: value } })); }} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Longitude", "ลองจิจูด")}</Label><Input type="number" min={-180} max={180} step="0.000001" value={form.defaultCenter.longitude} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateForm((current) => ({ ...current, defaultCenter: { ...current.defaultCenter, longitude: value } })); }} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Default zoom", "ระดับซูมเริ่มต้น")}</Label><Input type="number" min={2} max={20} value={form.defaultZoom} onChange={(event) => numberUpdate("defaultZoom", event.target.value)} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Minimum zoom", "ซูมต่ำสุด")}</Label><Input type="number" min={0} max={20} value={form.minZoom} onChange={(event) => numberUpdate("minZoom", event.target.value)} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Maximum zoom", "ซูมสูงสุด")}</Label><Input type="number" min={2} max={22} value={form.maxZoom} onChange={(event) => numberUpdate("maxZoom", event.target.value)} /></VStack>
        </HStack>
        <p>{text("The platform currently supports zoom bounds. Geographic pan bounds are intentionally not stored because the public provider contract has no geographic-bound field yet.", "ระบบปัจจุบันรองรับขอบเขตระดับซูม ส่วนขอบเขตการเลื่อนตามพื้นที่ยังไม่ถูกบันทึก เพราะสัญญา provider สำหรับ public map ยังไม่มีฟิลด์ geographic bounds")}</p>
        <HStack gap={3} wrap="wrap">
          <VStack as="label" gap={1}><Label>{text("Failures before failover", "จำนวนความล้มเหลวก่อนสลับผู้ให้บริการ")}</Label><Input type="number" min={1} max={10} value={form.failureThreshold} onChange={(event) => numberUpdate("failureThreshold", event.target.value)} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Recovery probe interval (seconds)", "ช่วงเวลาตรวจฟื้นตัว (วินาที)")}</Label><Input type="number" min={30} max={900} value={form.recoveryProbeIntervalSeconds} onChange={(event) => numberUpdate("recoveryProbeIntervalSeconds", event.target.value)} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Daily usage warning", "เกณฑ์แจ้งเตือนรายวัน")}</Label><Input type="number" min={0} value={form.dailyWarningThreshold} onChange={(event) => numberUpdate("dailyWarningThreshold", event.target.value)} /></VStack>
          <VStack as="label" gap={1}><Label>{text("Monthly usage warning", "เกณฑ์แจ้งเตือนรายเดือน")}</Label><Input type="number" min={0} value={form.monthlyWarningThreshold} onChange={(event) => numberUpdate("monthlyWarningThreshold", event.target.value)} /></VStack>
        </HStack>
        <p>{text("A value of 0 disables the saved threshold. Usage counters are process-local Prometheus telemetry; no durable daily/monthly alert or Google billing integration is active yet. Configure billing/quota limits in Google Cloud Console.", "ค่า 0 ปิดเกณฑ์ที่บันทึกไว้ ขณะนี้ usage counter เป็น Prometheus เฉพาะ process และยังไม่มีระบบแจ้งเตือนรายวัน/เดือนแบบ durable หรือ Google billing integration ให้ตั้ง billing/quota limit ที่ Google Cloud Console")}</p>
        {providerHealth?.consecutiveFailures ? <p role="status">{text("Recent failures", "ความล้มเหลวล่าสุด")}: {providerHealth.consecutiveFailures}{providerHealth.retryAfterSeconds ? ` · ${text("probe in", "ทดสอบอีกครั้งใน")} ${providerHealth.retryAfterSeconds}s` : ""}</p> : null}
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={3}>
        <HStack gap={2} align="center"><ShieldAlert size={18} /><h4>{text("Capabilities deliberately unavailable", "ความสามารถที่ตั้งใจปิดไว้")}</h4></HStack>
        <p>{text("Places, Geocoding, Routes, Street View, Elevation, 3D Tiles, data export, offline tile caching, and machine interpretation are disabled. This panel does not send requests to those APIs.", "Places, Geocoding, Routes, Street View, Elevation, 3D Tiles, การส่งออกข้อมูล, การ cache tile แบบ offline และการตีความข้อมูลด้วยเครื่อง ถูกปิดอยู่ หน้านี้จะไม่ส่งคำขอไปยัง API เหล่านี้")}</p>
        <HStack gap={2} wrap="wrap">{["Places", "Geocoding", "Routes", "Street View", "Elevation", "3D Tiles", "Offline PMTiles"].map((name) => <Badge key={name} variant="secondary">{name} · {text("Disabled", "ปิดอยู่")}</Badge>)}</HStack>
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={3}>
        <HStack gap={2} wrap="wrap">
          <Button onClick={() => saveConfiguration.mutate({ settings: form, googleProjectId: googleProjectId.trim(), googleServerApiKey: googleServerApiKey.trim() || undefined, googleBrowserApiKey: googleBrowserApiKey.trim() || undefined, clearGoogleServerApiKey, clearGoogleBrowserApiKey })} disabled={!canSave || saveConfiguration.isPending}>
            {saveConfiguration.isPending ? <Loader2 size={16} /> : <Save size={16} />}{text("Save map settings", "บันทึกการตั้งค่าแผนที่")}
          </Button>
          <Button variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
            {testConnection.isPending ? <Loader2 size={16} /> : <RefreshCw size={16} />}{text("Test saved Google connection", "ทดสอบการเชื่อมต่อ Google ที่บันทึกแล้ว")}
          </Button>
          <Button variant="outline" onClick={() => { void refetch(); }} disabled={isLoading}><RefreshCw size={16} />{text("Reload saved settings", "โหลดค่าที่บันทึกแล้ว")}</Button>
        </HStack>
        {!canSave ? <p role="status"><AlertTriangle size={16} /> {text("Set a valid zoom range, keep the default basemap enabled, and enable Google before choosing it as primary.", "ตั้งค่าช่วงซูมให้ถูกต้อง เปิดใช้แผนที่ฐานเริ่มต้น และเปิด Google ก่อนเลือกให้เป็นผู้ให้บริการหลัก")}</p> : null}
        {connectionResult ? <VStack as="section" gap={2}>
          <HStack gap={2} align="center">{connectionResult.credentials === "PASS" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<strong>{text("Saved credential", "Credential ที่บันทึก")}: {connectionResult.credentials}</strong><span>{new Date(connectionResult.checkedAt).toLocaleString()}</span></HStack>
          {connectionResult.mapTiles.length === 0 ? <p role="status">{text("No Google basemap is enabled in the saved configuration, so no tile test ran.", "ยังไม่ได้เปิด Google basemap ในค่าที่บันทึก จึงไม่มีการทดสอบ tile")}</p> : <ul>{connectionResult.mapTiles.map((result) => <li key={result.mapType}>{isThai ? mapTypeLabels[result.mapType].th : mapTypeLabels[result.mapType].en}: <strong>{result.status}</strong>{result.latencyMs ? ` · ${result.latencyMs} ms` : ""}{result.error ? <><p><code>{result.error}</code></p><p role="status">{googleMapsFailureGuidance(result.error, !!isThai)}</p></> : null}</li>)}</ul>}
        </VStack> : null}
      </VStack>
    </DashboardCard>

    <DashboardCard>
      <VStack as="section" gap={3}>
        <HStack gap={2} align="center"><Map size={18} /><h4>{text("Live public-map preview", "ตัวอย่างหน้าแผนที่สาธารณะ")}</h4></HStack>
        <p>{text("Preview applies the unsaved center and basemap selection to the public map. Provider routing and credentials are always the saved runtime configuration, so save first to test a newly enabled Google provider or a changed key.", "ตัวอย่างใช้จุดศูนย์กลางและประเภทแผนที่ที่ยังไม่ได้บันทึกกับแผนที่สาธารณะ แต่การเลือกผู้ให้บริการและ credential จะใช้ค่า runtime ที่บันทึกแล้วเสมอ จึงต้องบันทึกก่อนทดสอบ Google ที่เพิ่งเปิดหรือ key ที่เพิ่งเปลี่ยน")}</p>
        <HStack gap={2} wrap="wrap">
          <Select value={previewMapType} onValueChange={(value: GoogleMapType) => setPreviewMapType(value)}><SelectTrigger className="w-[12rem]"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(mapTypeLabels) as GoogleMapType[]).map((mapType) => <SelectItem key={mapType} value={mapType}>{isThai ? mapTypeLabels[mapType].th : mapTypeLabels[mapType].en}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={updatePreview}><RefreshCw size={16} />{text("Apply unsaved view", "ใช้มุมมองที่ยังไม่บันทึก")}</Button>
        </HStack>
        <EmergencyPublicMap items={previewItems} onItemsChange={handlePreviewItemsChange} previewMapType={previewMapType} previewCenter={previewCenter} resetPreviewKey={previewKey} />
      </VStack>
    </DashboardCard>
  </VStack>;
}
