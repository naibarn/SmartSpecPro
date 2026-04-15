type UnexpectedHtmlResponseInfo = {
  requestUrl: string;
  status: number;
  bodySnippet?: string;
};

function getRequestPath(requestUrl: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://smartaihub.app";
    const parsed = new URL(requestUrl, base);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return requestUrl;
  }
}

function isLikelyLoginHtml(status: number, bodySnippet: string): boolean {
  const normalized = bodySnippet.toLowerCase();
  return (
    status === 401
    || status === 403
    || normalized.includes("login")
    || normalized.includes("sign in")
    || normalized.includes("signin")
    || normalized.includes("password")
  );
}

export function isHtmlApiErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unexpected token '<'")
    || normalized.includes("<!doctype")
    || normalized.includes("returned html instead of json")
  );
}

export function buildUnexpectedHtmlResponseMessage(
  info: UnexpectedHtmlResponseInfo,
): string {
  const requestPath = getRequestPath(info.requestUrl);
  const bodySnippet = String(info.bodySnippet ?? "").trim();
  const sessionExpired = isLikelyLoginHtml(info.status, bodySnippet);

  if (sessionExpired) {
    return `The server returned HTML instead of JSON for ${requestPath}. Your session may have expired.`;
  }

  return `The server returned HTML instead of JSON for ${requestPath}. The request may have been routed to the web app shell.`;
}

export async function assertJsonApiResponse(
  response: Response,
  requestUrl: string,
): Promise<void> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) {
    return;
  }

  let bodySnippet = "";
  try {
    bodySnippet = (await response.clone().text()).slice(0, 200);
  } catch {
    bodySnippet = "";
  }

  throw new Error(buildUnexpectedHtmlResponseMessage({
    requestUrl,
    status: response.status,
    bodySnippet,
  }));
}
