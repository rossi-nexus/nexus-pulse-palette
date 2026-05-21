CREATE OR REPLACE FUNCTION public.fn_admin_dashboard_summary()
RETURNS TABLE (
  actor_total int,
  actor_verified int,
  actor_unverified int,
  decay_expired int,
  decay_due_30d int,
  verification_events_7d int,
  verification_events_30d int,
  validation_queue_by_status jsonb,
  ontology_active int,
  ontology_proposed int,
  ontology_archived int,
  ontology_decisions_7d int,
  ontology_decisions_30d int,
  programme_total int,
  user_total int,
  user_admin int,
  attribute_holders_by_kv jsonb,
  audit_events_7d int,
  audit_events_30d int,
  audit_top_event_types_7d jsonb,
  registry_imports_by_action_30d jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM public.actors),
    (SELECT count(*)::int FROM public.actors WHERE verified_at IS NOT NULL),
    (SELECT count(*)::int FROM public.actors WHERE verified_at IS NULL),
    (SELECT count(*)::int FROM public.actors WHERE decays_at IS NOT NULL AND decays_at < now()),
    (SELECT count(*)::int FROM public.actors WHERE decays_at IS NOT NULL AND decays_at BETWEEN now() AND now() + interval '30 days'),
    (SELECT count(*)::int FROM public.verification_events WHERE created_at > now() - interval '7 days'),
    (SELECT count(*)::int FROM public.verification_events WHERE created_at > now() - interval '30 days'),
    (SELECT coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
       FROM (SELECT status, count(*)::int AS c FROM public.actor_validation_queue GROUP BY status) q),
    (SELECT count(*)::int FROM public.ontology_entries WHERE status = 'active'),
    (SELECT count(*)::int FROM public.ontology_entries WHERE status = 'proposed'),
    (SELECT count(*)::int FROM public.ontology_entries WHERE status = 'archived'),
    (SELECT count(*)::int FROM public.audit_log
       WHERE event_type IN ('ontology_admin_decision','ontology_proposal_decision')
       AND created_at > now() - interval '7 days'),
    (SELECT count(*)::int FROM public.audit_log
       WHERE event_type IN ('ontology_admin_decision','ontology_proposal_decision')
       AND created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM public.programmes),
    (SELECT count(*)::int FROM public.users),
    (SELECT count(*)::int FROM public.users WHERE role = 'admin'),
    (SELECT coalesce(jsonb_object_agg(kv_label, c), '{}'::jsonb)
       FROM (
         SELECT key || '=' || coalesce(value, '') AS kv_label, count(*)::int AS c
           FROM public.user_attributes
          WHERE (expires_at IS NULL OR expires_at > now())
          GROUP BY kv_label
       ) u),
    (SELECT count(*)::int FROM public.audit_log WHERE created_at > now() - interval '7 days'),
    (SELECT count(*)::int FROM public.audit_log WHERE created_at > now() - interval '30 days'),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('event_type', event_type, 'count', c) ORDER BY c DESC), '[]'::jsonb)
       FROM (
         SELECT event_type, count(*)::int AS c
           FROM public.audit_log
          WHERE created_at > now() - interval '7 days'
          GROUP BY event_type
          ORDER BY c DESC
          LIMIT 5
       ) t),
    (SELECT coalesce(jsonb_object_agg(action_label, c), '{}'::jsonb)
       FROM (
         SELECT coalesce(changes->>'action','unknown') AS action_label, count(*)::int AS c
           FROM public.audit_log
          WHERE event_type = 'import_actor_from_registry'
            AND created_at > now() - interval '30 days'
          GROUP BY action_label
       ) r);
END;
$func$;

REVOKE ALL ON FUNCTION public.fn_admin_dashboard_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_admin_dashboard_summary() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON public.audit_log (created_at DESC);