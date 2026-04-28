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
 * The `coordinates` column is typed `unknown` upstream (Postgres `point`)
 * and is not consumed by the frontend; consumers ignore it.
 */
import type { Database } from "@/integrations/supabase/types";

export type DbActor = Database["public"]["Tables"]["actors"]["Row"];
