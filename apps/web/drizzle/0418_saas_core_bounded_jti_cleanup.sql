CREATE ROLE modular_core_jti_cleanup_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
COMMENT ON ROLE modular_core_jti_cleanup_owner IS 'smartaihub:session-jti-cleanup-owner:v1';
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA public TO modular_core_jti_cleanup_owner;
--> statement-breakpoint
GRANT SELECT, DELETE ON TABLE public.revoked_token_jtis TO modular_core_jti_cleanup_owner;
--> statement-breakpoint
CREATE FUNCTION public.cleanup_expired_session_jtis(p_batch_size integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_deleted_count integer;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 500 THEN
    RAISE EXCEPTION 'JTI_CLEANUP_BATCH_SIZE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('smartaihub:session-jti-cleanup:v1', 0)
  ) THEN
    RETURN 0;
  END IF;

  WITH expired AS MATERIALIZED (
    SELECT jti_hash
    FROM public.revoked_token_jtis
    WHERE expires_at IS NOT NULL
      AND expires_at <= statement_timestamp()
    ORDER BY expires_at, jti_hash
    LIMIT p_batch_size
  )
  DELETE FROM public.revoked_token_jtis AS revoked
  USING expired
  WHERE revoked.jti_hash = expired.jti_hash;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$function$;
--> statement-breakpoint
ALTER FUNCTION public.cleanup_expired_session_jtis(integer) OWNER TO modular_core_jti_cleanup_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM modular_core_jti_cleanup_owner;
--> statement-breakpoint
COMMENT ON FUNCTION public.cleanup_expired_session_jtis(integer) IS 'smartaihub:session-jti-cleanup:v1';
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cleanup_expired_session_jtis(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cleanup_expired_session_jtis(integer) TO modular_core_auth_dev;
