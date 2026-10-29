import { randomUUID } from "node:crypto";
import { expect, test } from "./authenticated.fixture";

test("password login resolves server environment and rejects unknown accounts normally", async ({ page }) => {
  const response = await page.request.post("/trpc/auth.login", {
    data: {
      json: {
        email: `uat-module-probe-${randomUUID()}@example.invalid`,
        password: "intentionally-invalid-uat-probe",
      },
    },
  });

  expect(response.status()).toBe(401);
});
