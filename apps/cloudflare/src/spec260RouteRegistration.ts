import {
  assertSpec260RouteManifest,
  matchSpec260ApiRouteWithParams,
  type Spec260AccessClass,
  type Spec260ApiRoute,
} from "@smartspec/shared/src/emergencyRouteManifest";

export type Spec260AuthorizationResult = "authorized" | "unauthenticated" | "forbidden";
export type Spec260RouteAuthorizer = (
  request: Request,
  route: Spec260ApiRoute,
  params: Readonly<Record<string, string>>,
) => Promise<Spec260AuthorizationResult>;
/** Handlers must enforce tenant, record, assignment, and sponsor-pool scope before reading or mutating data. */
export type Spec260RouteHandler = (
  request: Request,
  route: Spec260ApiRoute,
  params: Readonly<Record<string, string>>,
) => Promise<Response>;

export interface Spec260RouteRegistry {
  dispatch(request: Request): Promise<Response | undefined>;
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Build a fail-closed Worker dispatcher from the shared route inventory. */
export function createSpec260RouteRegistry(
  handlers: Readonly<Partial<Record<string, Spec260RouteHandler>>>,
  authorize: Spec260RouteAuthorizer,
): Spec260RouteRegistry {
  assertSpec260RouteManifest();
  return {
    async dispatch(request) {
      const url = new URL(request.url);
      const match = matchSpec260ApiRouteWithParams(request.method, url.pathname);
      if (!match) return undefined;
      const { route, params } = match;
      if (route.access !== "public") {
        const authorization = await authorize(request, route, params);
        if (authorization !== "authorized") {
          return authorization === "unauthenticated"
            ? jsonError("UNAUTHENTICATED", 401)
            : jsonError("FORBIDDEN", 403);
        }
      }
      const handler = handlers[route.id];
      if (!handler) return jsonError("EMERGENCY_ROUTE_UNAVAILABLE", 503);
      const response = await handler(request, route, params);
      const headers = new Headers(response.headers);
      const cacheablePublicSuccess = route.method === "GET" && route.access === "public" &&
        route.cache === "public-short" && response.status >= 200 && response.status < 300;
      headers.set("cache-control", !cacheablePublicSuccess
        ? "private, no-store"
        : "public, max-age=30, s-maxage=60, stale-while-revalidate=30");
      const body = response.status === 204 || response.status === 205 || response.status === 304
        ? null
        : response.body;
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
