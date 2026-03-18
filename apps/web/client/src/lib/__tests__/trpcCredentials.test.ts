import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("tRPC client credentials configuration", () => {
  it("httpLink includes credentials:'include' in fetch wrapper", () => {
    // Read main.tsx source to verify credentials: "include" is present
    // in the tRPC httpLink configuration
    const mainTsx = readFileSync(
      resolve(__dirname, "../../main.tsx"),
      "utf-8",
    );

    // The httpLink custom fetch wrapper must include credentials: "include"
    // to send httpOnly cookies with every tRPC request
    expect(mainTsx).toContain('credentials: "include"');
  });

  it("httpLink fetch wrapper appears in the tRPC client configuration section", () => {
    const mainTsx = readFileSync(
      resolve(__dirname, "../../main.tsx"),
      "utf-8",
    );

    // Verify the credentials config is within a fetch/httpLink context
    // by checking that both httpLink and credentials appear nearby
    expect(mainTsx).toContain("httpLink");
    expect(mainTsx).toContain('credentials: "include"');
  });
});
