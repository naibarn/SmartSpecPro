/**
 * Auth Generator Types
 * Types for the auth generator UI
 */

// ============================================================================
// Enums
// ============================================================================

export type OAuthProvider = 'google' | 'github' | 'facebook' | 'twitter' | 'microsoft' | 'apple';

export type TwoFactorMethod = 'totp' | 'sms' | 'email';

export type DatabaseType = 'prisma' | 'typeorm' | 'mongoose';

export type TokenExpiry = '5m' | '15m' | '30m' | '1h' | '6h' | '12h' | '1d' | '7d' | '30d';

// ============================================================================
// Configuration Types
// ============================================================================

export interface JWTConfig {
  accessTokenExpiry: TokenExpiry;
  refreshTokenExpiry: TokenExpiry;
  algorithm: string;
  issuer?: string;
}

export interface OAuthConfig {
  enabled: boolean;
  providers: OAuthProvider[];
  callbackUrl?: string;
}

export interface TwoFactorConfig {
  enabled: boolean;
  methods: TwoFactorMethod[];
  issuerName?: string;
}

export interface RBACRole {
  name: string;
  permissions: string[];
  description?: string;
}

export interface RBACConfig {
  enabled: boolean;
  roles: RBACRole[];
}

export interface APIKeyConfig {
  enabled: boolean;
  prefix: string;
  expiryDays?: number;
  rateLimit?: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests: boolean;
}

export interface AuditLogConfig {
  enabled: boolean;
  logSuccessful: boolean;
  logFailed: boolean;
  retentionDays: number;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  maxAgeDays?: number;
}

export interface AuthGeneratorConfig {
  projectName: string;
  outputDir: string;
  database: DatabaseType;
  
  // Core features
  jwt: JWTConfig;
  oauth: OAuthConfig;
  twoFactor: TwoFactorConfig;
  rbac: RBACConfig;
  apiKeys: APIKeyConfig;
  
  // Security features
  rateLimit: RateLimitConfig;
  auditLog: AuditLogConfig;
  passwordPolicy: PasswordPolicy;
  
  // Additional options
  generateTests: boolean;
  generateSwagger: boolean;
  typescript: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface GeneratedFile {
  path: string;
  type: string;
  size: number;
  preview?: string;
}

export interface GenerationResult {
  success: boolean;
  message: string;
  files: GeneratedFile[];
  outputDir: string;
  specFile?: string;
  errors: string[];
}

export interface PreviewResponse {
  fileName: string;
  content: string;
  language: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  features: string[];
  config: AuthGeneratorConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FeatureInfo {
  id: string;
  name: string;
  description: string;
}

export interface FeaturesResponse {
  core: FeatureInfo[];
  security: FeatureInfo[];
  oauthProviders: OAuthProvider[];
  twoFactorMethods: TwoFactorMethod[];
  databases: DatabaseType[];
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_JWT_CONFIG: JWTConfig = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  algorithm: 'HS256',
};

export const DEFAULT_OAUTH_CONFIG: OAuthConfig = {
  enabled: false,
  providers: [],
};

export const DEFAULT_TWO_FACTOR_CONFIG: TwoFactorConfig = {
  enabled: false,
  methods: ['totp'],
};

export const DEFAULT_RBAC_CONFIG: RBACConfig = {
  enabled: false,
  roles: [
    { name: 'admin', permissions: ['*'], description: 'Full access' },
    { name: 'user', permissions: ['read', 'write'], description: 'Standard user' },
    { name: 'guest', permissions: ['read'], description: 'Read-only access' },
  ],
};

export const DEFAULT_API_KEY_CONFIG: APIKeyConfig = {
  enabled: false,
  prefix: 'sk_',
  expiryDays: 365,
  rateLimit: 1000,
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  maxRequests: 100,
  windowMs: 60000,
  skipSuccessfulRequests: false,
};

export const DEFAULT_AUDIT_LOG_CONFIG: AuditLogConfig = {
  enabled: true,
  logSuccessful: true,
  logFailed: true,
  retentionDays: 90,
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: true,
};

export const DEFAULT_AUTH_CONFIG: AuthGeneratorConfig = {
  projectName: 'my-app',
  outputDir: './src/auth',
  database: 'prisma',
  jwt: DEFAULT_JWT_CONFIG,
  oauth: DEFAULT_OAUTH_CONFIG,
  twoFactor: DEFAULT_TWO_FACTOR_CONFIG,
  rbac: DEFAULT_RBAC_CONFIG,
  apiKeys: DEFAULT_API_KEY_CONFIG,
  rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
  auditLog: DEFAULT_AUDIT_LOG_CONFIG,
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
  generateTests: true,
  generateSwagger: true,
  typescript: true,
};

// ============================================================================
// UI Helper Types
// ============================================================================

export type PreviewFileType = 'spec' | 'controller' | 'service' | 'middleware' | 'routes';

export interface AuthGeneratorStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

export const AUTH_GENERATOR_STEPS: AuthGeneratorStep[] = [
  { id: 'project', title: 'Project Setup', description: 'Configure project name and output', completed: false },
  { id: 'jwt', title: 'JWT Settings', description: 'Configure token expiry and algorithm', completed: false },
  { id: 'oauth', title: 'OAuth Providers', description: 'Enable social login providers', completed: false },
  { id: 'security', title: 'Security Features', description: 'Configure 2FA, RBAC, and API keys', completed: false },
  { id: 'advanced', title: 'Advanced Options', description: 'Rate limiting, audit logs, password policy', completed: false },
  { id: 'review', title: 'Review & Generate', description: 'Preview and generate code', completed: false },
];

// ============================================================================
// OAuth Provider Info
// ============================================================================

export interface OAuthProviderInfo {
  id: OAuthProvider;
  name: string;
  icon: string;
  color: string;
  docsUrl: string;
}

export const OAUTH_PROVIDERS: OAuthProviderInfo[] = [
  { id: 'google', name: 'Google', icon: '🔵', color: '#4285F4', docsUrl: 'https://developers.google.com/identity' },
  { id: 'github', name: 'GitHub', icon: '⚫', color: '#333333', docsUrl: 'https://docs.github.com/en/developers/apps/building-oauth-apps' },
  { id: 'facebook', name: 'Facebook', icon: '🔵', color: '#1877F2', docsUrl: 'https://developers.facebook.com/docs/facebook-login' },
  { id: 'twitter', name: 'Twitter/X', icon: '⬛', color: '#000000', docsUrl: 'https://developer.twitter.com/en/docs/authentication' },
  { id: 'microsoft', name: 'Microsoft', icon: '🟦', color: '#00A4EF', docsUrl: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/' },
  { id: 'apple', name: 'Apple', icon: '⬛', color: '#000000', docsUrl: 'https://developer.apple.com/sign-in-with-apple/' },
];

// ============================================================================
// Token Expiry Options
// ============================================================================

export interface TokenExpiryOption {
  value: TokenExpiry;
  label: string;
  description: string;
}

export const ACCESS_TOKEN_OPTIONS: TokenExpiryOption[] = [
  { value: '5m', label: '5 minutes', description: 'High security' },
  { value: '15m', label: '15 minutes', description: 'Recommended' },
  { value: '30m', label: '30 minutes', description: 'Balanced' },
  { value: '1h', label: '1 hour', description: 'Convenience' },
];

export const REFRESH_TOKEN_OPTIONS: TokenExpiryOption[] = [
  { value: '1d', label: '1 day', description: 'High security' },
  { value: '7d', label: '7 days', description: 'Recommended' },
  { value: '30d', label: '30 days', description: 'Convenience' },
];
