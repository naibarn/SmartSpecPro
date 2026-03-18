/**
 * Orchestrator Event Bus — Redis pub/sub wrapper for real-time events.
 *
 * Publishes events to run, team, and user channels for SSE consumption.
 */

import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RunEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  ts: string;
  actorType: "user" | "assistant" | "system";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal";
  data: Record<string, unknown>;
  userId?: number;
}

export type EventCallback = (event: RunEvent) => void;

// ─── Channel Names ──────────────────────────────────────────────────────────

export function runChannel(runId: string): string {
  return `orchestrator:run:${runId}`;
}

export function teamChannel(teamId: string): string {
  return `orchestrator:team:${teamId}`;
}

export function userChannel(userId: number): string {
  return `orchestrator:user:${userId}`;
}

// ─── Event Validation ───────────────────────────────────────────────────────

export function validateEvent(event: Partial<RunEvent>): event is RunEvent {
  return !!(event.eventId && event.eventType && event.runId && event.teamId && event.ts);
}

// ─── Publish ────────────────────────────────────────────────────────────────

export async function publishEvent(
  event: RunEvent,
  redisPublisher?: { publish: (channel: string, message: string) => Promise<number> },
): Promise<void> {
  if (!validateEvent(event)) {
    throw new Error("Invalid event: missing required fields (eventId, eventType, runId, teamId, ts)");
  }

  const message = JSON.stringify(event);

  if (!redisPublisher) {
    // Lazy-load Redis to avoid circular imports
    try {
      const { getRedisClient } = await import("./redis");
      const redis = getRedisClient();
      if (redis) {
        await redis.publish(runChannel(event.runId), message);
        await redis.publish(teamChannel(event.teamId), message);
        if (event.userId) {
          await redis.publish(userChannel(event.userId), message);
        }
      }
    } catch {
      // Redis not available; events are lost (acceptable in dev)
    }
    return;
  }

  await redisPublisher.publish(runChannel(event.runId), message);
  await redisPublisher.publish(teamChannel(event.teamId), message);
  if (event.userId) {
    await redisPublisher.publish(userChannel(event.userId), message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function createEvent(
  type: string,
  params: {
    tenantId: string;
    teamId: string;
    roomId: string;
    runId: string;
    actorType: RunEvent["actorType"];
    actorId: string;
    visibility?: RunEvent["visibility"];
    data?: Record<string, unknown>;
    userId?: number;
  },
): RunEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: type,
    tenantId: params.tenantId,
    teamId: params.teamId,
    roomId: params.roomId,
    runId: params.runId,
    ts: new Date().toISOString(),
    actorType: params.actorType,
    actorId: params.actorId,
    visibility: params.visibility ?? "transparent",
    data: params.data ?? {},
    userId: params.userId,
  };
}
