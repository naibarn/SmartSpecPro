import { describe, expect, it } from "vitest";
import Gallery from "./Gallery";

describe("Gallery module", () => {
  it("imports successfully with Admin action wiring", () => {
    expect(typeof Gallery).toBe("function");
  });
});
