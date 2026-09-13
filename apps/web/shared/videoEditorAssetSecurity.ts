export type AssetSecurityResult = { ok: true } | { ok: false; code: "PATH_NOT_ALLOWED" | "URL_NOT_ALLOWED" | "TENANT_MISMATCH" | "MIME_NOT_ALLOWED" };

const ALLOWED_MIME = /^(video|audio|image|text)\/[A-Za-z0-9.+-]+$/i;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function validateEditorAssetInput(input: {
  tenantId: string;
  ownerTenantId: string;
  mimeType: string;
  selectedPath?: string | null;
  sourceUrl?: string | null;
}): AssetSecurityResult {
  if (!input.tenantId || !input.ownerTenantId || input.tenantId !== input.ownerTenantId) return { ok: false, code: "TENANT_MISMATCH" };
  if (typeof input.mimeType !== "string" || !ALLOWED_MIME.test(input.mimeType.trim())) return { ok: false, code: "MIME_NOT_ALLOWED" };
  const sourceUrl = input.sourceUrl?.trim();
  if (sourceUrl && (URI_SCHEME.test(sourceUrl) || /^\/\//.test(sourceUrl))) return { ok: false, code: "URL_NOT_ALLOWED" };
  const selectedPath = input.selectedPath?.trim();
  if (selectedPath && (/[\0\u0001-\u001f\u007f]/.test(selectedPath) || /(^|[\\/])\.\.(?:[\\/]|$)/.test(selectedPath) || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(selectedPath) || /^~(?:[\\/]|$)/.test(selectedPath))) {
    return { ok: false, code: "PATH_NOT_ALLOWED" };
  }
  return { ok: true };
}
