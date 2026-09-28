import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverDir = path.resolve(import.meta.dirname, "..");

describe("email auth route contract", () => {
  it("uses canonical email lookup and rejects passwordless password-login accounts", () => {
    const dbSource = fs.readFileSync(path.join(serverDir, "db.ts"), "utf-8");
    const routerSource = fs.readFileSync(
      path.join(serverDir, "routers.ts"),
      "utf-8"
    );

    expect(dbSource).toContain("lower(btrim(${users.email}))");
    expect(routerSource).toContain("email: authEmailSchema");
    expect(routerSource).toContain("if (!user.password)");
    expect(routerSource).toContain('code: "UNAUTHORIZED"');
  });

  it("keeps auth user reads compatible while tenant-identity migrations are pending", () => {
    const dbSource = fs.readFileSync(path.join(serverDir, "db.ts"), "utf-8");

    expect(dbSource).toContain("AUTH_USER_SELECT_FIELDS");
    expect(dbSource).toContain("select(AUTH_USER_SELECT_FIELDS)");

    for (const functionName of ["getUserByOpenId", "getUserById", "getUserByEmail"]) {
      const start = dbSource.indexOf(`export async function ${functionName}`);
      const end = dbSource.indexOf("\nexport async function", start + 1);
      const functionSource = dbSource.slice(start, end === -1 ? undefined : end);
      expect(functionSource).toContain("return findAuthUser(");
      expect(functionSource).not.toContain("select().from(users)");
    }
  });

  it("rate-limits reset-code verification separately from password reset", () => {
    const trpcSource = fs.readFileSync(
      path.join(serverDir, "_core/trpc.ts"),
      "utf-8"
    );
    const routerSource = fs.readFileSync(
      path.join(serverDir, "routers.ts"),
      "utf-8"
    );

    expect(trpcSource).toContain('namespace: "verify-reset-code"');
    expect(routerSource).toContain("verifyResetCode: verifyResetCodeProcedure");
    expect(routerSource).toContain('code: "BAD_REQUEST"');
  });
});
