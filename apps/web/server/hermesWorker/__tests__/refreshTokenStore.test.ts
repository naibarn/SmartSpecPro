import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  persistHermesRefreshToken,
  readHermesRefreshToken,
} from "../refreshTokenStore";

describe("Hermes refresh token store", () => {
  it("uses the bootstrap token until a rotated token has been persisted", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-token-"));
    const tokenFile = join(root, "refresh-token");

    expect(await readHermesRefreshToken(tokenFile, "bootstrap-token")).toBe("bootstrap-token");
    await persistHermesRefreshToken(tokenFile, "rotated-token");

    expect(await readHermesRefreshToken(tokenFile, "bootstrap-token")).toBe("rotated-token");
    expect((await readFile(tokenFile, "utf8")).trim()).toBe("rotated-token");
    expect((await stat(tokenFile)).mode & 0o777).toBe(0o600);
  });

  it("rejects newline injection", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-token-"));
    await expect(
      persistHermesRefreshToken(join(root, "refresh-token"), "bad\ntoken"),
    ).rejects.toThrow("invalid");
  });
});
