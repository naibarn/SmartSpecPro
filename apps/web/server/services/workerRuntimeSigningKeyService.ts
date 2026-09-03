import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  workerRuntimeSigningKeyCatalogSchema,
  type WorkerRuntimeSigningKeyCatalog,
  type WorkerRuntimeSigningKeyRecord,
} from "../../shared/workerRuntimeReleases";

export const WORKER_RUNTIME_SIGNING_KEY_CATEGORY = "worker_runtime_release";
export const WORKER_RUNTIME_SIGNING_KEY_NAME = "public_key";
const MAX_KEY_HISTORY = 10;

export class WorkerRuntimeSigningKeyError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    code = "worker_runtime_signing_key_invalid",
    statusCode = 400
  ) {
    super(message);
    this.name = "WorkerRuntimeSigningKeyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function rejectPrivateKey(value: string): void {
  if (/PRIVATE KEY/i.test(value)) {
    throw new WorkerRuntimeSigningKeyError(
      "อัปโหลดหรือวางได้เฉพาะ Ed25519 public key เท่านั้น ห้ามใส่ private key",
      "worker_runtime_private_key_rejected"
    );
  }

  try {
    crypto.createPrivateKey(value);
    throw new WorkerRuntimeSigningKeyError(
      "อัปโหลดหรือวางได้เฉพาะ Ed25519 public key เท่านั้น ห้ามใส่ private key",
      "worker_runtime_private_key_rejected"
    );
  } catch (error) {
    if (error instanceof WorkerRuntimeSigningKeyError) throw error;
    // A public key is expected to fail createPrivateKey. Continue with the
    // public-key parser below so malformed input gets a useful error.
  }
}

export function normalizeWorkerRuntimePublicKey(input: string): {
  publicKey: string;
  fingerprintSha256: string;
  keyId: string;
  algorithm: "ed25519";
} {
  const value = input.trim().replace(/\r\n?/g, "\n");
  if (!value) {
    throw new WorkerRuntimeSigningKeyError(
      "กรุณาเลือกไฟล์หรือวางข้อมูล Ed25519 public key",
      "worker_runtime_public_key_missing"
    );
  }

  rejectPrivateKey(value);

  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey(value);
  } catch {
    throw new WorkerRuntimeSigningKeyError(
      "Public key ไม่ถูกต้องหรืออ่านไม่ได้ โปรดใช้ไฟล์ PEM ที่สร้างจาก Ed25519",
      "worker_runtime_public_key_invalid"
    );
  }

  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    throw new WorkerRuntimeSigningKeyError(
      "รองรับเฉพาะ Ed25519 public key เท่านั้น",
      "worker_runtime_public_key_algorithm_unsupported"
    );
  }

  const der = key.export({ type: "spki", format: "der" });
  const fingerprintSha256 = crypto
    .createHash("sha256")
    .update(der)
    .digest("hex");
  const publicKey = key.export({ type: "spki", format: "pem" }).toString();

  return {
    publicKey,
    fingerprintSha256,
    keyId: `ed25519-${fingerprintSha256.slice(0, 16)}`,
    algorithm: "ed25519",
  };
}

function parseStoredCatalog(
  row:
    | {
        value: string | null;
        valueJson: unknown;
        updatedAt: Date;
      }
    | undefined
): WorkerRuntimeSigningKeyCatalog {
  if (!row?.value && !row?.valueJson) {
    return { configured: false, active: null, history: [] };
  }

  const json = row.valueJson;
  if (json && typeof json === "object") {
    const parsed = workerRuntimeSigningKeyCatalogSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  }

  if (!row.value) return { configured: false, active: null, history: [] };

  try {
    const normalized = normalizeWorkerRuntimePublicKey(row.value);
    const active: WorkerRuntimeSigningKeyRecord = {
      ...normalized,
      registeredAt: row.updatedAt.toISOString(),
      retiredAt: null,
    };
    return { configured: true, active, history: [] };
  } catch {
    // Do not expose an invalid legacy value to the UI. The next save replaces
    // it with a validated public key and a complete metadata record.
    return { configured: false, active: null, history: [] };
  }
}

async function readSigningKeyRow() {
  const db = getDb();
  const rows = await db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, WORKER_RUNTIME_SIGNING_KEY_CATEGORY),
        eq(systemSettings.key, WORKER_RUNTIME_SIGNING_KEY_NAME)
      )
    )
    .limit(1);
  return rows[0];
}

export async function getWorkerRuntimeSigningKey(): Promise<WorkerRuntimeSigningKeyCatalog> {
  const row = await readSigningKeyRow();
  return parseStoredCatalog(row);
}

export async function setWorkerRuntimeSigningPublicKey(params: {
  publicKey: string;
  updatedBy: number;
}): Promise<WorkerRuntimeSigningKeyCatalog> {
  const normalized = normalizeWorkerRuntimePublicKey(params.publicKey);
  const existing = await readSigningKeyRow();
  const current = parseStoredCatalog(existing);
  const now = new Date().toISOString();

  const active: WorkerRuntimeSigningKeyRecord = {
    ...normalized,
    registeredAt: now,
    retiredAt: null,
  };
  const history = [...current.history];
  if (
    current.active &&
    current.active.fingerprintSha256 !== active.fingerprintSha256
  ) {
    history.unshift({ ...current.active, retiredAt: now });
  }

  const next: WorkerRuntimeSigningKeyCatalog = {
    configured: true,
    active,
    history: history.slice(0, MAX_KEY_HISTORY),
  };
  const db = getDb();
  const valueJson = next as unknown as Record<string, any>;

  if (existing) {
    await db
      .update(systemSettings)
      .set({
        value: active.publicKey,
        valueJson,
        isSensitive: false,
        description:
          "Worker Runtime Ed25519 public verification key. Private key is never stored here.",
        updatedBy: params.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category: WORKER_RUNTIME_SIGNING_KEY_CATEGORY,
      key: WORKER_RUNTIME_SIGNING_KEY_NAME,
      value: active.publicKey,
      valueJson,
      isSensitive: false,
      description:
        "Worker Runtime Ed25519 public verification key. Private key is never stored here.",
      updatedBy: params.updatedBy,
    });
  }

  return next;
}
