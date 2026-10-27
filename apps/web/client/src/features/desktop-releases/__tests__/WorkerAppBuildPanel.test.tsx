/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, args?: { version?: string }) =>
      args?.version ? `${key} ${args.version}` : key,
  }),
}));
import { WorkerAppBuildPanel } from "../WorkerAppBuildPanel";

afterEach(() => vi.unstubAllGlobals());

describe("Worker App build panel", () => {
  it("starts a build and displays its version and progress", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({
            build: {
              id: "one",
              version: "0.1.433",
              status: "queued",
              runUrl: null,
              error: null,
            },
          })
        : Response.json({ builds: [] })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkerAppBuildPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "dashboard:workerBuild.start" })
    );
    await waitFor(() =>
      expect(screen.getByText(/0\.1\.433/)).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: "dashboard:workerBuild.start" })
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/desktop-releases/worker-app/builds",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });
  it("lets an admin retry a failed import", async () => {
    const build = {
      id: "one",
      version: "0.1.433",
      status: "failed",
      runUrl: null,
      error: "worker_build_sync_failed",
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({
            build: { ...build, status: "published", error: null },
          })
        : Response.json({ builds: [build] })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkerAppBuildPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: "dashboard:workerBuild.retry" })
    );
    await waitFor(() =>
      expect(
        screen.getByText(/dashboard:workerBuild.status.published/)
      ).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/desktop-releases/worker-app/builds/one/sync",
      expect.objectContaining({ method: "POST" })
    );
  });
});
