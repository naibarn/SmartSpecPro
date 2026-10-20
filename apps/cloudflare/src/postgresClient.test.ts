import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ driver: vi.fn(), end: vi.fn(), unsafe: vi.fn(), begin: vi.fn() }));
vi.mock("postgres", () => ({ default: mocks.driver }));
import { withHyperdrivePostgres } from "./postgresClient";
describe("request scoped Hyperdrive PostgreSQL driver", () => {
  it("uses supported preparation and closes sockets on success and failure", async () => {
    mocks.driver.mockReturnValue({ unsafe: mocks.unsafe, begin: mocks.begin, end: mocks.end });
    mocks.unsafe.mockResolvedValue([{ ok: true }]);
    await withHyperdrivePostgres({ connectionString: "postgres://disposable" }, client => client.unsafe("SELECT $1", [1]));
    expect(mocks.driver).toHaveBeenCalledWith("postgres://disposable", expect.objectContaining({ prepare: true, fetch_types: false, max: 5 }));
    expect(mocks.unsafe).toHaveBeenCalledWith("SELECT $1", [1], { prepare: true });
    expect(mocks.end).toHaveBeenCalledTimes(1);
    await expect(withHyperdrivePostgres({ connectionString: "postgres://disposable" }, async () => { throw Error("failed"); })).rejects.toThrow("failed");
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });
});
