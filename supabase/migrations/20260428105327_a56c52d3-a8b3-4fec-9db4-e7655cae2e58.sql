
DROP FUNCTION IF EXISTS public.__verify48_results();
CREATE OR REPLACE FUNCTION public.__verify48_results()
RETURNS TABLE(test_name text, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_a uuid;
  v_id_b uuid;
  v_status_a text;
  v_status_b text;
  v_30d_detail text;
  v_180d_detail text;
  v_30d_count int;
  v_180d_count int;
BEGIN
  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('__verify48_trigger_a', 'manual', 'unverified') RETURNING id INTO v_id_a;
  UPDATE public.actors SET verified_at = now() WHERE id = v_id_a;
  SELECT verification_status INTO v_status_a FROM public.actors WHERE id = v_id_a;

  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('__verify48_trigger_b', 'manual', 'admin_verified') RETURNING id INTO v_id_b;
  UPDATE public.actors SET verified_at = now() WHERE id = v_id_b;
  SELECT verification_status INTO v_status_b FROM public.actors WHERE id = v_id_b;

  DELETE FROM public.actors WHERE id IN (v_id_a, v_id_b);

  INSERT INTO public.actors (legal_name, source, verification_status, verified_at, decays_at) VALUES
    ('__verify48_decay_a', 'manual', 'verified', now(), NULL),
    ('__verify48_decay_b', 'manual', 'verified', now(), now() + interval '90 days'),
    ('__verify48_decay_c', 'manual', 'verified', now(), now() + interval '15 days'),
    ('__verify48_decay_d', 'manual', 'verified', now() - interval '60 days', now() - interval '5 days');

  SELECT count(*)::int, COALESCE(string_agg(actor_name || '=' || state, ', ' ORDER BY actor_name), '<none>')
    INTO v_30d_count, v_30d_detail FROM public.fn_check_decay();

  SELECT count(*)::int, COALESCE(string_agg(actor_name || '=' || state, ', ' ORDER BY actor_name), '<none>')
    INTO v_180d_count, v_180d_detail FROM public.fn_check_decay(interval '180 days');

  DELETE FROM public.actors WHERE legal_name LIKE '\_\_verify48\_decay\_%' ESCAPE '\';

  RETURN QUERY VALUES
    ('trigger_a (was unverified)', v_status_a),
    ('trigger_b (was admin_verified)', v_status_b),
    ('decay_30d_count', v_30d_count::text),
    ('decay_30d_detail', v_30d_detail),
    ('decay_180d_count', v_180d_count::text),
    ('decay_180d_detail', v_180d_detail),
    ('cleanup_residue',
      (SELECT count(*)::text FROM public.actors WHERE legal_name LIKE '\_\_verify48%' ESCAPE '\'));
END$$;
