import { describe, expect, it, vi } from "vitest";
import {
  createGoogleMapSession,
  isValidGoogleTileCoordinate,
  proxyGoogleMapTile,
} from "./googleMapsTileProvider";

describe("Google Map Tiles provider", () => {
  it("accepts only tile coordinates within the selected zoom grid", () => {
    expect(isValidGoogleTileCoordinate(2, 3, 1)).toBe(true);
    expect(isValidGoogleTileCoordinate(2, 4, 1)).toBe(false);
    expect(isValidGoogleTileCoordinate(22, 1, 4_194_304)).toBe(false);
    expect(isValidGoogleTileCoordinate(23, 0, 0)).toBe(false);
  });

  it("creates a typed Map Tiles session without exposing the server key in the result", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ session: "session-token", expiry: "1900000000", tileWidth: 256, tileHeight: 256 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await createGoogleMapSession({ apiKey: "server-only-key", mapType: "roadmap", fetcher });

    expect(result).toEqual({ session: "session-token", expiresAt: 1_900_000_000_000, tileWidth: 256, tileHeight: 256 });
    expect(JSON.stringify(result)).not.toContain("server-only-key");
    expect(fetcher).toHaveBeenCalledWith(
      "https://tile.googleapis.com/v1/createSession?key=server-only-key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("relays a Google tile without allowing redirects or cache storage", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
    }));

    const response = await proxyGoogleMapTile({
      apiKey: "server-only-key",
      session: "session-token",
      z: 3,
      x: 4,
      y: 2,
      fetcher,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(fetcher).toHaveBeenCalledWith(
      "https://tile.googleapis.com/v1/2dtiles/3/4/2?session=session-token&key=server-only-key",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects invalid coordinates and unsafe session tokens before network calls", async () => {
    const fetcher = vi.fn();
    const response = await proxyGoogleMapTile({ apiKey: "server-key", session: "../leak", z: 3, x: 9, y: 0, fetcher });
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
