import { describe, expect, it } from "vitest";
import { API_ROUTE_MANIFEST, classifyApiRoute } from "./apiRouteManifest";

describe("Cloudflare API route manifest", () => {
  it("marks health and the stateless public-key API as Worker-native", () => {
    expect(classifyApiRoute("GET", "/healthz")).toMatchObject({
      id: "health.liveness",
      classification: "WORKER_NATIVE",
    });
    expect(classifyApiRoute("HEAD", "/healthz").classification).toBe("WORKER_NATIVE");
    expect(classifyApiRoute("GET", "/readyz")).toMatchObject({
      id: "health.readiness",
      classification: "WORKER_NATIVE",
    });
    expect(classifyApiRoute("GET", "/.well-known/smartaihub-evidence-keys.json")).toMatchObject({
      id: "content-protection.public-keys",
      classification: "WORKER_NATIVE",
    });
    expect(classifyApiRoute("GET", "/metrics").classification).toBe("NATIVE_RUNTIME_ONLY");
  });

  it("keeps auth, API, tRPC, public v1, and uploads on the origin", () => {
    for (const [method, pathname] of [
      ["POST", "/api/auth/login"],
      ["GET", "/oauth/callback"],
      ["POST", "/trpc/user.me"],
      ["GET", "/api/media/image-proxy"],
      ["POST", "/v1/jobs"],
      ["GET", "/uploads/tenant/file"],
    ]) {
      expect(classifyApiRoute(method, pathname).classification).toBe("ORIGIN_PROXY");
    }
  });

  it("prioritizes native-only runtime streams and rejects method mismatches", () => {
    expect(classifyApiRoute("GET", "/api/virtual-admin/events").classification).toBe("NATIVE_RUNTIME_ONLY");
    expect(classifyApiRoute("GET", "/socket.io").classification).toBe("NATIVE_RUNTIME_ONLY");
    expect(classifyApiRoute("POST", "/healthz")).toMatchObject({
      id: "unmatched",
      classification: "NATIVE_RUNTIME_ONLY",
    });
  });

  it("matches path segments safely and fails closed on unknown paths", () => {
    expect(classifyApiRoute("GET", "/apiary/health").id).toBe("unmatched");
    expect(classifyApiRoute("GET", "/unknown")).toMatchObject({
      id: "unmatched",
      classification: "NATIVE_RUNTIME_ONLY",
    });
    expect(classifyApiRoute("GET", "/api/public/status?detail=1").id).toBe("api");
  });

  it("provides the complete classification vocabulary and stable unique ids", () => {
    const ids = API_ROUTE_MANIFEST.map(route => route.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(API_ROUTE_MANIFEST.map(route => route.classification))).toEqual(
      new Set(["WORKER_NATIVE", "ORIGIN_PROXY", "NATIVE_RUNTIME_ONLY", "WORKER_COMPATIBLE_WITH_CHANGES"]),
    );
    expect(classifyApiRoute("GET", "/future-worker-route").classification).not.toBe(
      "WORKER_COMPATIBLE_WITH_CHANGES",
    );
  });
});
