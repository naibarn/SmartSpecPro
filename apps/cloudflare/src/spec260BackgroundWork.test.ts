import { describe, expect, it, vi } from "vitest";
import { createSpec260EvidenceRetentionSweep, spec260EvidenceRetentionOccurrence } from "./spec260BackgroundWork";

describe("Spec260 Cloudflare evidence-retention schedule", () => {
  it("uses a deterministic five-minute UTC occurrence key", () => {
    expect(spec260EvidenceRetentionOccurrence(Date.parse("2026-09-30T12:08:51.000Z")))
      .toBe("2026-09-30T12:05Z:emergency-evidence-retention");
  });

  it("fails closed without platform origin and token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.parse("2026-09-30T12:10:00.000Z"), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled" }))
      .resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts only a deterministic schedule occurrence to the private canonical platform", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    const scheduledTime = Date.parse("2026-09-30T12:08:51.000Z");
    await expect(sweep({ scheduledTime, maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://internal.example", PLATFORM_EDGE_PRIVATE_HOST: "internal.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("completed");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://internal.example/api/internal/spec260/schedules/evidence-retention");
    expect((init?.headers as Headers).get("x-internal-token")).toBe("secret");
    expect(JSON.parse(String(init?.body))).toEqual({ scheduledTime, occurrenceKey: "2026-09-30T12:05Z:emergency-evidence-retention" });
  });

  it("rejects non-private or recursive origins", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "http://public.example", PLATFORM_EDGE_PRIVATE_HOST: "public.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed for an HTTPS hostname without the private-host allowlist", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://public.example", PLATFORM_EDGE_PRIVATE_HOST: "private.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns retry for non-successful platform admission", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://internal.example", PLATFORM_EDGE_PRIVATE_HOST: "internal.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
  });
});
