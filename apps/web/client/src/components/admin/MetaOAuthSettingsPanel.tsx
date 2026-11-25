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
      "Configure SmartAIHub's shared Meta app once. Each user connects their own Facebook account and manages only the Pages they are authorized to access in Social Channels.",
    ready: "Meta configuration is saved",
    incomplete: "Meta configuration is incomplete",
    readyDescription: "Credentials and webhook verification token are stored securely. Run the test after every credential change.",
    incompleteDescription: "Enter the App ID, App Secret, redirect URI, API version, and webhook verify token, then save all OAuth settings.",
    configured: "Configured",
    appId: "Meta App ID",
    appIdDescription: "Meta for Developers → My Apps → your app → App settings → Basic.",
    appSecret: "Meta App Secret",
    appSecretDescription: "Copy from App settings → Basic. This secret belongs to SmartAIHub's shared app; leave blank after saving to keep it stored.",
    appSecretPlaceholder: "Leave blank to keep the current secret",
    appSecretNewPlaceholder: "Enter Meta App Secret",
    redirectUri: "OAuth Redirect URI",
    redirectDescription: "Add this exact value under Facebook Login → Settings → Valid OAuth Redirect URIs.",
    graphVersion: "Graph API version",
    graphDescription: "SmartAIHub currently uses v25.0. Keep this value unless the platform runtime has been verified against another version.",
    verifyToken: "Webhook Verify Token",
    verifyDescription: "Create a long random value, enter the same value in Meta's Page Webhooks settings, and keep it private.",
    verifyPlaceholder: "Enter a new random verify token",
    verifyKeepPlaceholder: "Leave blank to keep the current verify token",
    webhookCallback: "Webhook Callback URL",
    copy: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy automatically. Select and copy the value manually.",
    test: "Test Meta configuration",
    guideTitle: "Complete setup guide",
    jumpToGuide: "Read the detailed setup guide",
    guideIntro: "These values configure SmartAIHub's shared Meta app. Users do not enter App ID or App Secret; they connect their own Facebook accounts from Social Channels after the platform setup is ready.",
    permissionsTitle: "Permissions requested by SmartAIHub",
    permissionsDescription: "This list matches the OAuth scopes currently requested by SmartAIHub. Request only these permissions in Meta; Meta may require App Review and Advanced Access before people without an app role can use them.",
    permissions:
      "pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_manage_posts, pages_manage_engagement",
    steps: [
      {
        title: "Create or select a Meta app",
        body: "Sign in to Meta for Developers with the platform administrator's developer account. Open My Apps and create an app, or select the existing SmartAIHub app.",
        details: [
          "Choose a use case that supports Facebook Login and access to Pages. Meta changes the available use cases; review the current options before creating the app because some use cases cannot be removed later.",
          "Connect the SmartAIHub business portfolio if the app will access Pages owned or managed by other businesses. This is the platform's app, not each user's Facebook account.",
        ],
      },
      {
        title: "Find the App ID and App Secret",
        body: "In the Meta App Dashboard, open App settings → Basic. Copy the App ID into the App ID field on this page. Reveal and copy the App Secret into the password field.",
        details: [
          "The App ID and App Secret are issued by Meta; do not make up these values. The App Secret is private. Never send it to end users, put it in screenshots, or paste it into a Facebook account connection form.",
          "On the same Basic page, complete the app name, contact email, app domains, privacy policy URL, terms URL, and user data deletion instructions required by Meta.",
        ],
      },
      {
        title: "Set the OAuth Redirect URI",
        body: "In the App Dashboard, add Facebook Login (or the compatible Facebook Login for Business product) and open its Settings. Copy the OAuth Redirect URI shown in SmartAIHub and paste it into Valid OAuth Redirect URIs.",
        details: [
          "Use the Copy button beside the URI in this page. For this development site the value is https://smartaihub.app/auth/callback/meta; the value shown in this field is authoritative for the current deployment.",
          "Enable Client OAuth Login and Web OAuth Login when these options are shown. Save the Meta settings. The scheme, host, path, and trailing slash must match exactly; use HTTPS, not localhost or an approximate URL.",
        ],
      },
      {
        title: "Keep the Graph API version compatible",
        body: "Use the Graph API version displayed in the SmartAIHub form. It is currently v25.0. Do not change it to the newest Meta version unless SmartAIHub has been checked against that version.",
        details: [
          "Meta publishes new Graph API versions over time. The version is included in the OAuth dialog and API requests, so changing it can affect login and publishing behavior.",
          "If Meta requires a newer version, coordinate the app setting and SmartAIHub runtime change together, then run Test Meta configuration and verify a test Page connection before general use.",
        ],
      },
      {
        title: "Request Page permissions and App Review",
        body: "In the app's use case or App Review → Permissions and Features, request the permissions listed below. The current SmartAIHub OAuth flow requests this exact set.",
        details: [
          "While the app is in Development mode, connect only with people who have an app role such as administrator, developer, or tester. Add test people under App roles when needed.",
          "For people without a role on the app or its connected business, complete Meta App Review and obtain the access level Meta requires for each permission. Complete business verification if Meta asks for it; switch the app to Live only after the review and required setup are complete.",
        ],
      },
      {
        title: "Configure the Page webhook",
        body: "In the App Dashboard, add Webhooks, select the Page object, and copy the Webhook Callback URL shown in SmartAIHub into Callback URL.",
        details: [
          "Create a long random Verify Token (for example, with a password manager). Enter the same value in SmartAIHub and Meta's Verify Token field. It is created by the administrator; it is not supplied by Meta and is different from the App Secret.",
          "Subscribe the Page object to feed, messages, and comments. SmartAIHub also subscribes the selected Page when a user connects or syncs it. Meta verifies the HTTPS callback using the matching token.",
          "For this development site the callback shown by the form is https://smartaihub.app/api/webhooks/meta. Copy the current field value instead of typing it from memory.",
        ],
      },
      {
        title: "Save and test the platform setup",
        body: "Return to SmartAIHub Admin → Settings → OAuth, save the OAuth settings, then click Test Meta configuration. Fix any reported mismatch before asking users to connect.",
        details: [
          "Enable Meta Channels for the intended workspace under Admin → Tenants → Feature Flags. This enables the feature for that workspace; it does not connect anyone's Facebook account.",
          "Each user then opens Social Channels → Connect Meta, signs into their own Facebook account, approves the requested permissions, and chooses the Pages they are allowed to manage.",
          "After connection, confirm the expected Page appears and is enabled for publishing. Test first with a Page and account approved for the app's current Development or Live mode.",
        ],
      },
    ],
    warningTitle: "Production checklist",
    warningBody:
      "Use HTTPS URLs, keep the App Secret private, make the app Live only after review, and verify that your Privacy Policy and User Data Deletion URLs are publicly accessible.",
    openDevelopers: "Open Meta for Developers",
    openAppGuide: "Meta app creation guide",
    openLoginGuide: "Facebook Login redirect guide",
    openAppReview: "Meta App Review guide",
    openGraphVersion: "Graph API version guide",
    openDocs: "Open Meta Webhooks documentation",
  },
  th: {
    title: "Meta / Facebook Pages",
    description:
      "ผู้ดูแลแพลตฟอร์มตั้งค่า Meta App กลางของ SmartAIHub เพียงครั้งเดียว จากนั้นผู้ใช้แต่ละคนเชื่อมบัญชี Facebook ของตนเองและจัดการเฉพาะเพจที่มีสิทธิ์ใน Social Channels",
    ready: "บันทึกการตั้งค่า Meta แล้ว",
    incomplete: "การตั้งค่า Meta ยังไม่ครบ",
    readyDescription: "ระบบเก็บ credentials และ webhook verify token แบบปลอดภัยแล้ว ควรทดสอบใหม่ทุกครั้งที่เปลี่ยนค่า",
    incompleteDescription: "กรอก App ID, App Secret, redirect URI, API version และ webhook verify token จากนั้นบันทึก OAuth ทั้งหมด",
    configured: "ตั้งค่าแล้ว",
    appId: "Meta App ID",
    appIdDescription: "Meta for Developers → My Apps → เลือกแอป → App settings → Basic",
    appSecret: "Meta App Secret",
    appSecretDescription: "คัดลอกจาก App settings → Basic ค่านี้เป็น secret ของแอปกลาง SmartAIHub หลังบันทึกแล้วให้เว้นว่างเพื่อคงค่าเดิม",
    appSecretPlaceholder: "เว้นว่างเพื่อคง secret เดิม",
    appSecretNewPlaceholder: "กรอก Meta App Secret",
    redirectUri: "OAuth Redirect URI",
    redirectDescription: "นำค่านี้ไปใส่ให้ตรงทุกตัวอักษรที่ Facebook Login → Settings → Valid OAuth Redirect URIs",
    graphVersion: "เวอร์ชัน Graph API",
    graphDescription: "SmartAIHub ใช้ v25.0 ในปัจจุบัน ให้คงค่านี้ไว้จนกว่าจะตรวจสอบ runtime กับเวอร์ชันอื่นแล้ว",
    verifyToken: "Webhook Verify Token",
    verifyDescription: "สร้างข้อความสุ่มที่ยาว ใส่ค่าเดียวกันใน Page Webhooks ของ Meta และเก็บไว้เป็นความลับ",
    verifyPlaceholder: "กรอก verify token แบบสุ่มค่าใหม่",
    verifyKeepPlaceholder: "เว้นว่างเพื่อคง verify token เดิม",
    webhookCallback: "Webhook Callback URL",
    copy: "คัดลอก",
    copied: "คัดลอกแล้ว",
    copyFailed: "คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง",
    test: "ทดสอบการตั้งค่า Meta",
    guideTitle: "คู่มือตั้งค่าแบบครบขั้นตอน",
    jumpToGuide: "อ่านคู่มือการตั้งค่าอย่างละเอียด",
    guideIntro: "ค่านี้ใช้ตั้งค่า Meta App กลางของ SmartAIHub ผู้ใช้ไม่ต้องกรอก App ID หรือ App Secret เอง หลังผู้ดูแลตั้งค่าแพลตฟอร์มแล้ว ผู้ใช้จะเชื่อมบัญชี Facebook ของตนที่ Social Channels",
    permissionsTitle: "สิทธิ์ที่ SmartAIHub ขอใช้งาน",
    permissionsDescription: "รายการนี้ตรงกับ OAuth scope ที่ SmartAIHub ขอในปัจจุบัน ให้ขอเฉพาะสิทธิ์เหล่านี้ใน Meta และเตรียมส่ง App Review/Advanced Access หาก Meta กำหนดก่อนให้ผู้ใช้ทั่วไปเชื่อมต่อ",
    permissions:
      "pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_manage_posts, pages_manage_engagement",
    steps: [
      {
        title: "สร้างหรือเลือก Meta app",
        body: "เข้าสู่ Meta for Developers ด้วยบัญชีผู้ดูแลแพลตฟอร์ม เปิด My Apps แล้วสร้างแอปใหม่หรือเลือกแอป SmartAIHub ที่มีอยู่แล้ว",
        details: [
          "เลือก use case ที่รองรับ Facebook Login และการเข้าถึง Pages เนื่องจาก Meta เปลี่ยนตัวเลือกได้และบาง use case ลบภายหลังไม่ได้ ควรอ่านตัวเลือกและผลของแต่ละ use case ก่อนสร้าง",
          "เชื่อม Business Portfolio ของ SmartAIHub หากแอปจะเข้าถึงเพจที่ธุรกิจอื่นเป็นเจ้าของหรือดูแล แอปนี้เป็นแอปกลางของแพลตฟอร์ม ไม่ใช่บัญชี Facebook ของผู้ใช้แต่ละคน",
        ],
      },
      {
        title: "หา App ID และ App Secret",
        body: "ใน Meta App Dashboard เปิด App settings → Basic คัดลอก App ID มาใส่ช่อง App ID ในหน้านี้ แล้วกดแสดงและคัดลอก App Secret มาใส่ช่องรหัสผ่าน",
        details: [
          "Meta เป็นผู้ออก App ID และ App Secret อย่าสร้างค่าเอง App Secret เป็นความลับ ห้ามส่งให้ผู้ใช้ทั่วไป ใส่ในภาพหน้าจอ หรือกรอกในหน้าที่ผู้ใช้เชื่อมบัญชี Facebook",
          "ในหน้า Basic เดียวกัน ให้กรอกชื่อแอป อีเมลติดต่อ App Domains, Privacy Policy URL, Terms URL และคำแนะนำลบข้อมูลผู้ใช้ตามที่ Meta กำหนด",
        ],
      },
      {
        title: "ตั้งค่า OAuth Redirect URI",
        body: "ใน App Dashboard เพิ่ม Facebook Login (หรือ Facebook Login for Business ที่รองรับ) แล้วเปิดหน้า Settings คัดลอก OAuth Redirect URI จาก SmartAIHub ไปวางในช่อง Valid OAuth Redirect URIs",
        details: [
          "ใช้ปุ่มคัดลอกข้าง URI ในหน้านี้ สำหรับเว็บพัฒนา URI คือ https://smartaihub.app/auth/callback/meta โดยให้ยึดค่าที่แสดงในช่องของ deployment ปัจจุบันเป็นหลัก",
          "เปิด Client OAuth Login และ Web OAuth Login หากมีตัวเลือกนี้ แล้วบันทึกการตั้งค่า URL ต้องตรงทุกตัวอักษรทั้ง https, domain, path และเครื่องหมาย / ท้าย URL ห้ามใช้ localhost หรือพิมพ์ URL ใกล้เคียง",
        ],
      },
      {
        title: "ใช้ Graph API version ที่เข้ากันได้",
        body: "ใช้เวอร์ชันที่แสดงในฟอร์ม SmartAIHub ปัจจุบันคือ v25.0 อย่าเปลี่ยนเป็นเวอร์ชันล่าสุดของ Meta จนกว่าจะตรวจสอบ SmartAIHub กับเวอร์ชันนั้นแล้ว",
        details: [
          "Meta ออก Graph API version ใหม่เป็นระยะ เวอร์ชันนี้ถูกใช้ใน OAuth dialog และ API request การเปลี่ยนอาจกระทบขั้นตอน login และเผยแพร่",
          "หาก Meta กำหนดให้เปลี่ยนเวอร์ชัน ให้ปรับการตั้งค่า Meta และ runtime ของ SmartAIHub ให้สอดคล้องกัน จากนั้นทดสอบ Meta configuration และเชื่อมต่อ Page ทดสอบก่อนเปิดให้ใช้งานทั่วไป",
        ],
      },
      {
        title: "ขอสิทธิ์ Pages และส่ง App Review",
        body: "ใน use case ของแอปหรือ App Review → Permissions and Features ให้ขอ permission ตามรายการด้านล่าง ซึ่งเป็นชุดที่ OAuth ของ SmartAIHub ขออยู่ในปัจจุบัน",
        details: [
          "ระหว่างแอปอยู่ Development mode ให้ทดสอบด้วยคนที่มี role ในแอป เช่น administrator, developer หรือ tester เพิ่มบัญชีทดสอบจาก App roles เมื่อจำเป็น",
          "หากผู้ใช้ไม่มี role ในแอปหรือธุรกิจที่เชื่อมต่อ ต้องผ่าน Meta App Review และได้รับ access level ที่ Meta กำหนดสำหรับแต่ละ permission ทำ Business Verification หาก Meta ขอ และเปลี่ยนแอปเป็น Live หลังผ่านเงื่อนไขแล้วเท่านั้น",
        ],
      },
      {
        title: "ตั้งค่า Page webhook",
        body: "ใน App Dashboard เพิ่ม Webhooks เลือก Page object แล้วคัดลอก Webhook Callback URL จาก SmartAIHub ไปวางใน Callback URL",
        details: [
          "สร้าง Verify Token แบบสุ่มยาวด้วย password manager แล้วใส่ค่าเดียวกันทั้งใน SmartAIHub และช่อง Verify Token ของ Meta ค่านี้ผู้ดูแลเป็นผู้สร้าง ไม่ได้ขอจาก Meta และต้องไม่ใช้แทน App Secret",
          "เลือก Page fields: feed, messages และ comments จากนั้น SmartAIHub จะสมัคร Page ที่ผู้ใช้เลือกเมื่อเชื่อมหรือซิงก์เพจ Meta ตรวจ HTTPS callback โดยใช้ Verify Token ที่ตรงกัน",
          "สำหรับเว็บพัฒนา callback คือ https://smartaihub.app/api/webhooks/meta ให้คัดลอกจากค่าปัจจุบันในฟอร์ม ไม่ต้องพิมพ์เอง",
        ],
      },
      {
        title: "บันทึกและทดสอบการตั้งค่าแพลตฟอร์ม",
        body: "กลับมาที่ SmartAIHub Admin → Settings → OAuth บันทึก OAuth settings แล้วกดทดสอบ Meta configuration แก้ค่าที่ไม่ตรงกันก่อนให้ผู้ใช้เชื่อมบัญชี",
        details: [
          "เปิด Meta Channels ให้ workspace ที่ต้องการที่ Admin → Tenants → Feature Flags ขั้นตอนนี้เปิดฟีเจอร์ให้ workspace แต่ยังไม่ได้เชื่อมบัญชี Facebook ของใคร",
          "จากนั้นผู้ใช้แต่ละคนเปิด Social Channels → Connect Meta เข้าสู่ระบบ Facebook ของตน อนุมัติสิทธิ์ และเลือกเพจที่มีสิทธิ์จัดการ",
          "ตรวจว่ารายชื่อเพจที่ต้องการแสดงและเปิดใช้การเผยแพร่ ทดสอบด้วยบัญชีและเพจที่ได้รับอนุญาตตามโหมด Development หรือ Live ของแอป",
        ],
      },
    ],
    warningTitle: "เช็กลิสต์ก่อนใช้งานจริง",
    warningBody:
      "ใช้ URL แบบ HTTPS เก็บ App Secret เป็นความลับ เปิดแอปเป็น Live หลังผ่านการตรวจสอบ และตรวจว่า Privacy Policy กับ User Data Deletion URL เปิดจากภายนอกได้จริง",
    openDevelopers: "เปิด Meta for Developers",
    openAppGuide: "คู่มือสร้าง Meta App",
    openLoginGuide: "คู่มือตั้งค่า Facebook Login redirect",
    openAppReview: "คู่มือ Meta App Review",
    openGraphVersion: "คู่มือเวอร์ชัน Graph API",
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
        <Button variant="secondary" label={copy.jumpToGuide} href="#meta-oauth-setup-guide" />

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

        <Heading level={3} id="meta-oauth-setup-guide">{copy.guideTitle}</Heading>
        <Text type="supporting" display="block">{copy.guideIntro}</Text>
        <VStack gap={3}>
          {copy.steps.map((step, index) => (
            <Card key={step.title} variant="muted" padding={3}>
              <HStack gap={3} align="start">
                <Badge variant="blue" label={String(index + 1)} />
                <VStack gap={1}>
                  <Text weight="bold" display="block">{step.title}</Text>
                  <Text type="supporting" display="block">{step.body}</Text>
                  <VStack gap={1}>
                    {step.details.map((detail) => <Text key={detail} type="supporting" display="block">• {detail}</Text>)}
                  </VStack>
                </VStack>
              </HStack>
            </Card>
          ))}
        </VStack>

        <Card variant="muted" padding={3}>
          <VStack gap={1}>
            <Text weight="bold" display="block">{copy.permissionsTitle}</Text>
            <Text type="supporting" display="block">{copy.permissionsDescription}</Text>
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
            label={copy.openAppGuide}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/documentation/development/create-an-app"
            target="_blank"
          />
          <Button
            variant="secondary"
            label={copy.openLoginGuide}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/docs/facebook-business-extension/fbe/get-started/business-login/"
            target="_blank"
          />
          <Button
            variant="secondary"
            label={copy.openAppReview}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction"
            target="_blank"
          />
          <Button
            variant="secondary"
            label={copy.openGraphVersion}
            icon={<ExternalLink aria-hidden="true" />}
            href="https://developers.facebook.com/docs/graph-api/guides/versioning"
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
