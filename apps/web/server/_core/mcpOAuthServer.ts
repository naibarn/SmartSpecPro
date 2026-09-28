import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";

import { authorizeRequest } from "./authz";
import {
  approveMcpOAuthTransaction,
  createMcpOAuthTransaction,
  denyMcpOAuthTransaction,
  exchangeMcpOAuthAuthorizationCode,
  getActiveMcpOAuthClient,
  getMcpOAuthPublicJwks,
  getMcpOAuthServerConfig,
  getMcpOAuthTransaction,
  MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
  isMcpOAuthAuthorizationServerEnabled,
  isMcpOAuthTenantEnabled,
  normalizeMcpOAuthScopes,
  registerMcpOAuthClient,
  revokeMcpOAuthToken,
  rotateMcpOAuthRefreshToken,
} from "../services/mcpOAuthAuthorizationService";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";
import { upsertConnectedDevice } from "../services/connectedDeviceService";
import {
  attachMcpTransportTelemetry,
  setMcpTelemetryAuth,
} from "../services/mcpTransportTelemetry";
import { rateLimit } from "./limits";

function jsonError(
  res: Response,
  status: number,
  error: string,
  description?: string
) {
  res.status(status).json({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function htmlEscape(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character
  );
}

function htmlPage(title: string, body: string, lang = "en"): string {
  return `<!doctype html><html lang="${htmlEscape(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#172033;background:#f8fafc}main{border:1px solid #d9deea;border-radius:16px;padding:2rem;background:#fff;box-shadow:0 8px 32px #17203312}.eyebrow{font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0b84f3}h1{margin:.45rem 0 0;font-size:1.7rem}h2{margin:1.7rem 0 .7rem;font-size:1.05rem}.lead{color:#46536b;line-height:1.55}.hint{color:#5c667a;font-size:.86rem;line-height:1.5}.warning{border:1px solid #f4d59a;background:#fff8e7;border-radius:10px;padding:.8rem;color:#76540a;font-size:.88rem;line-height:1.5}dl{display:grid;grid-template-columns:minmax(9rem,auto) 1fr;gap:.55rem .8rem;margin:1.4rem 0;padding:1rem;border-radius:12px;background:#f8fafc;font-size:.9rem}dt{color:#5c667a}dd{margin:0;font-weight:600;overflow-wrap:anywhere}code{font-family:ui-monospace,monospace;font-size:.84em}.scopes{padding-left:1.2rem}.scopes li{margin:.6rem 0}.scopes span{display:block;color:#5c667a;font-size:.86rem;line-height:1.4}.actions{display:flex;gap:.6rem;margin-top:1.5rem}button{border:0;border-radius:9px;padding:.72rem 1rem;font-weight:600;cursor:pointer}.primary{background:#0b84f3;color:#fff}.secondary{background:#eef2f7;color:#172033}</style></head><body><main>${body}</main></body></html>`;
}

function requireEnabled(res: Response): boolean {
  if (!isMcpOAuthAuthorizationServerEnabled()) {
    jsonError(res, 404, "not_found");
    return false;
  }
  return true;
}

function getOrigin(req: Request): string {
  const configured = getMcpOAuthServerConfig()?.issuer;
  if (configured) return configured;
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
}

function normalizedOrigin(value: string | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function consentFormSecret(): string {
  return (
    process.env.MCP_OAUTH_CONSENT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ""
  );
}

export function createMcpOAuthConsentFormToken(transactionId: string): string | null {
  const secret = consentFormSecret();
  if (!secret || !transactionId.trim()) return null;
  return crypto
    .createHmac("sha256", secret)
    .update(`mcp-oauth-consent-v1:${transactionId}`)
    .digest("base64url");
}

export function verifyMcpOAuthConsentFormToken(
  transactionId: string,
  providedToken: string | undefined,
): boolean {
  const expected = createMcpOAuthConsentFormToken(transactionId);
  if (!expected || !providedToken) return false;
  const provided = Buffer.from(providedToken, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    provided.length === expectedBuffer.length &&
    crypto.timingSafeEqual(provided, expectedBuffer)
  );
}

export function isTrustedMcpOAuthConsentOrigin(
  originHeader: string | undefined,
  refererHeader: string | undefined,
  expectedOrigins: string | readonly string[],
): boolean {
  const normalizedOriginHeader = originHeader?.trim();
  // A non-null Origin is authoritative. Do not fall back to Referer when it
  // is malformed or foreign, otherwise an attacker could pair a bad Origin
  // with a trusted Referer and bypass the browser provenance check.
  const candidate =
    normalizedOriginHeader && normalizedOriginHeader !== "null"
      ? normalizedOrigin(normalizedOriginHeader)
      : normalizedOrigin(refererHeader);
  const expected = (Array.isArray(expectedOrigins) ? expectedOrigins : [expectedOrigins])
    .map(normalizedOrigin)
    .filter((value): value is string => Boolean(value));
  return Boolean(candidate && expected.includes(candidate));
}

function enforceConsentOrigin(
  req: Request,
  res: Response,
  allowNullOriginWithFormToken = false,
): boolean {
  const originHeader = req.get("origin")?.trim() || "";
  const refererHeader = req.get("referer")?.trim() || "";
  const hasBrowserOriginSignal = Boolean(originHeader || refererHeader);
  const trustedOrigins = [
    getOrigin(req),
    getCachedMcpRuntimeConfig().publicBaseUrl,
  ];
  const trustedBrowserOrigin = isTrustedMcpOAuthConsentOrigin(
    originHeader,
    refererHeader,
    trustedOrigins,
  );
  const nullOriginFormFallback =
    allowNullOriginWithFormToken &&
    (!originHeader || originHeader === "null") &&
    (!refererHeader || trustedBrowserOrigin);
  if (
    !hasBrowserOriginSignal &&
    process.env.NODE_ENV === "production" &&
    !allowNullOriginWithFormToken
  ) {
    jsonError(res, 403, "invalid_request", "Missing browser origin");
    return false;
  }
  if (
    hasBrowserOriginSignal &&
    !trustedBrowserOrigin &&
    !nullOriginFormFallback
  ) {
    jsonError(res, 403, "invalid_request", "Invalid browser origin");
    return false;
  }
  return true;
}

async function authenticatedSession(req: Request) {
  const auth = await authorizeRequest(req, {
    allowBearer: false,
    allowSession: true,
  });
  if (!auth.ok || auth.mode !== "session" || !auth.userId || !auth.tenantId)
    return null;
  return auth;
}

function redirectUriWithParams(
  res: Response,
  redirectUri: string,
  params: Record<string, string>
) {
  res.redirect(302, redirectUrlWithParams(redirectUri, params));
}

function redirectUrlWithParams(
  redirectUri: string,
  params: Record<string, string>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url.toString();
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.flatMap(item => String(item).split(/[\s,]+/));
  return String(value || "")
    .split(/[\s,]+/)
    .filter(Boolean);
}

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object"
    ? (req.body as Record<string, unknown>)
    : {};
}

type OAuthLocale = "en" | "th";

const OAUTH_SCOPE_COPY: Record<
  string,
  {
    en: { label: string; description: string };
    th: { label: string; description: string };
  }
> = {
  "mcp:read": {
    en: {
      label: "Discover and read MCP",
      description:
        "See available SmartAIHub tools and read resources your account can access.",
    },
    th: {
      label: "ค้นหาและอ่าน MCP",
      description:
        "ดู tools ของ SmartAIHub และอ่านข้อมูลที่บัญชีของคุณเข้าถึงได้",
    },
  },
  "mcp:write": {
    en: {
      label: "Run actions",
      description: "Use actions that can change data or start operations.",
    },
    th: {
      label: "สั่งงานและแก้ไขข้อมูล",
      description: "ใช้คำสั่งที่อาจเปลี่ยนข้อมูลหรือเริ่มงาน",
    },
  },
  "llm:chat": {
    en: {
      label: "Use SmartAIHub AI models",
      description: "Use the AI gateway models available to your account.",
    },
    th: {
      label: "ใช้โมเดล AI ของ SmartAIHub",
      description: "ใช้โมเดล AI gateway ที่บัญชีของคุณใช้งานได้",
    },
  },
  "media:read": {
    en: {
      label: "View media history",
      description:
        "See image and video history that your account is allowed to access.",
    },
    th: {
      label: "ดูประวัติภาพและวิดีโอ",
      description: "ดู media history ที่บัญชีของคุณมีสิทธิ์เข้าถึง",
    },
  },
  "media:generate": {
    en: {
      label: "Generate images and videos",
      description: "Start permitted image or video generation jobs.",
    },
    th: {
      label: "สร้างภาพและวิดีโอ",
      description: "เริ่มงานสร้างภาพหรือวิดีโอที่ได้รับอนุญาต",
    },
  },
  "media:download": {
    en: {
      label: "Download media",
      description: "Download image and video files allowed by your account.",
    },
    th: {
      label: "ดาวน์โหลดภาพและวิดีโอ",
      description: "ดาวน์โหลดไฟล์ภาพและวิดีโอที่บัญชีของคุณได้รับอนุญาต",
    },
  },
  "remotion:submit": {
    en: {
      label: "Submit Remotion renders",
      description:
        "Send an allowed Remotion video render job to the worker system.",
    },
    th: {
      label: "ส่งงาน Remotion render",
      description:
        "ส่งงาน render วิดีโอ Remotion ไปยังระบบ worker ที่ได้รับอนุญาต",
    },
  },
  "remotion:read": {
    en: {
      label: "View render jobs",
      description: "Read the status and output of permitted Remotion jobs.",
    },
    th: {
      label: "ดูงาน render",
      description: "อ่านสถานะและผลลัพธ์งาน Remotion ที่ได้รับอนุญาต",
    },
  },
  "remotion:cancel": {
    en: {
      label: "Cancel render jobs",
      description: "Cancel a permitted Remotion render job.",
    },
    th: {
      label: "ยกเลิกงาน render",
      description: "ยกเลิกงาน Remotion ที่ได้รับอนุญาต",
    },
  },
  "library:read": {
    en: {
      label: "View library",
      description: "Read library items allowed for your account.",
    },
    th: {
      label: "อ่าน library",
      description: "อ่านรายการใน library ที่บัญชีของคุณเข้าถึงได้",
    },
  },
  "library:download": {
    en: {
      label: "Download library files",
      description: "Download library files allowed for your account.",
    },
    th: {
      label: "ดาวน์โหลดไฟล์ library",
      description: "ดาวน์โหลดไฟล์ library ที่บัญชีของคุณได้รับอนุญาต",
    },
  },
  "library:search": {
    en: {
      label: "Search library",
      description: "Search library items visible to your account.",
    },
    th: {
      label: "ค้นหาใน library",
      description: "ค้นหารายการ library ที่บัญชีของคุณมีสิทธิ์เห็น",
    },
  },
  "library:upload": {
    en: {
      label: "Upload to library",
      description: "Add files to the library through the approved publication flow.",
    },
    th: {
      label: "อัปโหลดเข้า library",
      description: "เพิ่มไฟล์เข้า library ผ่านขั้นตอนเผยแพร่ที่ได้รับอนุญาต",
    },
  },
  "hermes:connect": {
    en: {
      label: "Connect Hermes",
      description: "Connect an approved Hermes runtime to SmartAIHub.",
    },
    th: {
      label: "เชื่อมต่อ Hermes",
      description: "เชื่อม runtime Hermes ที่ได้รับอนุมัติกับ SmartAIHub",
    },
  },
  "hermes:read": {
    en: {
      label: "View Hermes jobs",
      description: "Read Hermes connection and job information.",
    },
    th: {
      label: "ดูงาน Hermes",
      description: "อ่านข้อมูลการเชื่อมต่อและงาน Hermes",
    },
  },
  "hermes:generate": {
    en: {
      label: "Generate through Hermes",
      description: "Use approved Hermes generation capabilities.",
    },
    th: {
      label: "สร้างสื่อผ่าน Hermes",
      description: "ใช้ความสามารถสร้างสื่อผ่าน Hermes ที่ได้รับอนุญาต",
    },
  },
  "hermes:disconnect": {
    en: {
      label: "Disconnect Hermes",
      description: "Disconnect the approved Hermes runtime.",
    },
    th: {
      label: "ตัดการเชื่อมต่อ Hermes",
      description: "ตัดการเชื่อมต่อ runtime Hermes ที่ได้รับอนุมัติ",
    },
  },
};

function requestedLocale(req: Request): OAuthLocale {
  return /^th(?:-|,|;)/i.test(req.get("accept-language") || "") ? "th" : "en";
}

function scopeCopy(
  scope: string,
  locale: OAuthLocale
): { label: string; description: string } {
  return (
    OAUTH_SCOPE_COPY[scope]?.[locale] || {
      label:
        locale === "th"
          ? "สิทธิ์เพิ่มเติมของ SmartAIHub"
          : "Additional SmartAIHub permission",
      description:
        locale === "th"
          ? "ความสามารถเพิ่มเติมที่ client นี้ร้องขอ"
          : "An additional capability requested by this client.",
    }
  );
}

function consentCopy(locale: OAuthLocale) {
  if (locale === "th") {
    return {
      title: "อนุมัติการเชื่อมต่อ SmartAIHub MCP",
      eyebrow: "SmartAIHub MCP",
      connect: "เชื่อมต่อ",
      lead: "ตรวจสอบว่าคลินต์นี้จะเข้าถึงอะไรได้บ้างก่อนดำเนินการต่อ",
      client: "Client",
      origin: "Origin ของ callback ที่ยืนยันแล้ว",
      tenant: "Tenant/workspace ที่อนุมัติ",
      account: "บัญชีที่กำลังเข้าสู่ระบบ",
      tokenLifetime: "อายุ token",
      accessToken: "Access token",
      refreshAuthorization: "สิทธิ์สำหรับ refresh token",
      minutes: "นาที",
      days: "วัน",
      permissions: "สิทธิ์ที่ร้องขอ",
      warningTitle: "สิ่งที่ควรทราบก่อนอนุมัติ",
      warnings: [
        "สิทธิ์ write อาจเปลี่ยนข้อมูลหรือเริ่มงานแทนคุณ",
        "สิทธิ์สร้างสื่อใช้เริ่มงานสร้างภาพและวิดีโอ",
        "สิทธิ์ render ใช้ส่งงาน Remotion และอ่านผลลัพธ์ที่ได้รับอนุญาต",
        "สิทธิ์ download ใช้ดาวน์โหลดไฟล์จาก library และ media history ตามสิทธิ์ของบัญชี",
      ],
      revokeHint:
        "คุณสามารถยกเลิกการเชื่อมต่อนี้ภายหลังได้ที่ Settings → MCP และอุปกรณ์ SmartAIHub จะไม่ส่งรหัสผ่านให้ client",
      allow: "อนุญาตการเข้าถึง",
      deny: "ไม่อนุญาต",
    };
  }
  return {
    title: "Authorize SmartAIHub MCP",
    eyebrow: "SmartAIHub MCP",
    connect: "Connect",
    lead: "Review what this application can access before continuing.",
    client: "Client",
    origin: "Verified callback origin",
    tenant: "Approved tenant/workspace",
    account: "Signed-in account",
    tokenLifetime: "Token lifetime",
    accessToken: "Access token",
    refreshAuthorization: "refresh authorization",
    minutes: "minutes",
    days: "days",
    permissions: "Requested permissions",
    warningTitle: "Important before you approve",
    warnings: [
      "Write permissions may change data or start operations on your behalf.",
      "Media-generation permissions can start image and video generation jobs.",
      "Render permissions can submit Remotion jobs and read permitted outputs.",
      "Download permissions can download library and media-history files allowed for your account.",
    ],
    revokeHint:
      "You can revoke this connection later from Settings → MCP & Devices. SmartAIHub never shares your password with the client.",
    allow: "Allow access",
    deny: "Deny",
  };
}

function callbackOrigin(redirectUri: string): string {
  try {
    return new URL(redirectUri).origin;
  } catch {
    return "registered callback";
  }
}

function consentPage(input: {
  clientName: string;
  redirectUri: string;
  scopes: string[];
  tenantId: string;
  account: string;
  transactionId: string;
  locale: OAuthLocale;
}): string {
  const copy = consentCopy(input.locale);
  const csrfToken = createMcpOAuthConsentFormToken(input.transactionId);
  const scopeItems = input.scopes
    .map(scope => {
      const copy = scopeCopy(scope, input.locale);
      return `<li><strong>${htmlEscape(copy.label)}</strong><span>${htmlEscape(copy.description)}</span></li>`;
    })
    .join("");
  const accessMinutes = Math.round(MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS / 60);
  const refreshDays = Math.round(
    MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS / (24 * 60 * 60)
  );
  return htmlPage(
    copy.title,
    `
    <div class="eyebrow">${htmlEscape(copy.eyebrow)}</div>
    <h1>${htmlEscape(copy.connect)} ${htmlEscape(input.clientName)}</h1>
    <p class="lead">${htmlEscape(copy.lead)}</p>
    <dl>
      <dt>${htmlEscape(copy.client)}</dt><dd>${htmlEscape(input.clientName)}</dd>
      <dt>${htmlEscape(copy.origin)}</dt><dd><code>${htmlEscape(callbackOrigin(input.redirectUri))}</code></dd>
      <dt>${htmlEscape(copy.tenant)}</dt><dd><code>${htmlEscape(input.tenantId)}</code></dd>
      <dt>${htmlEscape(copy.account)}</dt><dd>${htmlEscape(input.account)}</dd>
      <dt>${htmlEscape(copy.tokenLifetime)}</dt><dd>${htmlEscape(copy.accessToken)} ${accessMinutes} ${htmlEscape(copy.minutes)}; ${htmlEscape(copy.refreshAuthorization)} ${refreshDays} ${htmlEscape(copy.days)}</dd>
    </dl>
    <h2>${htmlEscape(copy.permissions)}</h2>
    <ul class="scopes">${scopeItems}</ul>
    <div class="warning"><strong>${htmlEscape(copy.warningTitle)}</strong><ul>${copy.warnings.map(item => `<li>${htmlEscape(item)}</li>`).join("")}</ul><div>${htmlEscape(input.locale === "th" ? "การอนุมัติยังอยู่ภายใต้สิทธิ์ของ tenant และสิทธิ์ของไฟล์/งานแต่ละรายการ" : "Approval remains subject to tenant and per-file/per-job permissions.")}</div></div>
    <p class="hint">${htmlEscape(copy.revokeHint)}</p>
    <form method="post" action="/oauth/authorize/decision">
      <input type="hidden" name="transaction_id" value="${htmlEscape(input.transactionId)}">
      ${csrfToken ? `<input type="hidden" name="csrf_token" value="${htmlEscape(csrfToken)}">` : ""}
      <div class="actions"><button class="primary" name="decision" value="approve">${htmlEscape(copy.allow)}</button><button class="secondary" name="decision" value="deny">${htmlEscape(copy.deny)}</button></div>
      <div style="margin-top: 1.5rem; padding: 0.875rem 1rem; border-radius: 0.5rem; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 0.8125rem; line-height: 1.4; color: #475569;">
        <strong>${input.locale === "th" ? "💡 ข้อแนะนำสำหรับ Server / Container / WSL:" : "💡 Tip for Server / Container / WSL users:"}</strong>
        <p style="margin: 0.25rem 0 0 0;">
          ${input.locale === "th"
            ? "หากอนุมัติแล้วเบราว์เซอร์แจ้งเตือน <code>127.0.0.1 ปฏิเสธการเชื่อมต่อ</code> (เนื่องจาก Client รันอยู่คนละเครื่องกับเบราว์เซอร์) คุณสามารถเชื่อมต่อผ่านคำสั่ง Device Code ได้ทันทีโดยไม่ต้องผ่านพอร์ต 8989:"
            : "If your browser shows <code>127.0.0.1 connection refused</code> after approving, connect using Device Code instead without loopback ports:"}
        </p>
        <code style="display: block; margin-top: 0.35rem; padding: 0.35rem 0.5rem; background: #0f172a; color: #38bdf8; border-radius: 0.375rem; font-family: monospace;">${input.clientName.toLowerCase().includes("hermes") ? "hermes mcp login smartaihub --device-code" : "openclaw mcp login smartaihub --device-code"}</code>
      </div>
    </form>`,
    input.locale
  );
}

function consentErrorPage(
  res: Response,
  status: number,
  title: string,
  message: string,
  locale: OAuthLocale = "en"
): void {
  res
    .status(status)
    .type("html")
    .send(
      htmlPage(
        title,
        `<div class="eyebrow">SmartAIHub MCP</div><h1>${htmlEscape(title)}</h1><p class="lead">${htmlEscape(message)}</p><p class="hint">${locale === "th" ? "กลับไปที่ MCP client แล้วเริ่มการเชื่อมต่อใหม่ ระบบยังไม่ได้ออก token ให้" : "Return to the MCP client and start the connection again. No token was issued."}</p>`,
        locale
      )
    );
}

function respondAuthorizeError(
  req: Request,
  res: Response,
  status: number,
  error: string,
  description: string
): void {
  if (req.accepts("html")) {
    const locale = requestedLocale(req);
    const title =
      error === "invalid_client"
        ? "MCP client is not registered"
        : error === "access_denied"
          ? "Access was not granted"
          : "MCP connection request unavailable";
    consentErrorPage(res, status, title, description, locale);
    return;
  }
  jsonError(res, status, error, description);
}

function isBrowserNavigation(req: Request): boolean {
  return (
    req.accepts("html") === "html" && req.get("sec-fetch-mode") === "navigate"
  );
}

function consentRedirectPage(
  res: Response,
  redirectUrl: string,
  locale: OAuthLocale
): void {
  const title =
    locale === "th" ? "ไม่ได้อนุมัติการเชื่อมต่อ" : "Access was not granted";
  const message =
    locale === "th"
      ? "คุณปฏิเสธสิทธิ์แล้ว ระบบกำลังส่งผลกลับไปยัง MCP client"
      : "You denied the requested permissions. We are returning the result to your MCP client.";
  res
    .type("html")
    .send(
      htmlPage(
        title,
        `<meta http-equiv="refresh" content="2;url=${htmlEscape(redirectUrl)}"><div class="eyebrow">SmartAIHub MCP</div><h1>${htmlEscape(title)}</h1><p class="lead">${htmlEscape(message)}</p><p class="hint"><a href="${htmlEscape(redirectUrl)}">Continue to the MCP client</a></p>`,
        locale
      )
    );
}

export function registerMcpOAuthServerRoutes(app: Express): void {
  app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
    if (!requireEnabled(res)) return;
    const config = getMcpOAuthServerConfig()!;
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      issuer: config.issuer,
      authorization_endpoint: `${config.issuer}/oauth/authorize`,
      token_endpoint: `${config.issuer}/oauth/token`,
      revocation_endpoint: `${config.issuer}/oauth/revoke`,
      registration_endpoint:
        getCachedMcpRuntimeConfig().oauthDynamicRegistrationEnabled
          ? `${config.issuer}/oauth/register`
          : undefined,
      jwks_uri: config.jwksUri,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: config.scopesSupported,
    });
  });

  app.get("/.well-known/openid-configuration", async (_req, res) => {
    if (!requireEnabled(res)) return;
    const config = getMcpOAuthServerConfig()!;
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      issuer: config.issuer,
      authorization_endpoint: `${config.issuer}/oauth/authorize`,
      token_endpoint: `${config.issuer}/oauth/token`,
      revocation_endpoint: `${config.issuer}/oauth/revoke`,
      registration_endpoint:
        getCachedMcpRuntimeConfig().oauthDynamicRegistrationEnabled
          ? `${config.issuer}/oauth/register`
          : undefined,
      jwks_uri: config.jwksUri,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: config.scopesSupported,
    });
  });

  app.get("/.well-known/jwks.json", async (_req, res) => {
    if (!requireEnabled(res)) return;
    const jwks = await getMcpOAuthPublicJwks();
    if (!jwks)
      return jsonError(
        res,
        503,
        "temporarily_unavailable",
        "OAuth signing key is not configured"
      );
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(jwks);
  });

  // A few MCP clients probe the registration URL before issuing POST. Keep
  // that probe JSON-only so a missing/disabled route can never fall through
  // to the SPA HTML shell and produce an opaque JSON parsing error client-side.
  app.get("/oauth/register", (_req, res) => {
    if (!requireEnabled(res)) return;
    if (!getCachedMcpRuntimeConfig().oauthDynamicRegistrationEnabled)
      return jsonError(res, 404, "not_found");
    res.setHeader("Allow", "POST");
    return jsonError(
      res,
      405,
      "method_not_allowed",
      "Use POST to register an OAuth client"
    );
  });

  app.post(
    "/oauth/register",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, {
        transport: "oauth",
        endpoint: "/oauth/register",
      });
      next();
    },
    rateLimit("mcp-oauth-register", { rpm: 20 }),
    express.json({ limit: "32kb" }),
    async (req, res) => {
      if (!requireEnabled(res)) return;
      if (!getCachedMcpRuntimeConfig().oauthDynamicRegistrationEnabled)
        return jsonError(res, 404, "not_found");
      try {
        const body = parseBody(req);
        const client = await registerMcpOAuthClient({
          clientName: String(body.client_name || "").trim(),
          clientUri: body.client_uri ? String(body.client_uri) : null,
          logoUri: body.logo_uri ? String(body.logo_uri) : null,
          redirectUris: parseList(body.redirect_uris),
          metadata: {
            client_class: "mcp",
            registration_ip_hash: crypto
              .createHash("sha256")
              .update(String(req.ip || "unknown"))
              .digest("hex")
              .slice(0, 16),
          },
        });
        res.status(201).json(client);
      } catch (error) {
        jsonError(
          res,
          400,
          "invalid_client_metadata",
          error instanceof Error ? error.message : "Invalid client metadata"
        );
      }
    }
  );

  app.get(
    "/oauth/authorize",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, {
        transport: "oauth",
        endpoint: "/oauth/authorize",
      });
      next();
    },
    rateLimit("mcp-oauth-authorize", { rpm: 60 }),
    async (req, res) => {
      if (!requireEnabled(res)) return;
      try {
        const existingTransactionId = String(req.query.tx || "").trim();
        if (existingTransactionId) {
          const tx = await getMcpOAuthTransaction(existingTransactionId);
          if (
            !tx ||
            tx.status !== "pending" ||
            tx.expiresAt.getTime() <= Date.now()
          ) {
            consentErrorPage(
              res,
              400,
              "Connection request expired",
              "This authorization request is expired, already used, or no longer valid.",
              requestedLocale(req)
            );
            return;
          }
          const auth = await authenticatedSession(req);
          if (!auth) {
            res.redirect(
              302,
              `/login?returnUrl=${encodeURIComponent(`/oauth/authorize?tx=${existingTransactionId}`)}`
            );
            return;
          }
          if (!(await isMcpOAuthTenantEnabled(auth.tenantId!))) {
            consentErrorPage(
              res,
              403,
              "MCP OAuth is unavailable",
              "OAuth connections are not enabled for this tenant yet."
            );
            return;
          }
          setMcpTelemetryAuth(req, {
            ok: true,
            mode: auth.mode,
            userId: auth.userId,
            tenantId: auth.tenantId,
          });
          const client = await getActiveMcpOAuthClient(tx.clientId);
          if (!client) {
            respondAuthorizeError(
              req,
              res,
              400,
              "invalid_client",
              "This OAuth client is no longer registered or has been revoked."
            );
            return;
          }
          res.type("html").send(
            consentPage({
              clientName: client.clientName,
              redirectUri: tx.redirectUri,
              scopes: tx.requestedScopes,
              tenantId: auth.tenantId!,
              account: auth.user.email || auth.user.name || "your account",
              transactionId: tx.id,
              locale: requestedLocale(req),
            })
          );
          return;
        }
        const clientId = String(req.query.client_id || "").trim();
        const redirectUri = String(req.query.redirect_uri || "").trim();
        const resource = String(req.query.resource || "").trim();
        const codeChallenge = String(req.query.code_challenge || "").trim();
        const method = String(req.query.code_challenge_method || "").trim();
        const responseType = String(req.query.response_type || "").trim();
        const state = req.query.state ? String(req.query.state) : null;
        const client = await getActiveMcpOAuthClient(clientId);
        const config = getMcpOAuthServerConfig();
        if (
          !client ||
          !config ||
          responseType !== "code" ||
          resource !== config.resource ||
          method !== "S256" ||
          !client.redirectUris.includes(redirectUri)
        ) {
          respondAuthorizeError(
            req,
            res,
            400,
            "invalid_request",
            "The client, callback origin, resource, or PKCE request is invalid."
          );
          return;
        }
        const txId = await createMcpOAuthTransaction({
          clientId,
          redirectUri,
          resource,
          codeChallenge,
          codeChallengeMethod: "S256",
          scopes: normalizeMcpOAuthScopes(
            req.query.scope ? String(req.query.scope) : "",
            config.scopesSupported
          ),
          state,
        });
        const auth = await authenticatedSession(req);
        if (!auth) {
          const returnUrl = `/oauth/authorize?tx=${encodeURIComponent(txId)}`;
          res.redirect(
            302,
            `/login?returnUrl=${encodeURIComponent(returnUrl)}`
          );
          return;
        }
        if (!(await isMcpOAuthTenantEnabled(auth.tenantId!))) {
          consentErrorPage(
            res,
            403,
            "MCP OAuth is unavailable",
            "OAuth connections are not enabled for this tenant yet.",
            requestedLocale(req)
          );
          return;
        }
        setMcpTelemetryAuth(req, {
          ok: true,
          mode: auth.mode,
          userId: auth.userId,
          tenantId: auth.tenantId,
        });
        const tx = await getMcpOAuthTransaction(txId);
        if (!tx) {
          respondAuthorizeError(
            req,
            res,
            400,
            "invalid_request",
            "The authorization request could not be created. Please start again from your MCP client."
          );
          return;
        }
        res.type("html").send(
          consentPage({
            clientName: client.clientName,
            redirectUri: tx.redirectUri,
            scopes: tx.requestedScopes,
            tenantId: auth.tenantId!,
            account: auth.user.email || auth.user.name || "your account",
            transactionId: tx.id,
            locale: requestedLocale(req),
          })
        );
      } catch (error) {
        respondAuthorizeError(
          req,
          res,
          400,
          "invalid_request",
          error instanceof Error
            ? error.message
            : "Invalid authorization request"
        );
      }
    }
  );

  app.post(
    "/oauth/authorize/decision",
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (req, res) => {
      const txId = String(req.body?.transaction_id || "").trim();
      const hasValidFormToken = verifyMcpOAuthConsentFormToken(
        txId,
        String(req.body?.csrf_token || "").trim(),
      );
      if (!requireEnabled(res) || !enforceConsentOrigin(req, res, hasValidFormToken)) return;
      if (!hasValidFormToken) {
        jsonError(
          res,
          403,
          "invalid_request",
          "The authorization form is expired or invalid. Start the connection again.",
        );
        return;
      }
      const tx = await getMcpOAuthTransaction(txId);
      if (
        !tx ||
        tx.status !== "pending" ||
        tx.expiresAt.getTime() <= Date.now()
      ) {
        consentErrorPage(
          res,
          400,
          "Connection request unavailable",
          "This authorization request cannot be found or has already been completed."
        );
        return;
      }
      const auth = await authenticatedSession(req);
      if (!auth) {
        res.redirect(
          302,
          `/login?returnUrl=${encodeURIComponent(`/oauth/authorize?tx=${txId}`)}`
        );
        return;
      }
      if (!(await isMcpOAuthTenantEnabled(auth.tenantId!))) {
        consentErrorPage(
          res,
          403,
          "MCP OAuth is unavailable",
          "OAuth connections are not enabled for this tenant yet."
        );
        return;
      }
      setMcpTelemetryAuth(req, {
        ok: true,
        mode: auth.mode,
        userId: auth.userId,
        tenantId: auth.tenantId,
      });
      try {
        if (String(req.body?.decision || "") !== "approve") {
          await denyMcpOAuthTransaction(txId);
          const redirectUrl = redirectUrlWithParams(tx.redirectUri, {
            error: "access_denied",
            error_description: "The user denied access",
            ...(tx.state ? { state: tx.state } : {}),
          });
          consentRedirectPage(res, redirectUrl, requestedLocale(req));
          return;
        }
        const approved = await approveMcpOAuthTransaction({
          transactionId: txId,
          userId: auth.userId!,
          tenantId: auth.tenantId!,
          scopes: tx.requestedScopes,
        });
        redirectUriWithParams(res, tx.redirectUri, {
          code: approved.code,
          ...(tx.state ? { state: tx.state } : {}),
        });
      } catch (error) {
        jsonError(
          res,
          400,
          "invalid_request",
          error instanceof Error ? error.message : "Authorization failed"
        );
      }
    }
  );

  app.post(
    "/oauth/token",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, {
        transport: "oauth",
        endpoint: "/oauth/token",
      });
      next();
    },
    rateLimit("mcp-oauth-token", { rpm: 120 }),
    express.urlencoded({ extended: false, limit: "32kb" }),
    express.json({ limit: "32kb" }),
    async (req, res) => {
      if (!requireEnabled(res)) return;
      const body = parseBody(req);
      try {
        const grantType = String(body.grant_type || "");
        let tokens;
        if (grantType === "authorization_code") {
          tokens = await exchangeMcpOAuthAuthorizationCode({
            clientId: String(body.client_id || ""),
            code: String(body.code || ""),
            redirectUri: String(body.redirect_uri || ""),
            codeVerifier: String(body.code_verifier || ""),
          });
        } else if (grantType === "refresh_token") {
          tokens = await rotateMcpOAuthRefreshToken(
            String(body.refresh_token || "")
          );
        } else {
          return jsonError(res, 400, "unsupported_grant_type");
        }
        await upsertConnectedDevice({
          tenantId: tokens.tenantId,
          ownerUserId: tokens.userId,
          deviceId: `mcp-oauth:${tokens.clientId}:${tokens.grantId}`,
          displayName: tokens.clientName || "SmartAIHub MCP client",
          runtimeType: "mcp-client",
          authKind: "mcp_oauth",
          connectionMethod: "oauth",
          scopes: tokens.scopes,
          approvedAt: new Date(),
          accessTokenExpiresAt: tokens.expiresAt,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          metadataJson: {
            grantId: tokens.grantId,
            clientId: tokens.clientId,
            clientName: tokens.clientName,
            redirectUri: tokens.redirectUri,
          },
        }).catch(() => undefined);
        setMcpTelemetryAuth(req, {
          ok: true,
          mode: "bearer",
          tokenUse: "mcp_oauth",
          userId: tokens.userId,
          tenantId: tokens.tenantId,
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
          token_type: "Bearer",
          access_token: tokens.token,
          expires_in: Math.max(
            1,
            Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000)
          ),
          refresh_token: tokens.refreshToken,
          scope: tokens.scopes.join(" "),
        });
      } catch {
        if (isBrowserNavigation(req)) {
          consentErrorPage(
            res,
            400,
            "OAuth connection expired or revoked",
            "This connection is no longer active. Return to your MCP client and connect again.",
            requestedLocale(req)
          );
          return;
        }
        jsonError(res, 400, "invalid_grant");
      }
    }
  );

  app.post(
    "/oauth/revoke",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, {
        transport: "oauth",
        endpoint: "/oauth/revoke",
      });
      next();
    },
    rateLimit("mcp-oauth-revoke", { rpm: 60 }),
    express.urlencoded({ extended: false, limit: "16kb" }),
    express.json({ limit: "16kb" }),
    async (req, res) => {
      if (!requireEnabled(res)) return;
      const body = parseBody(req);
      await revokeMcpOAuthToken(String(body.token || "")).catch(
        () => undefined
      );
      res.status(200).end();
    }
  );
}
