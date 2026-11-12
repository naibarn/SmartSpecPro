-- Expose only the details of messages already authorized by the scoped reader.
CREATE OR REPLACE FUNCTION public.list_modular_chat_message_details(
  p_user_id integer, p_environment_tenant_id varchar, p_workspace_id varchar, p_conversation_id integer
)
RETURNS TABLE (
  message_id integer, role text, content text, created_at timestamptz, model_used varchar,
  input_tokens integer, output_tokens integer, credits_used numeric, execution_source text
)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT scoped.message_id, scoped.role, scoped.content, scoped.created_at, scoped.model_used,
    CASE WHEN job.id IS NOT NULL THEN NULLIF(job."outputJson"->>'promptTokens', '')::integer ELSE message."inputTokens" END,
    CASE WHEN job.id IS NOT NULL THEN NULLIF(job."outputJson"->>'completionTokens', '')::integer ELSE message."outputTokens" END,
    CASE WHEN job.id IS NOT NULL THEN CASE WHEN hold.state = 'settled' THEN hold.settled_credits::numeric ELSE NULL::numeric END ELSE message."creditsUsed" END,
    CASE
      WHEN job.id IS NOT NULL THEN 'cloud'
      WHEN message."runtimeMetadata"->>'source' = 'hybrid' AND
        (message."runtimeMetadata"->>'provider' = 'openai_compatible_local' OR jsonb_typeof(message."runtimeMetadata"->'profileId') = 'string') THEN 'local'
      WHEN message."runtimeMetadata"->>'source' = 'hybrid' THEN 'hybrid'
      WHEN message."runtimeMetadata"->>'source' = 'cloud' THEN 'cloud'
      ELSE NULL
    END
  FROM public.list_modular_chat_messages(p_user_id, p_environment_tenant_id, p_workspace_id, p_conversation_id) AS scoped
  JOIN public.messages AS message ON message.id = scoped.message_id
  LEFT JOIN LATERAL (
    SELECT candidate.id, candidate."outputJson" FROM public.worker_jobs AS candidate
    WHERE scoped.role = 'assistant' AND candidate."jobType" = 'modular_chat.turn'
      AND candidate.status = 'succeeded' AND candidate.environment_tenant_id = p_environment_tenant_id
      AND candidate.chat_workspace_id = p_workspace_id AND candidate."requestedByUserId" = p_user_id
      AND candidate."outputJson"->>'assistantMessageId' = scoped.message_id::text
    ORDER BY candidate."finishedAt" DESC LIMIT 1
  ) AS job ON true
  LEFT JOIN public.modular_chat_credit_holds AS hold ON hold.job_id = job.id
  ORDER BY scoped.created_at, scoped.message_id;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_modular_chat_message_details(integer, varchar, varchar, integer) FROM PUBLIC;
--> statement-breakpoint
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_dev') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_message_details(integer, varchar, varchar, integer) TO modular_core_auth_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'modular_core_auth_prod') THEN
    GRANT EXECUTE ON FUNCTION public.list_modular_chat_message_details(integer, varchar, varchar, integer) TO modular_core_auth_prod;
  END IF;
END $grants$;
