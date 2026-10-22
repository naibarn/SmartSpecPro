const SAFE_APPROVAL_CODE = /^[A-Z][A-Z0-9_]{5,119}$/;
const SAFE_FIELD_SEGMENT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export type CloudflareApprovalFailureStage = "POLICY_CREATE" | "GRANT_CREATE";

/** Return actionable validation locations without reflecting values or messages. */
export function cloudflareApprovalFailureCode(
  body: unknown,
  status: number,
  stage?: CloudflareApprovalFailureStage,
): string {
  let code: string;
  if (!body || typeof body !== "object") {
    code = `STAGING_APPROVAL_REJECTED_HTTP_${status}`;
  } else {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && SAFE_APPROVAL_CODE.test(detail)) {
      code = detail;
    } else if (Array.isArray(detail)) {
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
      code = fields.size > 0
        ? `STAGING_APPROVAL_VALIDATION_FAILED:${[...fields].join(",")}`
        : `STAGING_APPROVAL_REJECTED_HTTP_${status}`;
    } else {
      code = `STAGING_APPROVAL_REJECTED_HTTP_${status}`;
    }
  }

  return stage ? `STAGING_${stage}_HTTP_${status}:${code}` : code;
}
