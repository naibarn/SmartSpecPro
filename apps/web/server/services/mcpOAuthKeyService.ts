import crypto from "node:crypto";
import { exportJWK, generateKeyPair, type JWK } from "jose";

export type McpOAuthSigningKeyMaterial = {
  privateJwk: JWK;
  publicJwk: JWK;
  kid: string;
};

/**
 * Generate the first-party MCP OAuth signing material.
 *
 * jose deliberately creates non-extractable private CryptoKeys by default.
 * The private key must be serialised once so it can be encrypted by the
 * system-settings secret store and restored after a process restart, hence
 * extractable is enabled only for this server-side provisioning boundary.
 * The caller must persist privateJwk only through the sensitive settings path.
 */
export async function generateMcpOAuthSigningKeyMaterial(): Promise<McpOAuthSigningKeyMaterial> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const kid = `mcp-${crypto
    .createHash("sha256")
    .update(JSON.stringify(publicJwk))
    .digest("hex")
    .slice(0, 16)}`;

  return {
    privateJwk: { ...privateJwk, alg: "RS256", use: "sig", kid },
    publicJwk: { ...publicJwk, alg: "RS256", use: "sig", kid },
    kid,
  };
}
