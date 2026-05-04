-- Phase 6.5.5b: verification workspace + verification_events table

-- 1. verification_events table
CREATE TABLE public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  verifier_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  programme_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL,
  source_queue_id uuid REFERENCES public.actor_validation_queue(id) ON DELETE SET NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('in_progress','complete','rejected')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  decays_at timestamptz,
  verifier_confidence text CHECK (verifier_confidence IS NULL OR verifier_confidence IN ('high','medium','low')),
  verifier_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_verification_events_actor_created
  ON public.verification_events(actor_id, created_at DESC);
CREATE INDEX idx_verification_events_programme_created
  ON public.verification_events(programme_id, created_at DESC) WHERE programme_id IS NOT NULL;
CREATE INDEX idx_verification_events_verifier
  ON public.verification_events(verifier_id) WHERE verifier_id IS NOT NULL;
CREATE INDEX idx_verification_events_status
  ON public.verification_events(verification_status);

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;

-- RLS: read-only for authorized parties; writes only via SECURITY DEFINER RPCs.
CREATE POLICY "Programme members read verification events"
  ON public.verification_events FOR SELECT
  USING (
    programme_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = verification_events.programme_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Verifiers read own events"
  ON public.verification_events FOR SELECT
  USING (verifier_id = auth.uid());

CREATE POLICY "Admins read all verification events"
  ON public.verification_events FOR SELECT
  USING (public.is_admin(auth.uid()));

-- 2. Audit log trigger on verification_events
CREATE TRIGGER verification_events_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3. Extend fn_audit_log_trigger to recognise the new table.
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_target_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object('old', v_old);
    v_target_id := (v_old->>'id')::uuid;
  ELSE
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
    v_target_id := (v_new->>'id')::uuid;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'actors' THEN
      v_actor_id := v_target_id;
    ELSIF TG_TABLE_NAME IN ('actor_certifications','actor_standards','actor_customer_history',
                            'actor_contacts','actor_descriptions','actor_capacity_attributes') THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'programmes' THEN
      v_programme_id := v_target_id;
    ELSIF TG_TABLE_NAME = 'programme_members' THEN
      v_programme_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id', NULL)::uuid;
    ELSIF TG_TABLE_NAME = 'verification_events' THEN
      v_actor_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'actor_id', NULL)::uuid;
      v_programme_id := COALESCE((CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END)->>'programme_id', NULL)::uuid;
    END IF;
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
$function$;

