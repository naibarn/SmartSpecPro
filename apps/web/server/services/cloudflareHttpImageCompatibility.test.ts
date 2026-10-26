import { describe, expect, it } from "vitest";
import { knownHttpNodeImageFailure } from "./cloudflareHttpImageCompatibility";
const image = `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:d8d5b38fca643300119684f11576b4b94c5bfa6e043f75e6a3bf7f471690140f`;
describe("provider-observed immutable Node image failure", () => {
  it("identifies the exact failed artifact without treating unknown images as accepted", () => {
    expect(knownHttpNodeImageFailure(image)).toMatchObject({ code: "HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED", observedVersion: "22.22.3", requiredVersion: ">=22.23.4 <23" });
    for (const value of [undefined, image.replace("node-http", "python-http"), image.replace("registry.cloudflare.com", "foreign.invalid"), image.slice(0,-1)+"e"])
      expect(knownHttpNodeImageFailure(value)).toBeNull();
  });
});
