
DO $$
DECLARE
  v_id_a uuid;
  v_id_b uuid;
  v_status_a text;
  v_status_b text;
  v_30d_rows int;
  v_180d_rows int;
  v_30d_detail text;
  v_180d_detail text;
BEGIN
  -- Section 2: trigger empirical
  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('__verify48_trigger_a', 'manual', 'unverified')
  RETURNING id INTO v_id_a;

  UPDATE public.actors SET verified_at = now() WHERE id = v_id_a;
  SELECT verification_status INTO v_status_a FROM public.actors WHERE id = v_id_a;

  INSERT INTO public.actors (legal_name, source, verification_status)
  VALUES ('__verify48_trigger_b', 'manual', 'admin_verified')
  RETURNING id INTO v_id_b;

  UPDATE public.actors SET verified_at = now() WHERE id = v_id_b;
  SELECT verification_status INTO v_status_b FROM public.actors WHERE id = v_id_b;

  RAISE NOTICE 'TRIGGER actor_a status after verified_at update: % (expected: verified)', v_status_a;
  RAISE NOTICE 'TRIGGER actor_b status after verified_at update: % (expected: admin_verified)', v_status_b;

  DELETE FROM public.actors WHERE id IN (v_id_a, v_id_b);

  -- Section 3: fn_check_decay empirical
  INSERT INTO public.actors (legal_name, source, verification_status, verified_at, decays_at) VALUES
    ('__verify48_decay_a', 'manual', 'verified', now(), NULL),
    ('__verify48_decay_b', 'manual', 'verified', now(), now() + interval '90 days'),
    ('__verify48_decay_c', 'manual', 'verified', now(), now() + interval '15 days'),
    ('__verify48_decay_d', 'manual', 'verified', now() - interval '60 days', now() - interval '5 days');

  SELECT count(*), string_agg(actor_name || '=' || state, ', ' ORDER BY actor_name)
    INTO v_30d_rows, v_30d_detail
    FROM public.fn_check_decay();

  SELECT count(*), string_agg(actor_name || '=' || state, ', ' ORDER BY actor_name)
    INTO v_180d_rows, v_180d_detail
    FROM public.fn_check_decay(interval '180 days');

  RAISE NOTICE 'DECAY 30d window: % rows -> %', v_30d_rows, v_30d_detail;
  RAISE NOTICE 'DECAY 180d window: % rows -> %', v_180d_rows, v_180d_detail;

  DELETE FROM public.actors WHERE legal_name LIKE '\_\_verify48\_decay\_%' ESCAPE '\';

  -- Final residue check
  IF EXISTS (SELECT 1 FROM public.actors WHERE legal_name LIKE '\_\_verify48%' ESCAPE '\') THEN
    RAISE EXCEPTION 'CLEANUP FAILED: test rows remain';
  END IF;

  RAISE NOTICE 'CLEANUP: all verify48 test rows removed';
END$$;
