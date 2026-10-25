/**
 * Node-side job types that are executed by the PostgreSQL-pull worker.
 *
 * Keep this list server-owned. A job payload may describe data, but it must
 * never be allowed to select an executor or transport at runtime.
 */
export const POSTGRES_NODE_JOB_TYPES = new Set([
  "webhook.dispatch",
  "emergency.report.intake",
  "emergency.evidence.retention",
  "webhook.api_delivery",
  "embedding.generate",
  "llm.inference_settlement_reconcile",
  "llm.inference_settlement_sweep",
  "capacity.assessment",
  "geo.source.refresh",
  "intelligence.research.execute",
  "research_notes.summarize",
  "mini_app_factory.stage",
  "mini_app_factory.run_anchor",
  "spec224.verification.full",
  "developer.fast_lane",
  "channel.delivery",
  "channel.webhook_ingest",
  "automation.execute",
  "auto-team.recovery.scan",
  "auto-team.recovery.evaluate",
  "workspace.authority.audit",
  "database.backup",
  "database.backup.maintenance",
  "worker.heartbeat_retention",
  "spec224.runner_input_retention",
  "library.trash_purge",
  "library.rag_projection_sync",
  "storyboard.skill.run",
  "skill.execute",
  "scheduled.skill.execute",
  "notification.escalation",
  "notification.digest",
  "notification.retention",
  "notification.webhook_delivery",
  "gdrive.edit_session_cleanup",
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
  "media.deferred_retry",
  "video.intelligence",
  "video.composition_scan",
  "content_protection.verify",
  "computer_use.browser",
  // Staging deployment authority is still enforced by the registered
  // executor's exact owner grant, target, artifact and rollback checks.
  "cloudflare.staging.deploy",
  // Production Queue preparation is a narrowly scoped, canonical provider
  // operation. Its executor revalidates the exact saved target and job lease;
  // it cannot bind a Worker or change traffic.
  "cloudflare.production.queue.provision",
  // Feature 195 is the sole durable execution authority for the
  // provider-neutral external-agent handoff. Provider selection remains in
  // the governed job manifest; it must not create a second queue or worker.
  "external_agent_task",
]);

export function isPostgresNodeJobType(jobType: string): boolean {
  return POSTGRES_NODE_JOB_TYPES.has(jobType);
}
