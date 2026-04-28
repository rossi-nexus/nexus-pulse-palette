-- ============================================================
-- Phase 6.5.3a: Verification Lifecycle Data Substrate
-- ============================================================

-- Step 1: actors columns
ALTER TABLE public.actors
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verifier_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN decays_at timestamptz,
  ADD COLUMN verifier_confidence text CHECK (verifier_confidence IS NULL OR verifier_confidence IN ('high','medium','low'));

CREATE INDEX idx_actors_verified_at ON public.actors(verified_at) WHERE verified_at IS NOT NULL;
CREATE INDEX idx_actors_decays_at ON public.actors(decays_at) WHERE decays_at IS NOT NULL;

-- Backfill actors
UPDATE public.actors
  SET verified_at = updated_at
  WHERE verification_status IN ('verified','admin_verified')
    AND verified_at IS NULL;

-- Step 2: satellite tables (six)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'actor_certifications',
    'actor_standards',
    'actor_customer_history',
    'actor_contacts',
    'actor_descriptions',
    'actor_capacity_attributes'
  ] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN verified_at timestamptz,
        ADD COLUMN verifier_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
        ADD COLUMN decays_at timestamptz,
        ADD COLUMN verifier_confidence text CHECK (verifier_confidence IS NULL OR verifier_confidence IN ('high','medium','low'));
    $f$, t);
    EXECUTE format('CREATE INDEX idx_%I_verified_at ON public.%I(verified_at) WHERE verified_at IS NOT NULL;', t, t);
    EXECUTE format('CREATE INDEX idx_%I_decays_at ON public.%I(decays_at) WHERE decays_at IS NOT NULL;', t, t);
  END LOOP;
END $$;

-- Satellite backfill: leave NULL (per-field verification flow lands in 6.5.5b;
-- inheriting the parent actor's updated_at would falsely imply each fact was
-- individually verified at that moment).

-- Step 3: advance trigger
CREATE OR REPLACE FUNCTION public.fn_actors_advance_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
    IF NEW.verification_status = 'unverified' THEN
      NEW.verification_status := 'verified';
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER actors_advance_verification_status
  BEFORE UPDATE OF verified_at ON public.actors
  FOR EACH ROW EXECUTE FUNCTION public.fn_actors_advance_verification_status();

-- Step 4: fn_check_decay helper
CREATE OR REPLACE FUNCTION public.fn_check_decay(_within interval DEFAULT interval '30 days')
RETURNS TABLE (
  actor_id uuid,
  actor_name text,
  verified_at timestamptz,
  decays_at timestamptz,
  state text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $func$
  SELECT
    a.id,
    a.legal_name,
    a.verified_at,
    a.decays_at,
    CASE
      WHEN a.decays_at <= now() THEN 'expired'
      WHEN a.decays_at <= now() + _within THEN 'decay_warning'
    END AS state
  FROM public.actors a
  WHERE a.verified_at IS NOT NULL
    AND a.decays_at IS NOT NULL
    AND a.decays_at <= now() + _within
  ORDER BY a.decays_at ASC;
$func$;

GRANT EXECUTE ON FUNCTION public.fn_check_decay(interval) TO authenticated;

-- Step 5: rename leftover actor_classifications_* constraints on actor_certifications
ALTER TABLE public.actor_certifications
  RENAME CONSTRAINT actor_classifications_actor_id_fkey TO actor_certifications_actor_id_fkey;

ALTER TABLE public.actor_certifications
  RENAME CONSTRAINT actor_classifications_classification_system_check TO actor_certifications_classification_system_check;

ALTER TABLE public.actor_certifications
  RENAME CONSTRAINT actor_classifications_level_normalized_check TO actor_certifications_level_normalized_check;

ALTER TABLE public.actor_certifications
  RENAME CONSTRAINT actor_classifications_pkey TO actor_certifications_pkey;

-- Step 6: lowercase confidence CHECK
-- Normalize existing data first (count was 0 at audit time, but idempotent).
UPDATE public.actor_certifications
  SET confidence = lower(confidence)
  WHERE confidence IS NOT NULL AND confidence != lower(confidence);

ALTER TABLE public.actor_certifications
  DROP CONSTRAINT actor_classifications_confidence_check;

ALTER TABLE public.actor_certifications
  ADD CONSTRAINT actor_certifications_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('high','medium','low'));
