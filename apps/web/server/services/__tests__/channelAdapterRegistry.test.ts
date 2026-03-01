import { describe, it, expect, vi, beforeEach } from "vitest";

// Import after mocking dependencies
vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: vi.fn(),
  },
}));

import { adapterRegistry } from "../channelAdapters/registry";
import type { ChannelAdapter } from "../channelAdapters/types";

function makeMockAdapter(channelType: string): ChannelAdapter {
  return {
    channelType,
    capabilities: {
      maxMessageLength: 4096,
      supportsButtons: false,
      supportsRichText: false,
      supportsAttachments: false,
      rateLimitPerSecond: 10,
    },
    validateWebhook: vi.fn().mockResolvedValue(true),
    parseInbound: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    formatMessage: vi.fn((text: string) => [text]),
  };
}

describe("ChannelAdapterRegistry", () => {
  beforeEach(() => {
    // Reset registry state between tests
    adapterRegistry._reset();
  });

  it("register adds adapter and get retrieves it by channelType", () => {
    const adapter = makeMockAdapter("telegram");
    adapterRegistry.register(adapter);

    expect(adapterRegistry.get("telegram")).toBe(adapter);
  });

  it("get returns undefined for unregistered channelType", () => {
    expect(adapterRegistry.get("whatsapp")).toBeUndefined();
  });

  it("getAll returns all registered adapters", () => {
    const telegramAdapter = makeMockAdapter("telegram");
    const whatsappAdapter = makeMockAdapter("whatsapp");

    adapterRegistry.register(telegramAdapter);
    adapterRegistry.register(whatsappAdapter);

    const all = adapterRegistry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(telegramAdapter);
    expect(all).toContain(whatsappAdapter);
  });

  it("registering same channelType twice overwrites the first", () => {
    const adapter1 = makeMockAdapter("telegram");
    const adapter2 = makeMockAdapter("telegram");

    adapterRegistry.register(adapter1);
    adapterRegistry.register(adapter2);

    expect(adapterRegistry.get("telegram")).toBe(adapter2);
    expect(adapterRegistry.getAll()).toHaveLength(1);
  });

  it("_reset clears all adapters", () => {
    adapterRegistry.register(makeMockAdapter("telegram"));
    adapterRegistry.register(makeMockAdapter("whatsapp"));

    adapterRegistry._reset();

    expect(adapterRegistry.getAll()).toHaveLength(0);
    expect(adapterRegistry.get("telegram")).toBeUndefined();
  });
});
