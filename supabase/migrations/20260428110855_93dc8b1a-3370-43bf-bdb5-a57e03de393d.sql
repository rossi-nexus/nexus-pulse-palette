-- ============================================================================
-- Phase 6.5.4: Audit Logging Substrate
-- ============================================================================

-- Step 1: audit_log table + indexes
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  target_table text NOT NULL,
  target_record_id uuid,
  actor_id uuid REFERENCES public.actors(id) ON DELETE SET NULL,
  programme_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changes jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_target ON public.audit_log(target_table, target_record_id);
CREATE INDEX idx_audit_log_programme_created ON public.audit_log(programme_id, created_at DESC) WHERE programme_id IS NOT NULL;
CREATE INDEX idx_audit_log_actor_created ON public.audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_user_created ON public.audit_log(actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type ON public.audit_log(event_type);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Step 2: RLS on audit_log (SELECT-only; append-only enforced by absence of other policies)
CREATE POLICY "Programme members read programme events"
  ON public.audit_log FOR SELECT
  USING (
    programme_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = audit_log.programme_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Verifiers read events on actors they verified"
  ON public.audit_log FOR SELECT
  USING (
    actor_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.actors a
      WHERE a.id = audit_log.actor_id
        AND a.verifier_id = auth.uid()
    )
  );

CREATE POLICY "Admins read all audit events"
  ON public.audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Step 3: SECURITY DEFINER helper for RPCs
CREATE OR REPLACE FUNCTION public.fn_audit_log_event(
  p_event_type text,
  p_target_table text,
  p_target_record_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_programme_id uuid DEFAULT NULL,
  p_changes jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    event_type, target_table, target_record_id,
    actor_id, programme_id, actor_user_id,
    changes, reason
  )
  VALUES (
    p_event_type, p_target_table, p_target_record_id,
    p_actor_id, p_programme_id, auth.uid(),
    p_changes, p_reason
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_log_event(text, text, uuid, uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_log_event(text, text, uuid, uuid, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_log_event(text, text, uuid, uuid, uuid, jsonb, text) TO authenticated;

-- Step 4: trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_key text;
  v_actor_id uuid;
  v_programme_id uuid;
  v_target_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_changes := jsonb_build_object('new', v_new);
    v_target_id := (NEW).id;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object('old', v_old);
    v_target_id := (OLD).id;
  ELSE  -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changes := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_old) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key)
        );
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;
    v_target_id := (NEW).id;
  END IF;

  IF TG_TABLE_NAME = 'actors' THEN
    v_actor_id := v_target_id;
  ELSIF TG_TABLE_NAME IN ('actor_certifications', 'actor_standards', 'actor_customer_history',
                          'actor_contacts', 'actor_descriptions', 'actor_capacity_attributes') THEN
    v_actor_id := COALESCE(
      (CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id',
      NULL
    )::uuid;
  ELSIF TG_TABLE_NAME = 'programmes' THEN
    v_programme_id := v_target_id;
  ELSIF TG_TABLE_NAME = 'programme_members' THEN
    v_programme_id := COALESCE(
      (CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id',
      NULL
    )::uuid;
  END IF;

  PERFORM public.fn_audit_log_event(
    'mutation',
    TG_TABLE_NAME,
    v_target_id,
    v_actor_id,
    v_programme_id,
    v_changes,
    NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$func$;

-- Step 5: Attach triggers to 9 tables
CREATE TRIGGER actors_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actors
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_certifications_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_certifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_standards_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_standards
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_customer_history_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_customer_history
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_contacts_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_descriptions_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER actor_capacity_attributes_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.actor_capacity_attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER programmes_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER programme_members_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.programme_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- Step 6: Modify fn_suggest_actor to write inline audit log
CREATE OR REPLACE FUNCTION public.fn_suggest_actor(p_personal_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id uuid;
  v_actor_owner uuid;
  v_actor_status text;
BEGIN
  SELECT user_id, status
  INTO v_actor_owner, v_actor_status
  FROM public.user_personal_actors
  WHERE id = p_personal_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_not_found_or_not_owned'
      USING HINT = 'The personal actor does not exist or you do not have access.';
  END IF;

  IF v_actor_status = 'suggested' THEN
    RAISE EXCEPTION 'actor_already_suggested'
      USING HINT = 'This actor has already been suggested for the main database.';
  END IF;

  IF v_actor_status = 'merged' THEN
    RAISE EXCEPTION 'actor_already_merged'
      USING HINT = 'This actor has already been merged into the main database.';
  END IF;

  UPDATE public.user_personal_actors
  SET status = 'suggested',
      suggested_at = now()
  WHERE id = p_personal_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_update_failed'
      USING HINT = 'The status update did not affect any row. Check RLS policy.';
  END IF;

  INSERT INTO public.actor_validation_queue (
    user_personal_actor_id,
    suggested_by,
    status
  )
  VALUES (
    p_personal_actor_id,
    auth.uid(),
    'pending'
  )
  RETURNING id INTO v_queue_id;

  -- Phase 6.5.4: inline audit log entry. Placed AFTER queue insert so a queue
  -- failure cannot leave an orphan audit row pointing at a non-existent queue id.
  PERFORM public.fn_audit_log_event(
    'suggest',
    'user_personal_actors',
    p_personal_actor_id,
    NULL,
    NULL,
    jsonb_build_object('queue_id', v_queue_id, 'status_to', 'suggested'),
    NULL
  );

  RETURN v_queue_id;
END;
$function$;