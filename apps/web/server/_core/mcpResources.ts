import { createHash } from "node:crypto";
import { buildMcpClientOnboardingDescriptors } from "../../shared/mcpClientOnboarding";

export type McpDocumentationResource = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: "text/markdown";
  revision: string;
};

type ResourceDocument = McpDocumentationResource & { text: string };

const PUBLIC_MCP_ENDPOINT = "https://smartaihub.app/v1/mcp";
const ONBOARDING = Object.fromEntries(
  buildMcpClientOnboardingDescriptors(PUBLIC_MCP_ENDPOINT).map(descriptor => [
    descriptor.client,
    descriptor,
  ])
);

const DOCUMENT_SOURCES: Array<Omit<ResourceDocument, "revision">> = [
  {
    uri: "smartaihub://docs/mcp/overview",
    name: "mcp-overview",
    title: "SmartAIHub MCP overview",
    description: "Protocol eras, authentication, and safe request boundaries.",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub MCP",
      "",
      "The canonical endpoint is https://smartaihub.app/v1/mcp.",
      "Modern requests use MCP-Protocol-Version 2026-07-28 and are stateless.",
      "Legacy clients may use initialize and Mcp-Session-Id.",
      `Hermes One: ${ONBOARDING["hermes-one"].instructions.join("; ")} The hermes://mcp/install link contains public configuration only.`,
      `Hermes CLI/Agent: ${ONBOARDING["hermes-cli"].instructions.join("; ")}`,
      "OAuth is the preferred authentication mode when the server's OAuth readiness is available. Modern Hermes configuration uses auth: oauth; do not use --auth header unless the dedicated MCP CLI key fallback is required.",
      "The administrator must save Admin → Infrastructure → MCP/OAuth and enable the tenant gates Modern MCP protocol, MCP documentation resources, OAuth Protected Resource Metadata, and MCP OAuth Authorization Server. Dynamic registration is optional and off by default.",
      "If the machine has no browser, Hermes may complete OAuth through its interactive authorize-URL/paste-back flow from another trusted device; if that is unavailable, create Settings → API Keys → Create MCP CLI Key and use Hermes --auth header only with that dedicated key; never paste an OAuth access or refresh token.",
      `Claude/Claude Code: ${ONBOARDING.claude.instructions.join("; ")}`,
      "Claude Desktop also supports Settings → Connectors → Add custom connector, then browser OAuth.",
      `Codex CLI: ${ONBOARDING.codex.instructions.join("; ")}`,
      "Claude Code and other headless HTTP clients may use Authorization: Bearer with the dedicated MCP CLI key created by the user at Settings → API Keys, stored in an OS secret/environment variable.",
      `MCP CLI keys default to ${ONBOARDING.codex.quotaPreview.fiveHourCredits} credits per 5-hour bucket, ${ONBOARDING.codex.quotaPreview.dailyCredits} per day, and ${ONBOARDING.codex.quotaPreview.weeklyCredits} per 7-day bucket; the user can change or disable each budget in Settings.`,
      "Other MCP clients should choose remote Streamable HTTP + OAuth discovery. Clients without MCP OAuth should use an explicitly supported compatibility fallback or the Public REST/OpenAPI contract, not a guessed static header.",
      "Worker bootstrap keys are not MCP credentials. They are compatibility/control-plane credentials for native worker registration, heartbeat, job lease/report, diagnostics, and machine-bound execution. Hermes, Claude Code, Codex, and MCP-capable runtimes should use MCP & Connected Devices with OAuth/device approval, or a dedicated MCP CLI key for a machine without a browser.",
      "OpenClaw, ZeroClaw Desktop, NemoClaw, and HiClaw may use /v1/mcp only when their build exposes a remote Streamable HTTP MCP client. Otherwise use the Worker bootstrap flow for control-plane operations. Remotion uses MCP for submit/status/cancel and a separate signed, device-bound Remotion Executor for local rendering.",
      "Quota ownership is separate: MCP CLI keys use configurable 5-hour, daily, and 7-day credit budgets in Settings → API Keys; OAuth/device sessions use user/tenant policy; Worker bootstrap quotas remain worker control-plane budgets.",
      "These clients share one OAuth/tenant/scope policy but must keep their own credential store and callback handling.",
      "Interactive Hermes commands should run from a normal OS terminal, not an embedded agent PTY on Windows.",
      "All tools are evaluated against the authenticated tenant, user, device, and scopes.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/tools",
    name: "mcp-tools",
    title: "SmartAIHub MCP tools",
    description:
      "Canonical tools, safe aliases, idempotency, and result handling.",
    mimeType: "text/markdown",
    text: [
      "# Tools",
      "",
      "Use tools/list to discover the principal-scoped catalog.",
      "Use tools/call with the listed input schema.",
      "Mutation tools may require params._meta.idempotencyKey.",
      "The smartspec.* names remain canonical; guide aliases resolve to one handler.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/files-and-media",
    name: "mcp-files-and-media",
    title: "Files and media access",
    description: "ACL-checked Library, R2, and Media History access.",
    mimeType: "text/markdown",
    text: [
      "# Files and media",
      "",
      "User files and media are not arbitrary MCP resources.",
      "Use the scoped Library/media-history tools to receive a short-lived download reference.",
      "The download broker re-checks tenant and user access and preserves MIME/filename metadata.",
      "Never send local paths, R2 keys, bearer tokens, or permanent URLs as authority.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/remotion",
    name: "mcp-remotion",
    title: "Hermes Remotion rendering",
    description:
      "Server-owned job submission and owner-scoped status/cancel behavior.",
    mimeType: "text/markdown",
    text: [
      "# Remotion",
      "",
      "Remotion jobs are submitted through the existing server worker contract.",
      "Hermes/Remotion executors claim only jobs for their tenant and approved device.",
      "Artifact checksum, publication, Media History/Library registration, and download ACLs remain server-owned.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/index",
    name: "help-index",
    title: "SmartAIHub MCP Help Index",
    description: "สารบัญคู่มือการใช้งาน MCP ของ SmartAIHub และหัวข้อความช่วยเหลือทั้งหมด",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub MCP Help Index",
      "",
      "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server",
      "ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง",
      "",
      "## Available Help Topics & Resources",
      "- `smartaihub://help/library-search`: คู่มือการค้นหาไฟล์ใน Library ด้วย smartaihub_library_search",
      "- `smartaihub://help/library-files`: คู่มือการเปิดไฟล์และดาวน์โหลดผ่าน smartaihub_library_get_file",
      "- `smartaihub://help/media-generate`: คู่มือการสั่งสร้างภาพและวิดีโอ (Media Studio), โมเดลแนะนำ และการหักเครดิต",
      "- `smartaihub://help/media-models`: รายการโมเดลภาพ/วิดีโอ/เสียงที่มีในระบบ พร้อมราคาเครดิตและสเปก",
      "- `smartaihub://help/media-history`: คู่มือการค้นหาและตรวจสอบประวัติงาน Media History",
      "- `smartaihub://help/errors`: คู่มือการแก้ไขข้อผิดพลาด เช่น UNSUPPORTED_FILTER หรือ Insufficient credits",
      "- `smartaihub://capabilities`: ความสามารถของระบบ (Tools, Resources, Semantic Vector Search, OAuth)",
      "- `smartaihub://schema/library-search`: JSON Schema สำหรับ smartaihub_library_search",
      "- `smartaihub://schema/media-generate`: JSON Schema สำหรับการสั่งสร้างภาพและวิดีโอ",
      "",
      "หากต้องการความช่วยเหลือด่วนในแชต สามารถเรียก tool `smartaihub_help` พร้อมระบุ topic เช่น `library.search`, `media.generate`, `media.models`, `media.history`",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/library-search",
    name: "help-library-search",
    title: "SmartAIHub Library Search Guide",
    description: "คู่มือการค้นหาไฟล์ใน Library ด้วย smartaihub_library_search, filters, semantic vector query และความปลอดภัยของ Tenant",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Library Search Guide",
      "",
      "สำหรับการค้นหาไฟล์ใน Library ให้ใช้ `smartaihub_library_search` (หรือ `smartspec.knowledge.library.search`)",
      "ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง",
      "",
      "## Example Search Payload",
      "```json",
      "{",
      '  "query": "แชมพูในห้องน้ำ",',
      '  "filters": {',
      '    "file_types": ["image", "video"],',
      '    "mime_types": ["image/png", "video/mp4"],',
      '    "extensions": [".png", ".mp4"],',
      '    "filename_contains": "shampoo",',
      '    "folder_id": "folder_123",',
      '    "recursive": true,',
      '    "tags_all": ["campaign", "approved"],',
      '    "tags_any": ["product", "advertisement"],',
      '    "source": ["upload", "generated", "rendered"],',
      '    "status": ["ready"],',
      '    "created_at": {',
      '      "from": "2026-09-01T00:00:00Z",',
      '      "to": "2026-09-03T23:59:59Z"',
      "    },",
      '    "size_bytes": {',
      '      "min": 1000,',
      '      "max": 500000000',
      "    }",
      "  },",
      '  "sort_by": "created_at",',
      '  "sort_order": "desc",',
      '  "page_size": 25,',
      '  "include": ["metadata", "thumbnail"]',
      "}",
      "```",
      "",
      "## Supported Filters",
      "- `file_types`: กรองประเภทไฟล์ (`image`, `video`, `audio`, `document`, `presentation`, `folder`, `code`, `archive`)",
      "- `mime_types`: กรองตาม MIME type เช่น `image/png`, `video/mp4`",
      "- `extensions`: กรองตามนามสกุลไฟล์ เช่น `.png`, `.mp4`",
      "- `filename_contains`: กรองชื่อไฟล์ที่มีคำระบุ",
      "- `folder_id`: ID ของโฟลเดอร์",
      "- `recursive`: ค้นหารวมโฟลเดอร์ย่อย (true/false)",
      "- `tags_all`: ต้องมีครบทุกแท็ก",
      "- `tags_any`: มีแท็กใดแท็กหนึ่ง",
      "- `source`: แหล่งที่มา เช่น upload, generated, rendered, media_history",
      "- `status`: สถานะ เช่น ready, processing, failed",
      "- `created_at`: `{ from, to }` ช่วงเวลาที่สร้าง",
      "- `size_bytes`: `{ min, max }` ขนาดไฟล์เป็นไบต์",
      "",
      "## Next Actions",
      "หลังค้นพบไฟล์ สามารถเรียกดู metadata ด้วย `smartaihub_library_get_file` หรือดาวน์โหลดด้วย `smartspec.knowledge.library.download`",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/library-files",
    name: "help-library-files",
    title: "SmartAIHub Library File Access Guide",
    description: "คู่มือการเปิดไฟล์และดาวน์โหลดผ่าน smartaihub_library_get_file และ resource URIs",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Library File Access Guide",
      "",
      "การเปิดไฟล์และดาวน์โหลดจาก Library มีความปลอดภัยระดับ Tenant Isolation:",
      "1. เรียก `smartaihub_library_get_file` (หรือ `smartspec.knowledge.library.get`) โดยส่ง `item_id` หรือ `library_item_id`",
      "2. สำหรับการดาวน์โหลด ให้เรียก `smartspec.knowledge.library.download` ซึ่งจะคืน pre-signed URL หรือ download reference ที่มีอายุจำกัด",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/media-generate",
    name: "help-media-generate",
    title: "SmartAIHub Media Studio Generation & Model Guide",
    description: "คู่มือการสั่งสร้างภาพและวิดีโอ (Media Studio) พร้อมโมเดลแนะนำ การเลือกขนาด สัดส่วน และหลักเกณฑ์การหักเครดิต",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Media Studio Generation Guide",
      "",
      "สำหรับการสร้างภาพหรือวิดีโอใน Media Studio ผ่าน MCP ให้ใช้:",
      "- สร้างภาพ: `smartspec.media.generate_image` หรือ alias `smartaihub_media_generate_image` / `image.generate`",
      "- สร้างวิดีโอ: `smartspec.media.generate_video` หรือ alias `smartaihub_media_generate_video` / `video.generate`",
      "",
      "## โมเดลแนะนำยอดนิยม (Recommended Models):",
      "### 1. โมเดลสร้างภาพ (Image Models)",
      "- **GPT Image 2** (model: `gpt-image-2-text-to-image`): ภาพคุณภาพสูงมาก เข้าใจภาษาและ prompt ซับซ้อน รองรับ text บนภาพ (~70 เครดิต)",
      "- **Nano Banana 2 Lite** (model: `google-banana-2-lite`): ภาพสมจริง Hyper-realistic สไตล์ภาพถ่ายธรรมชาติ ทำงานไว ประหยัดเครดิต (~35 เครดิต)",
      "- **Nano Banana Pro** (model: `google/nano-banana-pro`): ภาพสมจริงระดับ Pro แสงเงาฟิสิกส์แม่นยำ (~90 เครดิต)",
      "- **Seedream 5.0 Pro** (model: `seedream/5-pro-text-to-image`): คมชัดสูง สไตล์คอมเมิร์ซ โฆษณา และตัวละครเอเชีย (~70 เครดิต)",
      "",
      "### 2. โมเดลสร้างวิดีโอ (Video Models)",
      "- **Grok Imagine Video 1.5** (model: `grok-imagine-video-1-5-preview`): วิดีโอไดนามิกสูง มีชีวิตชีวา เคลื่อนไหวเร็วและทรงพลัง (~125 เครดิต)",
      "- **Veo 3.1 Lite / Fast** (model: `veo3/generate-veo-3-video-lite` หรือ `veo3/generate-veo-3-video-fast`): วิดีโอระดับ Cinematic ภาพยนตร์ มุมกล้องสมจริง (~150 - 300 เครดิต)",
      "- **Gemini Omni Flash 1.1** (model: `gemini-omni-flash-1-1`): ประมวลผลไว เชื่อมโยง prompt มัลติโมดอลได้ดีเยี่ยม (~315 เครดิต)",
      "",
      "*(หมายเหตุ: ผู้ใช้สามารถระบุโมเดลอื่น ๆ ที่มีในระบบได้ โดยเรียกดูรายชื่อทั้งหมดผ่าน `smartspec.media.models.list` หรือ `smartaihub_media_models_list`)*",
      "",
      "## การคำนวณและหักเครดิต (Credit Billing)",
      "- ระบบคำนวณราคาเครดิตตามเกณฑ์เดียวกับบนเว็บ (คำนวณจาก Pricing Tiers ของแต่ละโมเดล อิงตาม aspect_ratio, resolution, duration_seconds และ num_images)",
      "- มีการตรวจสอบยอดเครดิตคงเหลือก่อนเริ่มงานเสมอ หากไม่เพียงพอระบบจะแจ้งจำนวนที่ขาดอย่างชัดเจน",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/media-models",
    name: "help-media-models",
    title: "SmartAIHub Media Models Catalog & Pricing",
    description: "สารบัญโมเดลสร้างภาพและวิดีโอ สัดส่วน ความละเอียด และราคาเครดิต",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Media Models Catalog",
      "",
      "เรียกดูโมเดลที่เปิดใช้งานทั้งหมดได้ด้วย Tool `smartspec.media.models.list` (หรือ alias `smartaihub_media_models_list` / `media.models.list`)",
      "สามารถระบุ filter `type: 'image'` หรือ `type: 'video'` ได้",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/media-history",
    name: "help-media-history",
    title: "SmartAIHub Media History Search & Task Inspection Guide",
    description: "คู่มือการค้นหาประวัติการสร้างภาพ/วิดีโอใน Media History ด้วย smartaihub_media_history_search",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Media History Guide",
      "",
      "ประวัติงานสร้างสื่อ (Media History) บันทึกทุก Task ที่สั่งผ่าน Media Studio:",
      "- ค้นหาและกรอง: `smartspec.media.history.list` หรือ alias `smartaihub_media_history_search`",
      "  - `query`: ค้นหาข้อความใน Prompt",
      "  - `media_type`: image, video, audio",
      "  - `model`: กรองชื่อหรือรหัสโมเดล",
      "  - `status`: completed, pending, processing, failed",
      "  - `from_date`, `to_date`, `recent_days`: กรองช่วงเวลา",
      "- ดูสถานะงานรายตัว: `smartspec.media.history.get` หรือ alias `smartaihub_media_history_get` (ส่ง `task_id`)",
      "- ดาวน์โหลดผลลัพธ์: `smartspec.media.history.download` (ส่ง `task_id`)",
    ].join("\n"),
  },
  {
    uri: "smartaihub://help/errors",
    name: "help-errors",
    title: "SmartAIHub MCP Errors & Troubleshooting Guide",
    description: "แนวทางการแก้ปัญหาข้อผิดพลาดของ SmartAIHub MCP Server",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub MCP Errors Guide",
      "",
      "### 1. UNSUPPORTED_FILTER",
      "เกิดขึ้นเมื่อส่ง filter ใน `smartaihub_library_search` ที่ระบบไม่รองรับ",
      "วิธีแก้: ตรวจสอบ supported_filters ใน structuredContent หรือเปิดดูที่ `smartaihub://help/library-search`",
      "",
      "### 2. Insufficient credits",
      "เกิดขึ้นเมื่อยอดเครดิตของผู้ใช้ไม่เพียงพอสำหรับการสร้างภาพหรือวิดีโอ",
      "วิธีแก้: ตรวจสอบยอดคงเหลือด้วย `smartspec.gateway.credits.get` (หรือ alias `account.get_balance`) และเลือกโมเดลที่ใช้เครดิตน้อยลง เช่น `google-banana-2-lite` (~35 credits)",
      "",
      "### 3. media_task_not_found",
      "เกิดขึ้นเมื่อไม่พบ task_id ใน Media History ของผู้ใช้ (ระบบมี Tenant & User isolation ข้ามบัญชีไม่ได้)",
    ].join("\n"),
  },
  {
    uri: "smartaihub://capabilities",
    name: "capabilities",
    title: "SmartAIHub MCP Capabilities",
    description: "สรุปภาพรวมความสามารถและสถาปัตยกรรมของ SmartAIHub MCP Server",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub MCP Server Capabilities",
      "",
      "- **Authentication:** Remote OAuth 2.0 PKCE, Device Code Pairing, Bearer MCP Key",
      "- **Tenant Isolation:** Enforced strictly in database queries and ACL layers; clients cannot override tenant_id",
      "- **Knowledge & Library:** Semantic vector search (pgvector + hybrid token matching), hierarchical folders, mime filtering",
      "- **Media Generation & Studio:** Image and video generation with dynamic credit billing matching web rules",
      "- **Media History:** Prompt keyword search, model filtering, date ranges, and status tracking",
      "- **MCP Protocol:** Supports modern Streamable HTTP and 2026-07-28 protocol with dual content (text + structuredContent)",
    ].join("\n"),
  },
  {
    uri: "smartaihub://schema/library-search",
    name: "schema-library-search",
    title: "SmartAIHub Library Search Schema",
    description: "JSON Schema ฉบับสมบูรณ์สำหรับ smartaihub_library_search",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub Library Search JSON Schema",
      "",
      "ดู inputSchema ได้จาก tools/list ของ smartaihub_library_search หรือ smartspec.knowledge.library.search",
    ].join("\n"),
  },
];

