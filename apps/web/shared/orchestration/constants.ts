/**
 * Configuration constants for the Hybrid Skill Orchestrator (Feature 045).
 */

/** Max time to wait for classifier LLM response (ms) */
export const CLASSIFIER_TIMEOUT_MS = 30_000;

/** Error rate threshold (0-1) that triggers the circuit breaker */
export const CLASSIFIER_CIRCUIT_BREAKER_THRESHOLD = 0.2;

/** How long the circuit breaker stays open after tripping (ms) — 5 minutes */
export const CLASSIFIER_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000;

/** Sliding window size for circuit breaker error tracking */
export const CLASSIFIER_CIRCUIT_BREAKER_WINDOW = 100;

/** Maximum iterations for the COMPLEX agent loop */
export const AGENT_MAX_ITERATIONS = 5;

/** Maximum wall-clock time for the agent loop (ms) — 30 seconds */
export const AGENT_MAX_DURATION_MS = 30_000;

/** Confidence threshold: auto-route without confirmation */
export const CONFIDENCE_AUTO_ROUTE = 0.85;

/** Confidence threshold: show soft confirmation form */
export const CONFIDENCE_SOFT_CONFIRM = 0.70;

/** Confidence threshold: below this, treat as no match */
export const CONFIDENCE_ASK_USER = 0.50;

/** Max fields in a skill schema before requiring a separate extraction LLM call */
export const COMBINED_EXTRACTION_MAX_FIELDS = 10;

/** Timeout for polling async skill completion in pipelines (ms) — 60 seconds */
export const ASYNC_SKILL_POLL_TIMEOUT_MS = 60_000;

import type { SkillOrchestratorMaxLevel } from "./types";
export type { SkillOrchestratorMaxLevel } from "./types";

/** Default max level for new tenants — simple only until admin elevates */
export const ORCHESTRATOR_MAX_LEVEL_DEFAULT: SkillOrchestratorMaxLevel = "simple";
