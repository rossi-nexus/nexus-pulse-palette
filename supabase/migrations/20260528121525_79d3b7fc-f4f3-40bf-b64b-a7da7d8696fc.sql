-- Area 1: drop ambiguous 6-arg overloads
DROP FUNCTION IF EXISTS public.fn_approve_and_verify(uuid, jsonb, timestamptz, text, text, uuid);
DROP FUNCTION IF EXISTS public.fn_verify_actor(uuid, jsonb, timestamptz, text, text, uuid);

-- Area 5 Part D: backfill descriptions + tag evidence from originating personal actor
CREATE OR REPLACE FUNCTION public.fn_backfill_actor_descriptions_from_personal()
RETURNS TABLE(actor_id uuid, legal_name text, descriptions_added int, tags_updated int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor RECORD;
  v_personal RECORD;
  v_section TEXT;
  v_item JSONB;
  v_desc_added INT;
  v_tags_updated INT;
  v_desc_type TEXT;
  v_entry_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  FOR v_actor IN
    SELECT a.id, a.legal_name
      FROM public.actors a
      WHERE NOT EXISTS (
        SELECT 1 FROM public.actor_descriptions d
        WHERE d.actor_id = a.id AND d.type <> 'summary'
      )
  LOOP
    v_desc_added := 0;
    v_tags_updated := 0;

    SELECT pa.analysis_data, pa.user_id
      INTO v_personal
      FROM public.user_personal_actors pa
      WHERE pa.merged_actor_id = v_actor.id
        AND pa.analysis_data IS NOT NULL
        AND pa.analysis_data <> '{}'::jsonb
      ORDER BY pa.created_at DESC
      LIMIT 1;

    CONTINUE WHEN v_personal IS NULL;

    FOR v_section, v_desc_type IN
      SELECT * FROM (VALUES
        ('capabilities', 'capability'),
        ('competences', 'competence'),
        ('domains', 'domain'),
        ('products', 'product'),
        ('services', 'service')
      ) AS t(section, desc_type)
    LOOP
      IF jsonb_typeof(v_personal.analysis_data->v_section) <> 'array' THEN CONTINUE; END IF;

      FOR v_item IN SELECT * FROM jsonb_array_elements(v_personal.analysis_data->v_section)
      LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;

        -- description row
        IF v_item ? 'description' AND length(coalesce(v_item->>'description','')) > 0 THEN
          INSERT INTO public.actor_descriptions(actor_id, type, content, source, verified_at, verifier_id)
          VALUES (
            v_actor.id,
            v_desc_type,
            (v_item->>'entry_name') || ': ' || (v_item->>'description'),
            coalesce(v_item->>'source','backfill'),
            now(),
            v_personal.user_id
          );
          v_desc_added := v_desc_added + 1;
        END IF;

        -- enrich tag evidence/source_url if missing
        SELECT oe.id INTO v_entry_id
          FROM public.ontology_entries oe
          WHERE lower(oe.raw_name) = lower(coalesce(v_item->>'entry_name',''))
          LIMIT 1;

        IF v_entry_id IS NOT NULL THEN
          UPDATE public.actor_ontology_tags
            SET evidence = coalesce(evidence, v_item->>'evidence'),
                source_url = coalesce(source_url, v_item->>'source_url'),
                confidence = coalesce(confidence, v_item->>'confidence')
            WHERE actor_id = v_actor.id
              AND ontology_entry_id = v_entry_id
              AND (evidence IS NULL OR source_url IS NULL OR confidence IS NULL);
          IF FOUND THEN v_tags_updated := v_tags_updated + 1; END IF;
        END IF;
      END LOOP;
    END LOOP;

    IF v_desc_added > 0 OR v_tags_updated > 0 THEN
      actor_id := v_actor.id;
      legal_name := v_actor.legal_name;
      descriptions_added := v_desc_added;
      tags_updated := v_tags_updated;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_backfill_actor_descriptions_from_personal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_backfill_actor_descriptions_from_personal() TO authenticated;