/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { dispatchEmergencyMapChat, EMERGENCY_MAP_CHAT_EVENT, formatMapContextPrompt } from "../mapChatHandoff";

const context = {
  surface: "emergency_map",
  viewport: { bounds: [99, 12, 101, 15], center: [100, 13], zoom: 7 },
  zoomClass: "CITY",
  selectedFeatures: [],
  activeLayers: ["emergency-points"],
  filters: [],
  temporalContext: { mode: "NOW" },
  requestedMapMode: "PUBLIC",
  visibleSummary: { incidents: 2, hazards: 1, resources: 3, tasks: 0, services: 1 },
} as const;

describe("emergency map chat handoff", () => {
  it("creates editable, public-safe map context without raw feature data", () => {
    const prompt = formatMapContextPrompt(context);
    expect(prompt).toContain("13.000, 100.000");
    expect(prompt).toContain("เหตุ 2");
    expect(prompt).not.toContain("selectedFeatures");
    expect(formatMapContextPrompt({ ...context, viewport: { ...context.viewport, zoom: 100 } })).toBeUndefined();
  });

  it("dispatches only after explicit request with a valid context", () => {
    const listener = vi.fn();
    window.addEventListener(EMERGENCY_MAP_CHAT_EVENT, listener);
    dispatchEmergencyMapChat(context);
    dispatchEmergencyMapChat({ ...context, activeLayers: ["invalid layer"] } as never);
    window.removeEventListener(EMERGENCY_MAP_CHAT_EVENT, listener);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ detail: { prompt: expect.stringContaining("แผนที่ภัยฉุกเฉิน") } });
  });
});
