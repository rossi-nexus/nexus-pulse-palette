/**
 * Canonical DbActor row type — mirrors public.actors (the verified main DB).
 *
 * Distinct from PersonalActor (which mirrors user_personal_actors). DbActor
 * represents an admin-curated row from the main `actors` table that users
 * can read but never write. Both ActorsView (list) and ActorProfile (detail)
 * consume this; structural typing handles narrowing for the list view.
 *
 * Re-exported from the generated Supabase Row type — there is no JSONB
 * column friction on this table (unlike PersonalActor's analysis_data /
 * search_data), so the generated type works without modification.
 *
 * Geographic coordinates live on `latitude` / `longitude` (numeric) with
 * `geocoded_at` and `geocoded_precision` metadata (D2a). The legacy
 * `coordinates point` column was dropped.
 */
import type { Database } from "@/integrations/supabase/types";

export type DbActor = Database["public"]["Tables"]["actors"]["Row"];