-- 4. fn_verify_actor: re-verification for existing actors
CREATE OR REPLACE FUNCTION public.fn_verify_actor(
  p_actor_id uuid,
  p_evidence jsonb,
  p_decays_at timestamptz,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_event_id uuid;
  v_caller_can_verify boolean;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_verify;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_verify;
  END IF;

  IF NOT v_caller_can_verify THEN
    RAISE EXCEPTION 'verification_permission_denied'
      USING HINT = 'Caller is not a programme owner/consultant or admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.actors WHERE id = p_actor_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING HINT = 'Invalid actor id.';
  END IF;

  INSERT INTO public.verification_events (
    actor_id, verifier_id, programme_id, verification_status,
    evidence, decays_at, verifier_confidence, verifier_notes, completed_at
  ) VALUES (
    p_actor_id, auth.uid(), p_programme_id, 'complete',
    COALESCE(p_evidence, '[]'::jsonb), p_decays_at, p_confidence, p_notes, now()
  ) RETURNING id INTO v_event_id;

  UPDATE public.actors
  SET verified_at = now(),
      verifier_id = auth.uid(),
      decays_at = p_decays_at,
      verifier_confidence = p_confidence
  WHERE id = p_actor_id;

  PERFORM public.fn_audit_log_event(
    'verify',
    'actors',
    p_actor_id,
    p_actor_id,
    p_programme_id,
    jsonb_build_object('event_id', v_event_id, 'decays_at', p_decays_at, 'confidence', p_confidence),
    p_notes
  );

  RETURN v_event_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_verify_actor(uuid, jsonb, timestamptz, text, text, uuid) TO authenticated;

-- 5. fn_approve_and_verify: atomic suggestion approval + verification
CREATE OR REPLACE FUNCTION public.fn_approve_and_verify(
  p_queue_id uuid,
  p_evidence jsonb,
  p_decays_at timestamptz,
  p_confidence text,
  p_notes text,
  p_programme_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_personal_actor_id uuid;
  v_personal_actor record;
  v_actor_id uuid;
  v_event_id uuid;
  v_caller_can_verify boolean;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_verify;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_verify;
  END IF;

  IF NOT v_caller_can_verify THEN
    RAISE EXCEPTION 'verification_permission_denied'
      USING HINT = 'Caller is not a programme owner/consultant or admin.';
  END IF;

  SELECT user_personal_actor_id INTO v_personal_actor_id
  FROM public.actor_validation_queue WHERE id = p_queue_id;

  IF v_personal_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue_row_not_found' USING HINT = 'Invalid queue id.';
  END IF;

  SELECT * INTO v_personal_actor
  FROM public.user_personal_actors
  WHERE id = v_personal_actor_id;

  v_actor_id := v_personal_actor.matched_main_db_actor_id;
  IF v_actor_id IS NULL THEN
    INSERT INTO public.actors (
      legal_name, country, org_number, source, verification_status, trade_names,
      street_address, city, region, websites
    ) VALUES (
      v_personal_actor.actor_name,
      v_personal_actor.country,
      v_personal_actor.org_number,
      'consultant_approval',
      'verified',
      COALESCE(v_personal_actor.trade_names, '{}'::text[]),
      v_personal_actor.street_address,
      v_personal_actor.city,
      v_personal_actor.region,
      CASE WHEN v_personal_actor.actor_website IS NOT NULL
           THEN ARRAY[v_personal_actor.actor_website]
           ELSE '{}'::text[] END
    ) RETURNING id INTO v_actor_id;
  END IF;

  INSERT INTO public.verification_events (
    actor_id, verifier_id, programme_id, source_queue_id, verification_status,
    evidence, decays_at, verifier_confidence, verifier_notes, completed_at
  ) VALUES (
    v_actor_id, auth.uid(), p_programme_id, p_queue_id, 'complete',
    COALESCE(p_evidence, '[]'::jsonb), p_decays_at, p_confidence, p_notes, now()
  ) RETURNING id INTO v_event_id;

  UPDATE public.actors
  SET verified_at = now(),
      verifier_id = auth.uid(),
      decays_at = p_decays_at,
      verifier_confidence = p_confidence,
      verification_status = 'verified'
  WHERE id = v_actor_id;

  UPDATE public.actor_validation_queue
  SET status = 'merged',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_queue_id;

  UPDATE public.user_personal_actors
  SET status = 'merged',
      matched_main_db_actor_id = v_actor_id,
      match_timestamp = now()
  WHERE id = v_personal_actor_id;

  PERFORM public.fn_audit_log_event(
    'approve_and_verify',
    'actor_validation_queue',
    p_queue_id,
    v_actor_id,
    p_programme_id,
    jsonb_build_object(
      'event_id', v_event_id,
      'actor_id', v_actor_id,
      'personal_actor_id', v_personal_actor_id,
      'decays_at', p_decays_at,
      'confidence', p_confidence
    ),
    p_notes
  );

  RETURN jsonb_build_object('actor_id', v_actor_id, 'event_id', v_event_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_approve_and_verify(uuid, jsonb, timestamptz, text, text, uuid) TO authenticated;

-- 6. fn_reject_suggestion
CREATE OR REPLACE FUNCTION public.fn_reject_suggestion(
  p_queue_id uuid,
  p_reason text DEFAULT NULL,
  p_programme_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_personal_actor_id uuid;
  v_caller_can_act boolean;
BEGIN
  IF p_programme_id IS NULL THEN
    SELECT public.is_admin(auth.uid()) INTO v_caller_can_act;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.programme_members pm
      WHERE pm.programme_id = p_programme_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','consultant')
    ) OR public.is_admin(auth.uid()) INTO v_caller_can_act;
  END IF;

  IF NOT v_caller_can_act THEN
    RAISE EXCEPTION 'rejection_permission_denied';
  END IF;

  SELECT user_personal_actor_id INTO v_personal_actor_id
  FROM public.actor_validation_queue WHERE id = p_queue_id;

  IF v_personal_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue_row_not_found';
  END IF;

  UPDATE public.actor_validation_queue
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = COALESCE(p_reason, admin_notes)
  WHERE id = p_queue_id;

  UPDATE public.user_personal_actors
  SET status = 'rejected'
  WHERE id = v_personal_actor_id;

  PERFORM public.fn_audit_log_event(
    'reject_suggestion',
    'actor_validation_queue',
    p_queue_id,
    NULL,
    p_programme_id,
    jsonb_build_object('personal_actor_id', v_personal_actor_id),
    p_reason
  );

  RETURN p_queue_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_reject_suggestion(uuid, text, uuid) TO authenticated;