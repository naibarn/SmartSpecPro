/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmergencyMapWorkspace from "../EmergencyMapWorkspace";

afterEach(cleanup);

describe("EmergencyMapWorkspace", () => {
  it("exposes layer controls and forwards visibility changes", async () => {
    const onLayerChange = vi.fn();
    render(<EmergencyMapWorkspace items={[]} visibleLayers={{ locations: true, alertAreas: true }} onLayerChange={onLayerChange} onSelectItem={vi.fn()} onAskAI={vi.fn()} canAskAI />);

    fireEvent.click(await screen.findByRole("switch", { name: /help locations/i }));

    expect(onLayerChange).toHaveBeenCalledWith("locations", false);
  });

  it("keeps a keyboard-accessible feature list and explicit Ask AI action", async () => {
    const onSelectItem = vi.fn();
    const onAskAI = vi.fn();
    const item = { id: "one", publicRef: "EVT-1", kind: "situation", title: "Flood response", status: "active", freshness: "current", location: { latitude: 13.7, longitude: 100.5 } };
    render(<EmergencyMapWorkspace items={[item]} visibleLayers={{ locations: true, alertAreas: true }} onLayerChange={vi.fn()} onSelectItem={onSelectItem} onAskAI={onAskAI} canAskAI />);

    fireEvent.click(await screen.findByRole("button", { name: /flood response/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ask ai about this map/i }));

    expect(onSelectItem).toHaveBeenCalledWith(item);
    expect(onAskAI).toHaveBeenCalledOnce();
  });
});