const DOCUMENTS: ResourceDocument[] = DOCUMENT_SOURCES.map(document => ({
  ...document,
  revision: createHash("sha256")
    .update(document.text)
    .digest("hex")
    .slice(0, 16),
}));

const DOCUMENT_BY_URI = new Map(
  DOCUMENTS.map(document => [document.uri, document])
);

export function listMcpDocumentationResources() {
  return {
    resources: DOCUMENTS.map(({ text: _text, ...resource }) => resource),
    ...{ ttlMs: 60_000, cacheScope: "public" as const },
  };
}

export function readMcpDocumentationResource(uri: unknown) {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 256) {
    throw Object.assign(new Error("Invalid resource URI"), { code: -32602 });
  }
  const isAllowedUri =
    uri.startsWith("smartaihub://docs/mcp/") ||
    uri.startsWith("smartaihub://help/") ||
    uri.startsWith("smartaihub://schema/") ||
    uri === "smartaihub://capabilities";

  if (/%2f|%2e|%5c/i.test(uri) || uri.includes("..") || !isAllowedUri) {
    throw Object.assign(new Error("Resource URI is not allowed"), {
      code: -32602,
    });
  }
  const document = DOCUMENT_BY_URI.get(uri);
  if (!document) {
    throw Object.assign(new Error("Resource not found"), { code: -32002 });
  }
  return {
    contents: [
      {
        uri: document.uri,
        mimeType: document.mimeType,
        text: document.text,
      },
    ],
    revision: document.revision,
    ...{ ttlMs: 60_000, cacheScope: "public" as const },
  };
}
