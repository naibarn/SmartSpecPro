import type { Express, Request, Response } from "express";

import { getAppRuntimeConfig } from "../services/appRuntimeConfig";

const SUPPORTED_PROVIDERS = new Set(["google", "github"]);
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "x-request-id",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "location",
  "retry-after",
  "vary",
  "x-request-id",
] as const;

function requestBody(req: Request): string | undefined {
  if (req.method !== "POST") return undefined;
  if (req.body === undefined) return undefined;
  return JSON.stringify(req.body);
}

async function proxyOAuthRequest(req: Request, res: Response) {
  const provider =
    typeof req.params.provider === "string" ? req.params.provider : "";
  const action = typeof req.params.action === "string" ? req.params.action : "";

  if (
    !SUPPORTED_PROVIDERS.has(provider) ||
    !["authorize", "callback"].includes(action)
  ) {
    return res
      .status(404)
      .json({ error: { message: "OAuth route not found" } });
  }

  if (
    (action === "authorize" && req.method !== "GET") ||
    (action === "callback" && req.method !== "POST")
  ) {
    res.setHeader("Allow", action === "authorize" ? "GET" : "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  try {
    const runtime = await getAppRuntimeConfig();
    const target = new URL(req.originalUrl, `${runtime.pythonBackendUrl}/`);
    const body = requestBody(req);
    const headers: Record<string, string> = {};

    for (const header of FORWARDED_REQUEST_HEADERS) {
      const value = req.headers[header];
      if (typeof value === "string") headers[header] = value;
    }

    if (body !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(body).toString();
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("cache-control", "no-store");

    const payload = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(payload);
  } catch (error) {
    console.error("[OAuthProxy] Python backend request failed", error);
    return res
      .status(502)
      .json({ error: { message: "OAuth backend unavailable" } });
  }
}

export function registerOAuthProxyRoutes(app: Express) {
  app.all("/api/oauth/:provider/:action", proxyOAuthRequest);
}
