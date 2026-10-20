/** Exact existing media producer wrapper; never a generic Python/task executor. */
export const CLOUDFLARE_MEDIA_PROBE = "container-media-probe-v1" as const;
export const MEDIA_PROBE_TASK = "app.tasks.media_job_worker.execute_media_job";
export const MEDIA_PROBE_MAX_BYTES = 3 * 1024 * 1024;
export type MediaProbeCandidate = { uri: string; userId: number; externalJobId: string };
export type MediaProbeSource = {
  tenantId: string; userId: number; assetId: number; objectKey: string;
  checksumSha256: string; sizeBytes: number; contentType: string; expiresAt: string;
};
export function parseMediaProbeCandidate(job: { jobType: string; executionClass: string; input: unknown }): MediaProbeCandidate | null {
  if (job.jobType !== "python.legacy_task" || !["cpu", "long"].includes(job.executionClass)) return null;
  const input = job.input as Record<string, unknown> | null;
  if (!input || input.taskName !== MEDIA_PROBE_TASK || input.taskImportPath !== MEDIA_PROBE_TASK ||
      !Array.isArray(input.args) || input.args.length !== 3 || typeof input.args[0] !== "string" || input.args[0].length > 24 * 1024 ||
      typeof input.args[1] !== "string" || !/^[1-9][0-9]{0,14}$/.test(input.args[1]) || input.legacyUserId !== input.args[1] ||
      typeof input.args[2] !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.args[2]) ||
      !input.kwargs || typeof input.kwargs !== "object" || Array.isArray(input.kwargs) || Object.keys(input.kwargs).length !== 0 ||
      (input.queue !== undefined && input.queue !== null && input.queue !== "video" && input.queue !== "audio")) return null;
  try {
    const spec = JSON.parse(input.args[0]);
    const assets = spec?.inputs?.assets;
    if (spec?.jobType !== "probe" || spec.jobId !== input.args[2] || !Array.isArray(assets) || assets.length !== 1 ||
        typeof assets[0]?.uri !== "string" || !assets[0].uri || assets[0].uri.length > 4096 || /[\u0000-\u001f\u007f]/.test(assets[0].uri)) return null;
    return { uri: assets[0].uri, userId: Number(input.args[1]), externalJobId: input.args[2] };
  } catch { return null; }
}
export function validateMediaProbeSource(value: MediaProbeSource, tenantId: string, userId: number, now = Date.now()): MediaProbeSource {
  if (!value || value.tenantId !== tenantId || value.userId !== userId || !Number.isSafeInteger(value.assetId) || value.assetId < 1 ||
      typeof value.objectKey !== "string" || !value.objectKey || value.objectKey.length > 512 ||
      /(?:^[a-z]+:|[\\\u0000-\u001f\u007f])/.test(value.objectKey) || value.objectKey.split("/").some(p => !p || p === "." || p === "..") ||
      !/^[a-f0-9]{64}$/.test(value.checksumSha256) || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > MEDIA_PROBE_MAX_BYTES ||
      !/^(?:audio|video|image)\/[a-zA-Z0-9.+-]{1,80}$/.test(value.contentType) ||
      !(Date.parse(value.expiresAt) > now && Date.parse(value.expiresAt) <= now + 60_000)) throw new Error("CLOUDFLARE_MEDIA_SOURCE_DENIED");
  return { ...value };
}

/** Native DO-managed custom images must live in this account's Cloudflare registry. */
export function isCloudflareMediaProbeImage(value: unknown, accountRef?: string): value is string {
  return typeof value === "string" && /^registry\.cloudflare\.com\/[a-f0-9]{32}\/[a-zA-Z0-9/_-]+@sha256:[a-f0-9]{64}$/.test(value) &&
    (accountRef === undefined || value.startsWith(`registry.cloudflare.com/${accountRef}/`));
}
