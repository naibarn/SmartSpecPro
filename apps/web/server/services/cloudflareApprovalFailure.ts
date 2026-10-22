const SAFE_APPROVAL_CODE = /^[A-Z][A-Z0-9_]{5,119}$/;
const SAFE_FIELD_SEGMENT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Return actionable validation locations without reflecting values or messages. */
export function cloudflareApprovalFailureCode(
  body: unknown,
  status: number
): string {
  if (!body || typeof body !== "object") {
    return `STAGING_APPROVAL_REJECTED_HTTP_${status}`;
  }

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && SAFE_APPROVAL_CODE.test(detail)) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const fields = new Set<string>();
    for (const issue of detail.slice(0, 12)) {
      if (!issue || typeof issue !== "object") continue;
      const location = (issue as { loc?: unknown }).loc;
      if (!Array.isArray(location)) continue;
      const field = location
        .filter(
          (part): part is string =>
            typeof part === "string" &&
            part !== "body" &&
            part !== "query" &&
            part !== "path" &&
            SAFE_FIELD_SEGMENT.test(part)
        )
        .join(".");
      if (field) fields.add(field);
    }
    if (fields.size > 0) {
      return `STAGING_APPROVAL_VALIDATION_FAILED:${[...fields].join(",")}`;
    }
  }

  return `STAGING_APPROVAL_REJECTED_HTTP_${status}`;
}
