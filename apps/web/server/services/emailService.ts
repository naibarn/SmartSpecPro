/**
 * Email Service — sends emails via SMTP (Nodemailer)
 * Reads SMTP config from systemSettings (category: "smtp")
 * Falls back to console logging if SMTP is not configured
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "./crypto";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

let cachedConfig: SmtpConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

function allowInsecureSmtpTls(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false";
}

function shouldLogEmailCodes(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LOG_EMAIL_VERIFICATION_CODES === "true";
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "[redacted]";
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? "***" : "*"}@${domain}`;
}

function logCodeFallback(kind: "Verify" | "Reset", to: string, code: string): void {
  if (!shouldLogEmailCodes()) {
    console.log(`[Email] ${kind} code fallback suppressed for ${maskEmail(to)}`);
    return;
  }

  console.log(`\n========================================`);
  console.log(`[${kind}] Email: ${maskEmail(to)}`);
  console.log(`[${kind}] Code:  ${code}`);
  console.log(`========================================\n`);
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return cachedConfig;

  try {
    const db = await getDb();
    if (!db) return null;

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "smtp"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      if (s.isSensitive && s.value) {
        try { map[s.key] = decrypt(s.value); } catch { map[s.key] = s.value; }
      } else {
        map[s.key] = s.value;
      }
    }

    if (!map.host || !map.user || !map.pass) return null;

    cachedConfig = {
      host: map.host,
      port: parseInt(map.port || "587", 10),
      secure: map.secure === "true",
      user: map.user,
      pass: map.pass,
      fromName: map.from_name || "SmartAIHub",
      fromEmail: map.from_email || map.user,
    };
    cacheTime = Date.now();
    return cachedConfig;
  } catch (err) {
    console.error("[Email] Failed to load SMTP config:", err);
    return null;
  }
}

export function clearSmtpCache() {
  cachedConfig = null;
  cacheTime = 0;
}

export async function createTransporter(): Promise<Transporter | null> {
  const config = await getSmtpConfig();
  if (!config) return null;

  // secure=true only for port 465; port 587 uses STARTTLS (secure=false)
  const useSecure = config.port === 465 ? true : config.secure;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: useSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    tls: {
      rejectUnauthorized: !allowInsecureSmtpTls(),
      minVersion: "TLSv1.2",
    },
  });
}

/**
 * Send verification code email
 */
export async function sendVerificationEmail(to: string, code: string, name?: string): Promise<boolean> {
  const config = await getSmtpConfig();
  const transporter = await createTransporter();

  if (!transporter || !config) {
    logCodeFallback("Verify", to, code);
    console.log("[Email] SMTP not configured; verification email was not sent");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject: "Verify your email — SmartAIHub",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #7c3aed;">Verify Your Email</h2>
          <p>Hi${name ? ` ${name}` : ''},</p>
          <p>Your verification code is:</p>
          <div style="background: #f3f0ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 15 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't create an account, you can ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">SmartAIHub</p>
        </div>
      `,
    });
    console.log(`[Email] Verification email sent to ${maskEmail(to)}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send verification email to ${maskEmail(to)}:`, err);
    return false;
  }
}

/**
 * Send password reset code email
 */
export async function sendPasswordResetEmail(to: string, code: string, name?: string): Promise<boolean> {
  const config = await getSmtpConfig();
  const transporter = await createTransporter();

  if (!transporter || !config) {
    logCodeFallback("Reset", to, code);
    console.log("[Email] SMTP not configured; password reset email was not sent");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject: "Reset your password — SmartAIHub",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #7c3aed;">Reset Your Password</h2>
          <p>Hi${name ? ` ${name}` : ''},</p>
          <p>Your password reset code is:</p>
          <div style="background: #f3f0ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 15 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">SmartAIHub</p>
        </div>
      `,
    });
    console.log(`[Email] Password reset email sent to ${maskEmail(to)}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send password reset email to ${maskEmail(to)}:`, err);
    return false;
  }
}

/**
 * Test SMTP connection
 */
export async function testSmtpConnection(config: {
  host: string; port: number; secure: boolean; user: string; pass: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const useSecure = config.port === 465 ? true : config.secure;
    console.log(`[SMTP Test] Connecting to ${config.host}:${config.port} (secure=${useSecure})`);

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: useSecure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 15000, // 15s timeout
      greetingTimeout: 10000,   // 10s greeting timeout
      tls: {
        rejectUnauthorized: !allowInsecureSmtpTls(),
        minVersion: "TLSv1.2",
      },
    });
    await transporter.verify();
    console.log(`[SMTP Test] Connection successful to ${config.host}`);
    return { success: true, message: "SMTP connection successful" };
  } catch (err: any) {
    const errorMsg = err.message || "Connection failed";
    console.error(`[SMTP Test] Failed: ${errorMsg}`, err.code || "");

    // Provide more helpful error messages
    let helpfulMessage = errorMsg;
    if (err.code === "ECONNREFUSED") {
      helpfulMessage = `Connection refused: ${config.host}:${config.port} - check host and port`;
    } else if (err.code === "ENOTFOUND") {
      helpfulMessage = `Host not found: ${config.host} - check SMTP host address`;
    } else if (err.code === "ETIMEDOUT" || err.code === "ESOCKET") {
      helpfulMessage = `Connection timeout: ${config.host}:${config.port} - check firewall or network`;
    } else if (err.code === "EAUTH" || errorMsg.includes("authentication")) {
      helpfulMessage = `Authentication failed: check username and password`;
    } else if (errorMsg.includes("certificate") || errorMsg.includes("SSL") || errorMsg.includes("TLS")) {
      helpfulMessage = `TLS/SSL error: ${errorMsg}`;
    }

    return { success: false, message: helpfulMessage };
  }
}
