/**
 * Token and scope utilities for SmartSpec Web
 * Handles authorization scopes for MCP and other features
 */

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("CRITICAL: JWT_SECRET must be set in production"); })() : "dev_jwt_secret_change_in_production");

/**
 * Token claims interface
 */
export interface TokenClaims {
  sub: string;
  type?: string; // "access" or "refresh" - required by Python backend
  scopes?: string[];
  jti?: string;
  exp?: number;
  iat?: number;
}

/**
 * Verify a bearer JWT token
 * @param token - JWT token string
 * @returns Decoded token claims
 * @throws Error if token is invalid
 */
export async function verifyBearerToken(token: string): Promise<TokenClaims> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenClaims;
    return decoded;
  } catch (error: any) {
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Sign a bearer JWT token
 * @param claims - Token claims to sign
 * @param expiresIn - Token expiration (default: 1h)
 * @returns Signed JWT token
 */
export function signBearerToken(claims: TokenClaims, expiresIn: string = "1h"): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn });
}

/**
 * Check if a user has a specific scope
 * @param scopes - Array of scopes the user has
 * @param required - Required scope to check
 * @returns true if user has the required scope
 */
export function hasScope(scopes: string[] | undefined, required: string): boolean {
  if (!scopes || !Array.isArray(scopes)) {
    return false;
  }

  // Check for exact match
  if (scopes.includes(required)) {
    return true;
  }

  // Check for wildcard scope (e.g., "mcp:*" covers "mcp:read", "mcp:write")
  const [requiredPrefix] = required.split(":");
  if (scopes.includes(`${requiredPrefix}:*`)) {
    return true;
  }

  // Check for admin scope which grants all permissions
  if (scopes.includes("admin") || scopes.includes("*")) {
    return true;
  }

  return false;
}

/**
 * Parse scopes from a token or string
 * @param scopeString - Space or comma separated scope string
 * @returns Array of scopes
 */
export function parseScopes(scopeString: string | undefined): string[] {
  if (!scopeString) {
    return [];
  }

  // Support both space and comma separated scopes
  return scopeString
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Validate scope format
 * @param scope - Scope to validate
 * @returns true if scope format is valid
 */
export function isValidScope(scope: string): boolean {
  if (!scope || typeof scope !== "string") {
    return false;
  }

  // Scope should be alphanumeric with colons and wildcards
  return /^[a-zA-Z0-9:*_-]+$/.test(scope);
}

/**
 * Get default scopes for a new user or token
 * @returns Array of default scopes
 */
export function getDefaultScopes(): string[] {
  return [
    "mcp:read",
    "profile:read",
  ];
}
