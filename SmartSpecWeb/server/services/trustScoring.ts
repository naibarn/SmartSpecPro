/**
 * Trust Score Service
 * Calculates a 0-100 trust score for new registrations
 * to detect duplicate/suspicious accounts without hard-blocking.
 */

import { getDb } from "../db";
import { registrationEvents, deviceFingerprints, blockedPatterns, users } from "../../drizzle/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { analyzeEmail, type EmailAnalysis } from "./emailAnalysis";

export interface TrustFactors {
  emailAnalysis: EmailAnalysis;
  existingAccountsSameNormEmail: number;
  existingAccountsSameFingerprint: number;
  existingAccountsSameIp24h: number;
  isBlockedPattern: boolean;
}

export interface TrustResult {
  score: number;
  factors: TrustFactors;
  outcome: "allowed" | "flagged" | "blocked";
}

/**
 * Calculate trust score from factors.
 * Base score: 100. Deductions for suspicious signals.
 */
function calculateScore(factors: TrustFactors): number {
  let score = 100;

  if (factors.isBlockedPattern) return 0;
  if (factors.emailAnalysis.isDisposable) score -= 50;
  if (factors.emailAnalysis.isPlusAlias) score -= 10;
  if (factors.emailAnalysis.isDotVariant) score -= 5;
  score -= factors.existingAccountsSameNormEmail * 30;
  score -= factors.existingAccountsSameFingerprint * 25;
  score -= factors.existingAccountsSameIp24h * 20;

  return Math.max(0, Math.min(100, score));
}

function scoreToOutcome(score: number): "allowed" | "flagged" | "blocked" {
  if (score >= 70) return "allowed";
  if (score >= 40) return "flagged";
  return "blocked";
}

/**
 * Evaluate trust for a new registration.
 */
export async function evaluateRegistration(params: {
  email: string;
  ipAddress: string;
  fingerprintHash?: string;
}): Promise<TrustResult> {
  const db = await getDb();
  const emailAnalysis = analyzeEmail(params.email);

  // Default factors if DB unavailable
  const factors: TrustFactors = {
    emailAnalysis,
    existingAccountsSameNormEmail: 0,
    existingAccountsSameFingerprint: 0,
    existingAccountsSameIp24h: 0,
    isBlockedPattern: false,
  };

  if (!db) {
    const score = calculateScore(factors);
    return { score, factors, outcome: scoreToOutcome(score) };
  }

  // Check blocked patterns
  const blocks = await db
    .select({ pattern: blockedPatterns.pattern, patternType: blockedPatterns.patternType })
    .from(blockedPatterns)
    .where(eq(blockedPatterns.isActive, true));

  for (const b of blocks) {
    if (b.patternType === "email_domain" && emailAnalysis.domain === b.pattern) {
      factors.isBlockedPattern = true;
      break;
    }
    if (b.patternType === "email" && emailAnalysis.normalized === b.pattern) {
      factors.isBlockedPattern = true;
      break;
    }
    if (b.patternType === "ip" && params.ipAddress === b.pattern) {
      factors.isBlockedPattern = true;
      break;
    }
    if (b.patternType === "fingerprint" && params.fingerprintHash === b.pattern) {
      factors.isBlockedPattern = true;
      break;
    }
  }

  // Count existing accounts with same normalized email
  const [normEmailCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.normalizedEmail, emailAnalysis.normalized));
  factors.existingAccountsSameNormEmail = normEmailCount?.count || 0;

  // Count accounts from same fingerprint
  if (params.fingerprintHash) {
    const [fpCount] = await db
      .select({ count: sql<number>`count(distinct ${deviceFingerprints.userId})::int` })
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.fingerprintHash, params.fingerprintHash));
    factors.existingAccountsSameFingerprint = fpCount?.count || 0;
  }

  // Count registrations from same IP in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [ipCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrationEvents)
    .where(and(
      eq(registrationEvents.ipAddress, params.ipAddress),
      gte(registrationEvents.createdAt, oneDayAgo)
    ));
  factors.existingAccountsSameIp24h = ipCount?.count || 0;

  const score = calculateScore(factors);
  return { score, factors, outcome: scoreToOutcome(score) };
}

/**
 * Log a registration event to the database.
 */
export async function logRegistrationEvent(params: {
  userId?: number;
  email: string;
  normalizedEmail: string;
  ipAddress: string;
  fingerprintHash?: string;
  userAgent?: string;
  loginMethod?: string;
  trustScore: number;
  outcome: string;
  metadata?: Record<string, any>;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(registrationEvents).values({
    userId: params.userId,
    email: params.email,
    normalizedEmail: params.normalizedEmail,
    ipAddress: params.ipAddress,
    fingerprintHash: params.fingerprintHash,
    userAgent: params.userAgent,
    loginMethod: params.loginMethod,
    trustScore: params.trustScore,
    outcome: params.outcome,
    metadata: params.metadata,
  });
}

/**
 * Record a device fingerprint for a user.
 */
export async function recordDeviceFingerprint(userId: number, fingerprintHash: string) {
  const db = await getDb();
  if (!db || !fingerprintHash) return;

  const [existing] = await db
    .select()
    .from(deviceFingerprints)
    .where(and(
      eq(deviceFingerprints.userId, userId),
      eq(deviceFingerprints.fingerprintHash, fingerprintHash)
    ))
    .limit(1);

  if (existing) {
    await db.update(deviceFingerprints)
      .set({
        lastSeenAt: new Date(),
        seenCount: sql`${deviceFingerprints.seenCount} + 1`,
      })
      .where(eq(deviceFingerprints.id, existing.id));
  } else {
    await db.insert(deviceFingerprints).values({ userId, fingerprintHash });
  }
}
