/**
 * Shared contract for failures caused by exhausted filesystem capacity.
 *
 * The server enriches this contract with a safe mount label and capacity
 * snapshot. The browser uses the same parser/formatter for immediate tRPC
 * errors and durable async assembly failures.
 */

export const STORAGE_CAPACITY_ERROR_CODE = "storage_capacity_exhausted" as const;

export type StorageCapacityKind = "bytes" | "inodes" | "unknown";

export interface StorageCapacityErrorDetails {
  mountPoint?: string;
  capacityKind?: StorageCapacityKind;
  availableBytes?: number;
  availableInodes?: number;
}

const CAPACITY_ERROR_PATTERN =
  /storage_capacity_exhausted|\b(?:ENOSPC|EDQUOT)\b|no space left on device|disk (?:space )?full|not enough (?:disk )?space|quota exceeded/i;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
  }
  return String(error ?? "");
}

/** True for native errno messages and for this contract's normalized code. */
export function isStorageCapacityError(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    ["ENOSPC", "EDQUOT"].includes(
      String((error as { code?: unknown }).code ?? "").toUpperCase(),
    )
  ) {
    return true;
  }
  return CAPACITY_ERROR_PATTERN.test(errorMessage(error));
}

function safeLabel(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/[\[\];\r\n]/g, "");
  return normalized ? normalized.slice(0, 120) : undefined;
}

function safeNonNegativeInteger(value: number | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

/** Compact, stable representation safe to persist in JSONB and logs. */
export function formatStorageCapacityErrorMessage(
  details: StorageCapacityErrorDetails = {},
): string {
  const fields = [
    details.mountPoint ? `mount=${safeLabel(details.mountPoint)}` : undefined,
    details.capacityKind ? `kind=${details.capacityKind}` : undefined,
    safeNonNegativeInteger(details.availableBytes) != null
      ? `availableBytes=${safeNonNegativeInteger(details.availableBytes)}`
      : undefined,
    safeNonNegativeInteger(details.availableInodes) != null
      ? `availableInodes=${safeNonNegativeInteger(details.availableInodes)}`
      : undefined,
  ].filter((field): field is string => Boolean(field));

  return `${STORAGE_CAPACITY_ERROR_CODE}${
    fields.length > 0 ? ` [${fields.join("; ")}]` : ""
  }`;
}

/** Parse the compact contract without trusting arbitrary user-controlled text. */
export function parseStorageCapacityErrorMessage(
  message: string | null | undefined,
): StorageCapacityErrorDetails | null {
  if (!message || !isStorageCapacityError(message)) return null;
  const match = message.match(
    new RegExp(`${STORAGE_CAPACITY_ERROR_CODE}\\s*\\[([^\\]]*)\\]`, "i"),
  );
  if (!match) return {};

  const details: StorageCapacityErrorDetails = {};
  for (const field of match[1]!.split(";")) {
    const separator = field.indexOf("=");
    if (separator <= 0) continue;
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === "mount") details.mountPoint = safeLabel(value);
    else if (
      key === "kind" &&
      (value === "bytes" || value === "inodes" || value === "unknown")
    ) {
      details.capacityKind = value;
    } else if (key === "availableBytes" || key === "availableInodes") {
      const parsed = Number(value);
      const safe = safeNonNegativeInteger(parsed);
      if (safe != null) {
        if (key === "availableBytes") details.availableBytes = safe;
        else details.availableInodes = safe;
      }
    }
  }
  return details;
}

function formatBytes(bytes: number | undefined, lang: "th" | "en"): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return lang === "th" ? "น้อยกว่า 1 MB" : "less than 1 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/** Returns localized user copy, or null for an unrelated error. */
export function formatStorageCapacityErrorForUser(
  message: string | null | undefined,
  lang: "th" | "en",
): string | null {
  const details = parseStorageCapacityErrorMessage(message);
  if (!details) return null;

  const location = details.mountPoint
    ? lang === "th"
      ? `ของ ${details.mountPoint}`
      : `on ${details.mountPoint}`
    : lang === "th"
      ? "ชั่วคราวสำหรับการเรนเดอร์"
      : "used for temporary rendering";
  const isInodeFailure = details.capacityKind === "inodes";
  const available = formatBytes(details.availableBytes, lang);

  if (lang === "th") {
    if (isInodeFailure) {
      return `ไม่สามารถประกอบวิดีโอได้ เนื่องจากจำนวนไฟล์ที่พื้นที่จัดเก็บ${location}เต็ม กรุณาลบไฟล์ที่ไม่ใช้แล้วลองใหม่`;
    }
    return `ไม่สามารถประกอบวิดีโอได้ เนื่องจากพื้นที่จัดเก็บ${location}ไม่เพียงพอ${
      available ? ` (เหลือประมาณ ${available})` : ""
    } กรุณาเพิ่มพื้นที่ว่างแล้วลองใหม่`;
  }
  if (isInodeFailure) {
    return `The video could not be assembled because the file limit for storage ${location} has been reached. Remove unused files and try again.`;
  }
  return `The video could not be assembled because storage ${location} does not have enough free space${
    available ? ` (about ${available} remaining)` : ""
  }. Free some space and try again.`;
}
