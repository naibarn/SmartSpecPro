import { Check, Copy, ExternalLink, Facebook, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

export type MetaOAuthForm = {
  metaAppId?: string;
  metaAppSecret?: string;
  metaRedirectUri?: string;
  metaGraphApiVersion?: string;
  metaWebhookVerifyToken?: string;
};

type MetaOAuthSettingsPanelProps = {
  locale: "en" | "th";
  value: MetaOAuthForm;
  appSecretConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
  webhookCallbackUrl: string;
  onChange: (field: keyof MetaOAuthForm, value: string) => void;
  onTest: () => void;
  isTesting: boolean;
};

const COPY = {
  en: {
    title: "Meta / Facebook Pages",
    description:
      "Connect Facebook Pages for publishing, comments, inbox events, and page management. Complete every step below before asking users to connect a Page.",
    ready: "Meta configuration is saved",
    incomplete: "Meta configuration is incomplete",
    readyDescription: "Credentials and webhook verification token are stored securely. Run the test after every credential change.",
    incompleteDescription: "Enter the App ID, App Secret, redirect URI, API version, and webhook verify token, then save all OAuth settings.",
    configured: "Configured",
    appId: "Meta App ID",
    appIdDescription: "Meta for Developers → My Apps → your app → App settings → Basic.",
    appSecret: "Meta App Secret",
    appSecretDescription: "Copy from App settings → Basic. Leave blank after saving to keep the stored secret.",
    appSecretPlaceholder: "Leave blank to keep the current secret",
    appSecretNewPlaceholder: "Enter Meta App Secret",
    redirectUri: "OAuth Redirect URI",
    redirectDescription: "Add this exact value under Facebook Login → Settings → Valid OAuth Redirect URIs.",
    graphVersion: "Graph API version",
    graphDescription: "Use the version supported by your Meta app and review it before Meta retires that version.",
    verifyToken: "Webhook Verify Token",
    verifyDescription: "Create a long random value here, then enter the same value when Meta asks to verify the callback.",
    verifyPlaceholder: "Enter a new random verify token",
    verifyKeepPlaceholder: "Leave blank to keep the current verify token",
    webhookCallback: "Webhook Callback URL",
    copy: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy automatically. Select and copy the value manually.",
    test: "Test Meta configuration",
    guideTitle: "Complete setup guide",
    permissionsTitle: "Permissions requested by SmartAIHub",
    permissions:
      "pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_manage_posts, pages_manage_engagement, business_management",
    steps: [
      {
        title: "Create or select a Meta app",
        body: "Open Meta for Developers → My Apps → Create App. Choose the business use case that supports Facebook Login and Pages, connect the correct Business Portfolio, and add Facebook Login to the app.",
      },
      {
        title: "Complete App settings",
        body: "In App settings → Basic, set the app display name, contact email, App Domains, Privacy Policy URL, Terms URL, and User Data Deletion instructions. Copy the App ID and App Secret into this page.",
      },
      {
        title: "Configure Facebook Login",
        body: "Open Facebook Login → Settings. Enable Client OAuth Login and Web OAuth Login. Add the OAuth Redirect URI shown above exactly; scheme, host, path, and trailing slash must match.",
      },
      {
        title: "Request Pages permissions",
        body: "In App Review → Permissions and Features, request Advanced Access for the permissions listed below. Add test users while the app is in Development mode, complete Business Verification when Meta requires it, then switch the app to Live only after review.",
      },
      {
        title: "Configure the Page webhook",
        body: "Add the Webhooks product, choose the Page object, paste the Callback URL shown above, and use the same Verify Token entered here. Subscribe only to fields your workflow needs, such as feed, messages, and messaging_postbacks.",
      },
      {
        title: "Save, enable, test, and connect",
        body: "Click Save all OAuth settings, then Test Meta configuration. In Admin → Tenants → Feature Flags, enable Meta Channels for the tenant. Finally open Social Channels, choose Connect Meta, approve access, and select the Pages to manage.",
      },
    ],
    warningTitle: "Production checklist",
    warningBody:
      "Use HTTPS URLs, keep the App Secret private, make the app Live only after review, and verify that your Privacy Policy and User Data Deletion URLs are publicly accessible.",
    openDevelopers: "Open Meta for Developers",
    openDocs: "Open Meta Webhooks documentation",
  },
  th: {
    title: "Meta / Facebook Pages",
    description:
      "เชื่อมต่อ Facebook Pages เพื่อเผยแพร่โพสต์ จัดการความคิดเห็น รับเหตุการณ์จาก inbox และบริหารเพจ ต้องทำทุกขั้นตอนด้านล่างให้ครบก่อนให้ผู้ใช้เชื่อมต่อเพจ",
    ready: "บันทึกการตั้งค่า Meta แล้ว",
    incomplete: "การตั้งค่า Meta ยังไม่ครบ",
    readyDescription: "ระบบเก็บ credentials และ webhook verify token แบบปลอดภัยแล้ว ควรทดสอบใหม่ทุกครั้งที่เปลี่ยนค่า",
    incompleteDescription: "กรอก App ID, App Secret, redirect URI, API version และ webhook verify token จากนั้นบันทึก OAuth ทั้งหมด",
    configured: "ตั้งค่าแล้ว",
    appId: "Meta App ID",
    appIdDescription: "Meta for Developers → My Apps → เลือกแอป → App settings → Basic",
    appSecret: "Meta App Secret",
    appSecretDescription: "คัดลอกจาก App settings → Basic หลังบันทึกแล้วให้เว้นว่างเพื่อคง secret เดิม",
    appSecretPlaceholder: "เว้นว่างเพื่อคง secret เดิม",
    appSecretNewPlaceholder: "กรอก Meta App Secret",
    redirectUri: "OAuth Redirect URI",
    redirectDescription: "นำค่านี้ไปใส่ให้ตรงทุกตัวอักษรที่ Facebook Login → Settings → Valid OAuth Redirect URIs",
    graphVersion: "เวอร์ชัน Graph API",
    graphDescription: "ใช้เวอร์ชันที่แอป Meta รองรับ และตรวจสอบก่อน Meta ยุติการรองรับเวอร์ชันนั้น",
    verifyToken: "Webhook Verify Token",
    verifyDescription: "สร้างข้อความสุ่มที่ยาวและคาดเดายาก แล้วใช้ค่าเดียวกันตอน Meta ตรวจสอบ callback",
    verifyPlaceholder: "กรอก verify token แบบสุ่มค่าใหม่",
    verifyKeepPlaceholder: "เว้นว่างเพื่อคง verify token เดิม",
    webhookCallback: "Webhook Callback URL",
    copy: "คัดลอก",
    copied: "คัดลอกแล้ว",
    copyFailed: "คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง",
    test: "ทดสอบการตั้งค่า Meta",
    guideTitle: "คู่มือตั้งค่าแบบครบขั้นตอน",
    permissionsTitle: "สิทธิ์ที่ SmartAIHub ขอใช้งาน",
    permissions:
      "pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_manage_posts, pages_manage_engagement, business_management",
    steps: [
      {
        title: "สร้างหรือเลือก Meta app",
        body: "เปิด Meta for Developers → My Apps → Create App เลือก business use case ที่รองรับ Facebook Login และ Pages เชื่อม Business Portfolio ที่ถูกต้อง แล้วเพิ่ม Facebook Login ในแอป",
      },
      {
        title: "ตั้งค่า App settings ให้ครบ",
        body: "ที่ App settings → Basic กรอกชื่อแอป อีเมลติดต่อ App Domains, Privacy Policy URL, Terms URL และคำแนะนำ User Data Deletion จากนั้นคัดลอก App ID และ App Secret มากรอกหน้านี้",
      },
      {
        title: "ตั้งค่า Facebook Login",
        body: "เปิด Facebook Login → Settings เปิด Client OAuth Login และ Web OAuth Login แล้วเพิ่ม OAuth Redirect URI ที่แสดงด้านบนให้ตรงทุกตัวอักษร รวม protocol, domain, path และ trailing slash",
      },
      {
        title: "ขอสิทธิ์สำหรับ Pages",
        body: "ที่ App Review → Permissions and Features ขอ Advanced Access สำหรับสิทธิ์ที่แสดงด้านล่าง เพิ่ม test users ขณะที่แอปอยู่ Development mode ทำ Business Verification เมื่อ Meta กำหนด และเปลี่ยนเป็น Live หลังผ่านการตรวจสอบเท่านั้น",
      },
      {
        title: "ตั้งค่า Page webhook",
        body: "เพิ่มผลิตภัณฑ์ Webhooks เลือก Page object วาง Callback URL ด้านบน และใช้ Verify Token ค่าเดียวกับที่กรอกหน้านี้ เลือกเฉพาะ fields ที่ระบบใช้ เช่น feed, messages และ messaging_postbacks",
      },
      {
        title: "บันทึก เปิดใช้ ทดสอบ และเชื่อมต่อ",
        body: "กดบันทึก OAuth ทั้งหมด แล้วทดสอบ Meta จากนั้นไป Admin → Tenants → Feature Flags เปิด Meta Channels ให้ tenant สุดท้ายไป Social Channels กด Connect Meta อนุมัติสิทธิ์ และเลือก Pages ที่ต้องการจัดการ",
      },
    ],
    warningTitle: "เช็กลิสต์ก่อนใช้งานจริง",
    warningBody:
      "ใช้ URL แบบ HTTPS เก็บ App Secret เป็นความลับ เปิดแอปเป็น Live หลังผ่านการตรวจสอบ และตรวจว่า Privacy Policy กับ User Data Deletion URL เปิดจากภายนอกได้จริง",
    openDevelopers: "เปิด Meta for Developers",
    openDocs: "เปิดคู่มือ Meta Webhooks",
  },
} as const;

export function MetaOAuthSettingsPanel({
  locale,
  value,
  appSecretConfigured,
  webhookVerifyTokenConfigured,
  webhookCallbackUrl,
  onChange,
  onTest,
  isTesting,
}: MetaOAuthSettingsPanelProps) {
  const copy = COPY[locale];
  const isReady = Boolean(
    value.metaAppId?.trim()
    && appSecretConfigured
    && value.metaRedirectUri?.trim()
    && value.metaGraphApiVersion?.trim()
    && webhookVerifyTokenConfigured,
  );

  async function copyValue(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  return (
    <Card variant="blue" padding={4} data-testid="meta-oauth-settings-panel">
      <VStack gap={4}>
        <HStack gap={2} wrap="wrap">
          <Facebook aria-hidden="true" />
          <Heading level={3}>{copy.title}</Heading>
          {isReady ? <Badge variant="green" label={copy.configured} icon={<Check aria-hidden="true" />} /> : null}
        </HStack>
        <Text type="supporting" display="block">{copy.description}</Text>

        <Banner
          status={isReady ? "success" : "warning"}
          title={isReady ? copy.ready : copy.incomplete}
          description={isReady ? copy.readyDescription : copy.incompleteDescription}
        />

        <TextInput
          label={copy.appId}
          description={copy.appIdDescription}
          value={value.metaAppId || ""}
          onChange={(next) => onChange("metaAppId", next)}
          placeholder="123456789012345"
          isRequired
          width="100%"
        />
        <TextInput
          type="password"
          label={copy.appSecret}
          description={copy.appSecretDescription}
          value={value.metaAppSecret || ""}
          onChange={(next) => onChange("metaAppSecret", next)}
          placeholder={appSecretConfigured ? copy.appSecretPlaceholder : copy.appSecretNewPlaceholder}
          isRequired={!appSecretConfigured}
          width="100%"
        />
        <TextInput
          label={copy.redirectUri}
          description={copy.redirectDescription}
          value={value.metaRedirectUri || ""}
          onChange={(next) => onChange("metaRedirectUri", next)}
          placeholder="https://smartaihub.app/auth/callback/meta"
          isRequired
          width="100%"
        />
        <HStack gap={2} wrap="wrap">
          <Button
            variant="secondary"
            label={copy.copy}
            icon={<Copy aria-hidden="true" />}
            onClick={() => copyValue(value.metaRedirectUri || "")}
            isDisabled={!value.metaRedirectUri}
          />
        </HStack>
        <TextInput
          label={copy.graphVersion}
          description={copy.graphDescription}
          value={value.metaGraphApiVersion || ""}
          onChange={(next) => onChange("metaGraphApiVersion", next)}
          placeholder="v25.0"
          isRequired
          width="100%"
        />
        <TextInput
          type="password"
          label={copy.verifyToken}
          description={copy.verifyDescription}
          value={value.metaWebhookVerifyToken || ""}
          onChange={(next) => onChange("metaWebhookVerifyToken", next)}
          placeholder={webhookVerifyTokenConfigured ? copy.verifyKeepPlaceholder : copy.verifyPlaceholder}
          isRequired={!webhookVerifyTokenConfigured}
          width="100%"
        />

        <Card variant="muted" padding={3}>
          <VStack gap={2}>
            <Text weight="bold" display="block">{copy.webhookCallback}</Text>
            <Text type="supporting" display="block" wordBreak="break-all">{webhookCallbackUrl}</Text>
            <HStack gap={2} wrap="wrap">
              <Button
                variant="secondary"
                label={copy.copy}
                icon={<Copy aria-hidden="true" />}
                onClick={() => copyValue(webhookCallbackUrl)}
                isDisabled={!webhookCallbackUrl}
              />
            </HStack>
          </VStack>
        </Card>

        <Button
          variant="secondary"
          label={copy.test}
          icon={<FlaskConical aria-hidden="true" />}
          onClick={onTest}
          isLoading={isTesting}
          isDisabled={!isReady}
        />

        <Heading level={3}>{copy.guideTitle}</Heading>
        <VStack gap={3}>
          {copy.steps.map((step, index) => (
            <Card key={step.title} variant="muted" padding={3}>
              <HStack gap={3} align="start">
                <Badge variant="blue" label={String(index + 1)} />
                <VStack gap={1}>
                  <Text weight="bold" display="block">{step.title}</Text>
                  <Text type="supporting" display="block">{step.body}</Text>
                </VStack>
              </HStack>
            </Card>
          ))}
        </VStack>

        <Card variant="muted" padding={3}>
          <VStack gap={1}>
            <Text weight="bold" display="block">{copy.permissionsTitle}</Text>
            <Text type="supporting" display="block" wordBreak="break-word">{copy.permissions}</Text>
          </VStack>
        </Card>

        <Banner status="warning" title={copy.warningTitle} description={copy.warningBody} />
        <HStack gap={2} wrap="wrap">
          <Button
            variant="secondary"
            label={copy.openDevelopers}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/apps/"
            target="_blank"
          />
          <Button
            variant="secondary"
            label={copy.openDocs}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/docs/graph-api/webhooks/getting-started/"
            target="_blank"
          />
        </HStack>
      </VStack>
    </Card>
  );
}
