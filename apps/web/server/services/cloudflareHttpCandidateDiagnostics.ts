/** Wrangler may include credentials, config and paths in diagnostics. Preserve
 * only numeric provider/HTTP codes; never store or return arbitrary CLI text. */
export function classifyHttpCandidateWranglerFailure(stdout: string, stderr: string) {
  const text = `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, "");
  const provider = /\[code:\s*(\d{1,6})\]/i.exec(text)?.[1];
  const http = /\b(?:HTTP(?:\s+status)?|status(?:\s+code)?)\s*[:=]?\s*([1-5]\d{2})\b/i.exec(text)?.[1];
  return `HTTP_CANDIDATE_WRANGLER_FAILED${http ? `_HTTP_${http}` : ""}${provider ? `_CF_${provider}` : ""}`;
}
