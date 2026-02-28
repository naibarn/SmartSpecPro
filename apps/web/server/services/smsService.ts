/**
 * SMS Service — sends SMS via Twilio or Vonage
 * Reads SMS config from systemSettings (category: "sms")
 * Falls back to console logging if SMS is not configured
 */

import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto";

interface SmsConfig {
  provider: "twilio" | "vonage";
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

let cachedConfig: SmsConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getSmsConfig(): Promise<SmsConfig | null> {
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return cachedConfig;

  try {
    const db = await getDb();
    if (!db) return null;

    const settings = await db.select().from(systemSettings)
      .where(eq(systemSettings.category, "sms"));

    const map: Record<string, string | null> = {};
    for (const s of settings) {
      if (s.isSensitive && s.value) {
        try { map[s.key] = decrypt(s.value); } catch { map[s.key] = s.value; }
      } else {
        map[s.key] = s.value;
      }
    }

    if (!map.provider || !map.account_sid || !map.auth_token || !map.from_number) return null;

    const provider = map.provider as "twilio" | "vonage";
    if (provider !== "twilio" && provider !== "vonage") return null;

    cachedConfig = {
      provider,
      accountSid: map.account_sid,
      authToken: map.auth_token,
      fromNumber: map.from_number,
    };
    cacheTime = Date.now();
    return cachedConfig;
  } catch (err) {
    console.error("[SMS] Failed to load SMS config:", err);
    return null;
  }
}

export function clearSmsCache() {
  cachedConfig = null;
  cacheTime = 0;
}

async function sendViaTwilio(config: SmsConfig, to: string, body: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: config.fromNumber,
      Body: body,
    }).toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Twilio error ${response.status}: ${err}`);
  }
  return true;
}

async function sendViaVonage(config: SmsConfig, to: string, body: string): Promise<boolean> {
  const response = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.accountSid,
      api_secret: config.authToken,
      to: to.replace("+", ""),
      from: config.fromNumber,
      text: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vonage error ${response.status}: ${err}`);
  }

  const data = await response.json() as { messages?: Array<{ status: string; "error-text"?: string }> };
  if (data.messages?.[0]?.status !== "0") {
    throw new Error(`Vonage SMS failed: ${data.messages?.[0]?.["error-text"] || "Unknown error"}`);
  }
  return true;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const config = await getSmsConfig();

  // Always log to console as backup
  console.log(`\n========================================`);
  console.log(`[SMS] To: ${to}`);
  console.log(`[SMS] Body: ${body}`);
  console.log(`========================================\n`);

  if (!config) {
    console.log("[SMS] SMS provider not configured — code logged to console only");
    return false;
  }

  try {
    if (config.provider === "twilio") {
      await sendViaTwilio(config, to, body);
    } else {
      await sendViaVonage(config, to, body);
    }
    console.log(`[SMS] Sent to ${to} via ${config.provider}`);
    return true;
  } catch (err) {
    console.error(`[SMS] Failed to send to ${to}:`, err);
    return false;
  }
}

/**
 * Send verification code SMS
 */
export async function sendVerificationSms(to: string, code: string): Promise<boolean> {
  return sendSms(to, `Your SmartAIHub verification code is: ${code}. Valid for 15 minutes.`);
}

/**
 * Send password reset code SMS
 */
export async function sendPasswordResetSms(to: string, code: string): Promise<boolean> {
  return sendSms(to, `Your SmartAIHub password reset code is: ${code}. Valid for 15 minutes.`);
}

/**
 * Test SMS connection by sending a test message
 */
export async function testSmsConnection(config: {
  provider: string; accountSid: string; authToken: string; fromNumber: string;
}, testNumber: string): Promise<{ success: boolean; message: string }> {
  try {
    const smsConfig: SmsConfig = {
      provider: config.provider as "twilio" | "vonage",
      accountSid: config.accountSid,
      authToken: config.authToken,
      fromNumber: config.fromNumber,
    };

    const body = "SmartAIHub SMS test message. If you received this, SMS is configured correctly!";

    if (smsConfig.provider === "twilio") {
      await sendViaTwilio(smsConfig, testNumber, body);
    } else {
      await sendViaVonage(smsConfig, testNumber, body);
    }
    return { success: true, message: "Test SMS sent successfully" };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to send test SMS" };
  }
}
