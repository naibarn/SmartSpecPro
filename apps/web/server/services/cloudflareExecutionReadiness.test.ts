import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), readlink: vi.fn() }));
vi.mock("node:fs/promises", () => mocks);
import { checkCloudflareExecutionReadiness } from "./cloudflareExecutionReadiness";
describe("JIT migration execution readiness without issuing authority", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readFile.mockResolvedValue(`${Date.now()}\talive\t123\n`); mocks.readlink.mockResolvedValue(process.cwd()); });
  it("uses actual Node dispatch capacity, independently of Python class admission", async () => {
    expect(await checkCloudflareExecutionReadiness({ execute: async () => [{ count: 0 }] } as any)).toMatchObject({ ready: true });
  });
  it.each(["missing", "stale", "future", "starting", "wrong-release", "queue-blocked"])("defers authorization for %s", async kind => {
    if (kind === "missing") mocks.readFile.mockRejectedValue(new Error("ENOENT"));
    if (kind === "stale") mocks.readFile.mockResolvedValue(`${Date.now() - 60000}\talive\t123`);
    if (kind === "future") mocks.readFile.mockResolvedValue(`${Date.now() + 60000}\talive\t123`);
    if (kind === "starting") mocks.readFile.mockResolvedValue(`${Date.now()}\tstarting\t123`);
    if (kind === "wrong-release") mocks.readlink.mockResolvedValue("/unrelated-release");
    expect(await checkCloudflareExecutionReadiness({ execute: async () => [{ count: kind === "queue-blocked" ? 1 : 0 }] } as any)).toMatchObject({ ready: false });
  });
});
