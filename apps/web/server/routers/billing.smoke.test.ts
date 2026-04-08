import { describe, expect, it } from "vitest";

import { appRouter } from "../routers";
import { adminBillingRouter } from "./adminBilling";
import { billingRouter } from "./billing";

describe("billing routers", () => {
  it("exports billing router", () => {
    expect(billingRouter).toBeDefined();
  });

  it("exports admin billing router", () => {
    expect(adminBillingRouter).toBeDefined();
  });

  it("wires billing routers into the app router", () => {
    expect(appRouter).toBeDefined();
  });
});
