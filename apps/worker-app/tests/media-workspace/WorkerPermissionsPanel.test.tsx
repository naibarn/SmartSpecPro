import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerAppProvider } from "../../src/app/workerContext";
import { WorkerPermissionsPanel } from "../../src/screens/WorkerPermissionsPanel";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let root: ReturnType<typeof createRoot>;
let container: HTMLElement;
function render(connectionKey: string | null) {
  root.render(<WorkerAppProvider activeRoute="connection" locale="th"><WorkerPermissionsPanel connectionKey={connectionKey} /></WorkerAppProvider>);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  invoke.mockReset();
  container = document.createElement("section");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe("Worker permissions connection changes", () => {
  it("waits for connection and loads permissions after approval", async () => {
    invoke.mockResolvedValue({ status: "active", authorization: { effectiveScopes: ["worker:claim"] } });
    await act(async () => render(null));
    expect(invoke).not.toHaveBeenCalled();
    expect(container.textContent).toContain("เชื่อมต่อ Worker เพื่อดูสิทธิ์");
    await act(async () => render("worker-1:first-session"));
    expect(invoke).toHaveBeenCalledWith("worker_app_get_worker_policy");
    expect(container.textContent).toContain("worker:claim");
    expect(container.textContent).not.toContain("worker_connection_required");
  });
  it("ignores a response from an earlier connection after reconnecting", async () => {
    let resolveOld!: (value: unknown) => void;
    invoke.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    invoke.mockResolvedValueOnce({ status: "active", authorization: { effectiveScopes: ["new-scope"] } });
    await act(async () => render("worker-1:old"));
    await act(async () => render("worker-1:new"));
    expect(container.textContent).toContain("new-scope");
    await act(async () => resolveOld({ authorization: { effectiveScopes: ["old-scope"] } }));
    expect(container.textContent).not.toContain("old-scope");
    expect(container.textContent).toContain("new-scope");
  });
});
