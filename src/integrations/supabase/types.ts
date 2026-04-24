export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actor_capacity_attributes: {
        Row: {
          actor_id: string
          actor_ontology_tag_id: string
          attribute_type: string
          created_at: string
          evidence: string | null
          id: string
          unit: string | null
          value_max: number | null
          value_min: number | null
          value_text: string
        }
        Insert: {
          actor_id: string
          actor_ontology_tag_id: string
          attribute_type: string
          created_at?: string
          evidence?: string | null
          id?: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
          value_text: string
        }
        Update: {
          actor_id?: string
          actor_ontology_tag_id?: string
          attribute_type?: string
          created_at?: string
          evidence?: string | null
          id?: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
          value_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_capacity_attributes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_capacity_attributes_actor_ontology_tag_id_fkey"
            columns: ["actor_ontology_tag_id"]
            isOneToOne: false
            referencedRelation: "actor_ontology_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_classifications: {
        Row: {
          actor_id: string
          classification_system: string
          confidence: string | null
          created_at: string
          evidence: string | null
          id: string
          issuing_authority: string | null
          level_national_term: string | null
          level_normalized: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          actor_id: string
          classification_system: string
          confidence?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          issuing_authority?: string | null
          level_national_term?: string | null
          level_normalized: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          actor_id?: string
          classification_system?: string
          confidence?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          issuing_authority?: string | null
          level_national_term?: string | null
          level_normalized?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_classifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_contacts: {
        Row: {
          actor_id: string
          email: string | null
          id: string
          linkedin: string | null
          name: string
          phone: string | null
          title: string | null
        }
        Insert: {
          actor_id: string
          email?: string | null
          id?: string
          linkedin?: string | null
          name: string
          phone?: string | null
          title?: string | null
        }
        Update: {
          actor_id?: string
          email?: string | null
          id?: string
          linkedin?: string | null
          name?: string
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_contacts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_customer_history: {
        Row: {
          actor_id: string
          branch_detail: string | null
          created_at: string
          customer_name: string
          customer_segment: string | null
          description: string | null
          domain: string | null
          id: string
          is_reference: boolean
          year: number | null
        }
        Insert: {
          actor_id: string
          branch_detail?: string | null
          created_at?: string
          customer_name: string
          customer_segment?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          is_reference?: boolean
          year?: number | null
        }
        Update: {
          actor_id?: string
          branch_detail?: string | null
          created_at?: string
          customer_name?: string
          customer_segment?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          is_reference?: boolean
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_customer_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_descriptions: {
        Row: {
          actor_id: string
          content: string
          created_at: string
          id: string
          source: string
          type: string
        }
        Insert: {
          actor_id: string
          content: string
          created_at?: string
          id?: string
          source: string
          type: string
        }
        Update: {
          actor_id?: string
          content?: string
          created_at?: string
          id?: string
          source?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_descriptions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_media: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          linked_ontology_entry_id: string | null
          type: string
          url: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          linked_ontology_entry_id?: string | null
          type: string
          url: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          linked_ontology_entry_id?: string | null
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_media_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_media_linked_ontology_entry_id_fkey"
            columns: ["linked_ontology_entry_id"]
            isOneToOne: false
            referencedRelation: "ontology_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_ontology_tags: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          ontology_entry_id: string
          source: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          ontology_entry_id: string
          source: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          ontology_entry_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_ontology_tags_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_ontology_tags_ontology_entry_id_fkey"
            columns: ["ontology_entry_id"]
            isOneToOne: false
            referencedRelation: "ontology_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_standards: {
        Row: {
          actor_id: string
          certifying_body: string | null
          created_at: string
          evidence: string | null
          id: string
          scope: string | null
          standard_name: string
          standard_number: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          actor_id: string
          certifying_body?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          scope?: string | null
          standard_name: string
          standard_number?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          actor_id?: string
          certifying_body?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          scope?: string | null
          standard_name?: string
          standard_number?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_standards_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_validation_queue: {
        Row: {
          admin_notes: string | null
          created_at: string
          duplicate_check_result: Json | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_by: string
          user_personal_actor_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          duplicate_check_result?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by: string
          user_personal_actor_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          duplicate_check_result?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string
          user_personal_actor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_validation_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_validation_queue_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_validation_queue_user_personal_actor_id_fkey"
            columns: ["user_personal_actor_id"]
            isOneToOne: false
            referencedRelation: "user_personal_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actors: {
        Row: {
          city: string | null
          coordinates: unknown
          country: string | null
          created_at: string
          data_completeness: string[] | null
          id: string
          legal_name: string
          org_number: string | null
          region: string | null
          source: string
          street_address: string | null
          trade_names: string[] | null
          updated_at: string
          verification_status: string
          websites: string[] | null
        }
        Insert: {
          city?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          id?: string
          legal_name: string
          org_number?: string | null
          region?: string | null
          source: string
          street_address?: string | null
          trade_names?: string[] | null
          updated_at?: string
          verification_status?: string
          websites?: string[] | null
        }
        Update: {
          city?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          id?: string
          legal_name?: string
          org_number?: string | null
          region?: string | null
          source?: string
          street_address?: string | null
          trade_names?: string[] | null
          updated_at?: string
          verification_status?: string
          websites?: string[] | null
        }
        Relationships: []
      }
      api_connectors: {
        Row: {
          auth_method: string | null
          config: Json | null
          created_at: string
          data_type: string | null
          id: string
          name: string
          provider: string | null
          rate_limit: number | null
          refresh_schedule: string | null
          sector_coverage: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_method?: string | null
          config?: Json | null
          created_at?: string
          data_type?: string | null
          id?: string
          name: string
          provider?: string | null
          rate_limit?: number | null
          refresh_schedule?: string | null
          sector_coverage?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_method?: string | null
          config?: Json | null
          created_at?: string
          data_type?: string | null
          id?: string
          name?: string
          provider?: string | null
          rate_limit?: number | null
          refresh_schedule?: string | null
          sector_coverage?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_items: {
        Row: {
          admin_notes: string | null
          author: string | null
          created_at: string
          extracted_entities: Json | null
          full_text: string | null
          id: string
          ingestion_date: string
          ontology_tags: Json | null
          publication_date: string | null
          source_name: string | null
          source_url: string | null
          status: string
          title: string
        }
        Insert: {
          admin_notes?: string | null
          author?: string | null
          created_at?: string
          extracted_entities?: Json | null
          full_text?: string | null
          id?: string
          ingestion_date?: string
          ontology_tags?: Json | null
          publication_date?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string
          title: string
        }
        Update: {
          admin_notes?: string | null
          author?: string | null
          created_at?: string
          extracted_entities?: Json | null
          full_text?: string | null
          id?: string
          ingestion_date?: string
          ontology_tags?: Json | null
          publication_date?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      ontology_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          normalized_name: string
          sort_order: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          normalized_name: string
          sort_order?: number
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          normalized_name?: string
          sort_order?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ontology_entries: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          raw_name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          raw_name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          raw_name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ontology_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          actors_found: number | null
          actors_included: number | null
          constraints_used: Json | null
          created_at: string
          id: string
          is_anonymous: boolean
          roles_created: number | null
          searched_capabilities: string[] | null
          searched_competences: string[] | null
          searched_domains: string[] | null
          searched_product_types: string[] | null
          searched_service_types: string[] | null
          session_id: string
          user_id: string | null
          user_tier: string
        }
        Insert: {
          actors_found?: number | null
          actors_included?: number | null
          constraints_used?: Json | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          roles_created?: number | null
          searched_capabilities?: string[] | null
          searched_competences?: string[] | null
          searched_domains?: string[] | null
          searched_product_types?: string[] | null
          searched_service_types?: string[] | null
          session_id: string
          user_id?: string | null
          user_tier: string
        }
        Update: {
          actors_found?: number | null
          actors_included?: number | null
          constraints_used?: Json | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          roles_created?: number | null
          searched_capabilities?: string[] | null
          searched_competences?: string[] | null
          searched_domains?: string[] | null
          searched_product_types?: string[] | null
          searched_service_types?: string[] | null
          session_id?: string
          user_id?: string | null
          user_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_analytics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "search_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      search_sessions: {
        Row: {
          auto_saved_at: string | null
          created_at: string
          id: string
          name: string | null
          project_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_saved_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_saved_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_actors: {
        Row: {
          actor_id: string | null
          analysis_data: Json | null
          created_at: string
          db_check_data: Json | null
          id: string
          role_id: string
          search_data: Json | null
          session_id: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          analysis_data?: Json | null
          created_at?: string
          db_check_data?: Json | null
          id?: string
          role_id: string
          search_data?: Json | null
          session_id: string
          status: string
        }
        Update: {
          actor_id?: string | null
          analysis_data?: Json | null
          created_at?: string
          db_check_data?: Json | null
          id?: string
          role_id?: string
          search_data?: Json | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_actors_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_actors_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "search_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_step_states: {
        Row: {
          created_at: string
          id: string
          locked_at: string | null
          locked_output: Json | null
          session_id: string
          status: string
          step: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_output?: Json | null
          session_id: string
          status?: string
          step: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_output?: Json | null
          session_id?: string
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_step_states_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "search_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_personal_actors: {
        Row: {
          actor_description: string | null
          actor_name: string
          actor_type: string | null
          actor_website: string | null
          analysis_data: Json | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          match_timestamp: string | null
          matched_main_db_actor_id: string | null
          merged_actor_id: string | null
          notes: string | null
          org_number: string | null
          profile_completeness: number | null
          region: string | null
          role_names: string[] | null
          search_data: Json | null
          sharing_level: string | null
          source_session_id: string | null
          source_step: string | null
          source_urls: string[] | null
          status: string
          street_address: string | null
          suggested_at: string | null
          tags: string[] | null
          trade_names: string[]
          user_id: string
        }
        Insert: {
          actor_description?: string | null
          actor_name?: string
          actor_type?: string | null
          actor_website?: string | null
          analysis_data?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          match_timestamp?: string | null
          matched_main_db_actor_id?: string | null
          merged_actor_id?: string | null
          notes?: string | null
          org_number?: string | null
          profile_completeness?: number | null
          region?: string | null
          role_names?: string[] | null
          search_data?: Json | null
          sharing_level?: string | null
          source_session_id?: string | null
          source_step?: string | null
          source_urls?: string[] | null
          status?: string
          street_address?: string | null
          suggested_at?: string | null
          tags?: string[] | null
          trade_names?: string[]
          user_id: string
        }
        Update: {
          actor_description?: string | null
          actor_name?: string
          actor_type?: string | null
          actor_website?: string | null
          analysis_data?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          match_timestamp?: string | null
          matched_main_db_actor_id?: string | null
          merged_actor_id?: string | null
          notes?: string | null
          org_number?: string | null
          profile_completeness?: number | null
          region?: string | null
          role_names?: string[] | null
          search_data?: Json | null
          sharing_level?: string | null
          source_session_id?: string | null
          source_step?: string | null
          source_urls?: string[] | null
          status?: string
          street_address?: string | null
          suggested_at?: string | null
          tags?: string[] | null
          trade_names?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_personal_actors_matched_main_db_actor_id_fkey"
            columns: ["matched_main_db_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_personal_actors_merged_actor_id_fkey"
            columns: ["merged_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_personal_actors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          access_tier: string
          created_at: string
          email: string
          id: string
          is_anonymous: boolean
          name: string
          organization_name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          access_tier?: string
          created_at?: string
          email: string
          id: string
          is_anonymous?: boolean
          name: string
          organization_name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          access_tier?: string
          created_at?: string
          email?: string
          id?: string
          is_anonymous?: boolean
          name?: string
          organization_name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tier: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
