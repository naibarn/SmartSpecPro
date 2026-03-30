import fs from "fs";
import postgres from "./apps/web/node_modules/postgres/src/index.js";
import { decrypt } from "./apps/web/server/services/crypto.ts";

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile("./apps/web/.env");

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select "providerName", "baseUrl", "apiKeyEncrypted", "hasApiKey"
      from media_providers
      where "providerName" = 'uvoice'
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      console.log(JSON.stringify({ found: false }, null, 2));
      return;
    }
    const encrypted = row.apiKeyEncrypted ?? row.apikeyencrypted ?? "";
    const apiKey = encrypted ? decrypt(encrypted) : "";
    const baseUrl = row.baseUrl ?? row.baseurl ?? "https://api.uvoice.ai";
    console.log(JSON.stringify({
      found: true,
      providerName: row.providerName ?? row.providername,
      baseUrl,
      hasApiKey: row.hasApiKey ?? row.hasapikey,
      apiKeyLength: apiKey.length,
      apiKeyPreview: apiKey ? `${apiKey.slice(0, 8)}...` : null,
    }, null, 2));

    const candidates = [
      { model: "uvoice/tts-standard", voiceID: "TH-TigerSD" },
      { model: "uvoice/tts-natural", voiceID: "TH-NalineeNatural" },
      { model: "uvoice/tts-premium", voiceID: "TH-KantapongPremiumHD" },
      { model: "uvoice/tts-premium", voiceID: "TH-BowkyPremiumHD" },
    ];

    for (const candidate of candidates) {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            text: "สวัสดีครับ นี่คือข้อความทดสอบ",
            voiceID: candidate.voiceID,
            outputType: "url",
            outputFormat: "mp3",
          },
        }),
      });
      const text = await response.text();
      console.log(JSON.stringify({
        probe: candidate,
        status: response.status,
        body: text.slice(0, 300),
      }, null, 2));
    }
  } finally {
    await sql.end();
  }
}

await main();
