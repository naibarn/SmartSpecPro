import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const baseUrl = (process.env.SMARTAIHUB_PUBLIC_URL || "https://smartaihub.app").replace(/\/+$/, "");
const version = (process.env.RELEASE_VERSION || "").trim();
const releaseNotes = (process.env.RELEASE_NOTES || "").trim();
const installerPath = `apps/web/client/public/releases/smart-ai-hub-worker-app-${version}-x64-setup.exe`;
const fileName = `smart-ai-hub-worker-app-${version}-x64-setup.exe`;
const audience = "smartaihub-worker-app-release";

function fail(message) {
  console.error(`[worker-app-release] ${message}`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
  fail("A valid RELEASE_VERSION is required.");
}

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) {
  fail("GitHub Actions OIDC credentials are unavailable; check workflow id-token permissions.");
}

const installer = await readFile(installerPath);
if (installer.length < 2 || installer[0] !== 0x4d || installer[1] !== 0x5a) {
  fail("The release artifact is not a Windows PE installer.");
}
const installerStat = await stat(installerPath);
const installerSha256 = createHash("sha256").update(installer).digest("hex");

const oidcUrl = new URL(requestUrl);
oidcUrl.searchParams.set("audience", audience);
const oidcResponse = await fetch(oidcUrl, {
  headers: { Authorization: `Bearer ${requestToken}` },
});
if (!oidcResponse.ok) {
  fail(`Could not request a GitHub Actions identity token (HTTP ${oidcResponse.status}).`);
}
const oidcPayload = await oidcResponse.json();
if (typeof oidcPayload.value !== "string" || !oidcPayload.value) {
  fail("GitHub Actions returned an invalid identity token response.");
}

const form = new FormData();
form.set("version", version);
form.set("releaseNotes", releaseNotes);
form.set("file", new Blob([installer], { type: "application/vnd.microsoft.portable-executable" }), fileName);

const uploadResponse = await fetch(`${baseUrl}/api/desktop-releases/worker-app/windows/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${oidcPayload.value}` },
  body: form,
});
const uploadPayload = await uploadResponse.json().catch(() => ({}));
if (!uploadResponse.ok) {
  const error = typeof uploadPayload.error === "string" ? uploadPayload.error : `HTTP ${uploadResponse.status}`;
  fail(`Dashboard rejected the Worker App release: ${error}`);
}

const uploadedRelease = uploadPayload.release;
if (
  uploadedRelease?.version !== version
  || uploadedRelease?.fileName !== fileName
  || uploadedRelease?.fileSizeBytes !== installerStat.size
  || uploadedRelease?.fileSha256?.toLowerCase() !== installerSha256
) {
  fail("Dashboard upload metadata does not match the verified build artifact.");
}

const latestUrl = new URL(`${baseUrl}/api/desktop-releases/worker-app/latest`);
latestUrl.searchParams.set("platform", "windows");
latestUrl.searchParams.set("architecture", "x64");
const latestResponse = await fetch(latestUrl, { cache: "no-store" });
const latestPayload = await latestResponse.json().catch(() => ({}));
if (!latestResponse.ok) {
  fail(`Could not verify the published Dashboard release (HTTP ${latestResponse.status}).`);
}

const latest = latestPayload.release;
if (
  latest?.version !== version
  || latest?.fileName !== fileName
  || latest?.fileSizeBytes !== installerStat.size
  || latest?.fileSha256?.toLowerCase() !== installerSha256
) {
  fail("The Dashboard latest release does not match the installer uploaded by this workflow.");
}

console.log(`[worker-app-release] Published and verified ${version} (${installerStat.size} bytes, SHA-256 ${installerSha256}).`);
