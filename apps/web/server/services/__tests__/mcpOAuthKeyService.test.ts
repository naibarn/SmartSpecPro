import { describe, expect, it } from "vitest";
import { importJWK, jwtVerify, SignJWT } from "jose";

import { generateMcpOAuthSigningKeyMaterial } from "../mcpOAuthKeyService";

describe("MCP OAuth signing key provisioning", () => {
  it("creates serialisable RSA JWKs that can sign and verify", async () => {
    const material = await generateMcpOAuthSigningKeyMaterial();

    expect(material.kid).toMatch(/^mcp-[a-f0-9]{16}$/);
    expect(material.privateJwk).toMatchObject({
      kty: "RSA",
      alg: "RS256",
      use: "sig",
      kid: material.kid,
    });
    expect(typeof material.privateJwk.d).toBe("string");
    expect(material.publicJwk).toMatchObject({
      kty: "RSA",
      alg: "RS256",
      use: "sig",
      kid: material.kid,
    });
    expect(material.publicJwk).not.toHaveProperty("d");

    const privateKey = await importJWK(material.privateJwk, "RS256");
    const publicKey = await importJWK(material.publicJwk, "RS256");
    const token = await new SignJWT({ tenant_id: "tenant-test", user_id: 1 })
      .setProtectedHeader({ alg: "RS256", kid: material.kid })
      .setIssuer("https://smartaihub.app")
      .setAudience("smartaihub-mcp")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(jwtVerify(token, publicKey, {
      issuer: "https://smartaihub.app",
      audience: "smartaihub-mcp",
      algorithms: ["RS256"],
    })).resolves.toMatchObject({ payload: { tenant_id: "tenant-test", user_id: 1 } });
  });
});
