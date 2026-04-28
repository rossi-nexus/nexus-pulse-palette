/**
 * Canonical PersonalActor row type — mirrors public.user_personal_actors.
 *
 * This is the single source of truth used by both ActorProfile.tsx (full
 * profile view) and ActorsView.tsx (list view). Consumers may use a subset
 * of fields; structural typing handles the narrowing.
 *
 * Hand-rolled rather than re-exported from the generated Supabase Row type
 * because the generated type expresses analysis_data / search_data as the
 * recursive `Json | null` union, which is awkward for consumers that need
 * to index into the JSONB. Here we keep them as `Record<string, unknown>
 * | null` to match how they are consumed across the app.
 *
 * Field list deliberately matches audit M6 (P27). Extra DB columns that
 * exist on the row but are not consumed by the frontend (merged_actor_id,
 * role_names) are intentionally omitted to keep the
 * interface focused on the consumed shape.
 */
export interface PersonalActor {
  id: string;
  user_id: string;
  actor_name: string;
  actor_type: string | null;
  actor_description: string | null;
  actor_website: string | null;
  country: string | null;
  org_number: string | null;
  trade_names: string[];
  street_address: string | null;
  city: string | null;
  region: string | null;
  source_step: string | null;
  source_session_id: string | null;
  source_urls: string[] | null;
  profile_completeness: number | null;
  matched_main_db_actor_id: string | null;
  match_timestamp: string | null;
  analysis_data: Record<string, unknown> | null;
  search_data: Record<string, unknown> | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  suggested_at: string | null;
  created_at: string;
}
