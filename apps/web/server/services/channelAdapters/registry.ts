/**
 * ChannelAdapterRegistry — Singleton that maps channelType strings
 * to their ChannelAdapter implementations.
 *
 * Adapters register themselves during app initialization.
 * The channelGateway and deliveryQueue use this to route messages
 * to the correct platform-specific handler.
 */

import type { ChannelAdapter } from "./types";
import { auditLogger } from "../auditLogger";

class ChannelAdapterRegistryImpl {
  private adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channelType, adapter);
    auditLogger.log({
      eventType: "channel_adapter_registered",
      metadata: { channelType: adapter.channelType },
    });
  }

  get(channelType: string): ChannelAdapter | undefined {
    return this.adapters.get(channelType);
  }

  getAll(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** For testing: clear all registrations */
  _reset(): void {
    this.adapters.clear();
  }
}

export const adapterRegistry = new ChannelAdapterRegistryImpl();
