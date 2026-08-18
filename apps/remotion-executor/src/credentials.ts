import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./config.js";
import { runFile } from "./process.js";

const SERVICE = "com.smartaihub.remotion-executor";
const account = () => process.env.USERNAME ?? process.env.USER ?? "smartaihub";

export type DeviceIdentity = {
  deviceId: string;
  machineFingerprint: string;
  publicKey: string;
  privateKey: string;
};

export async function loadCredential(key: string): Promise<string | null> {
  if (process.platform === "darwin") {
    const result = await runFile("security", ["find-generic-password", "-a", account(), "-s", `${SERVICE}.${key}`, "-w"]);
    return result.code === 0 ? result.stdout.trim() || null : null;
  }
  if (process.platform === "win32") {
    const encrypted = await fs.readFile(path.join(stateRoot(), "credentials", `${key}.dpapi`), "utf8").catch(() => "");
    if (!encrypted.trim()) return null;
    const script = "$b=[Console]::In.ReadToEnd();$p=[Convert]::FromBase64String($b);$d=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($d))";
    const result = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], encrypted);
    return result.code === 0 ? result.stdout.trim() || null : null;
  }
  throw new Error("A protected credential store is required on this platform");
}

export async function saveCredential(key: string, value: string): Promise<void> {
  if (!value || value.length > 32_000) throw new Error("credential value is invalid");
  if (process.platform === "darwin") {
    const result = await runFile("security", ["add-generic-password", "-a", account(), "-s", `${SERVICE}.${key}`, "-w", value, "-U"]);
    if (result.code !== 0) throw new Error("macOS Keychain write failed");
    return;
  }
  if (process.platform === "win32") {
    const script = "$b=[Console]::In.ReadToEnd();$d=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($b),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($d))";
    const result = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], value);
    if (result.code !== 0 || !result.stdout.trim()) throw new Error("Windows DPAPI write failed");
    await fs.mkdir(path.join(stateRoot(), "credentials"), { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(stateRoot(), "credentials", `${key}.dpapi`), result.stdout.trim(), { mode: 0o600 });
    return;
  }
  throw new Error("A protected credential store is required on this platform");
}

export function newDeviceId(): string {
  return `remotion-${crypto.randomUUID()}`;
}

export async function loadOrCreateDeviceIdentity(deviceId?: string): Promise<DeviceIdentity> {
  const existing = await Promise.all([
    loadCredential("device-id"),
    loadCredential("device-machine-fingerprint"),
    loadCredential("device-public-key"),
    loadCredential("device-private-key"),
  ]);
  const [existingDeviceId, existingFingerprint, existingPublicKey, existingPrivateKey] = existing;
  if (existingDeviceId && existingFingerprint && existingPublicKey && existingPrivateKey) {
    return { deviceId: existingDeviceId, machineFingerprint: existingFingerprint, publicKey: existingPublicKey, privateKey: existingPrivateKey };
  }
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const machineFingerprint = crypto.createHash("sha256")
    .update(`${process.platform}:${process.arch}:${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "local"}`)
    .digest("hex");
  const identity = {
    deviceId: deviceId ?? newDeviceId(),
    machineFingerprint,
    publicKey,
    privateKey,
  } satisfies DeviceIdentity;
  await Promise.all([
    saveCredential("device-id", identity.deviceId),
    saveCredential("device-machine-fingerprint", identity.machineFingerprint),
    saveCredential("device-public-key", identity.publicKey),
    saveCredential("device-private-key", identity.privateKey),
  ]);
  return identity;
}
