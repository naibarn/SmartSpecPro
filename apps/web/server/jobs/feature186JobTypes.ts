/**
 * Node-side job types that are executed by the PostgreSQL-pull worker.
 *
 * Keep this list server-owned. A job payload may describe data, but it must
 * never be allowed to select an executor or transport at runtime.
 */
export const POSTGRES_NODE_JOB_TYPES = new Set([
  "webhook.dispatch",
  "webhook.api_delivery",
  "embedding.generate",
  "capacity.assessment",
  "channel.delivery",
  "automation.execute",
  "database.backup",
  "database.backup.maintenance",
  "worker.heartbeat_retention",
  "library.trash_purge",
  "storyboard.skill.run",
  "skill.execute",
  "scheduled.skill.execute",
  "notification.escalation",
  "notification.digest",
  "notification.retention",
  "notification.webhook_delivery",
  "memory.archive_cleanup",
  "memory.chunk_cleanup",
  "memory.embedding_reconciliation",
  "memory.eviction",
  "vertical_drama.character_prompt",
  "vertical_drama.draft_composition",
  "vertical_drama.draft_quality_qc",
  "vertical_drama.episode_stage",
  "vertical_drama.interactive",
  "vertical_drama.shot_prompt",
  "vertical_drama.shot_video_prompt",
  "vertical_drama.story",
  "video.intelligence",
  "video.composition_scan",
  "content_protection.verify",
]);

export function isPostgresNodeJobType(jobType: string): boolean {
  return POSTGRES_NODE_JOB_TYPES.has(jobType);
}
