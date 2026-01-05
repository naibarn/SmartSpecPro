import crypto from "node:crypto";

/**
 * Deterministic dedupe key:
 * normalize originatingSpec + title + acceptanceCriteria -> SHA256 hex.
 */
export function computeDedupeKey(input: {
  originatingSpec?: string | null;
  title: string;
  acceptanceCriteria?: string | null;
}): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 _\-./]/g, "");

  const material = [norm(input.originatingSpec ?? ""), norm(input.title ?? ""), norm(input.acceptanceCriteria ?? "")].join("|");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}
