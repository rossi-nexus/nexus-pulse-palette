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
          decays_at: string | null
          evidence: string | null
          id: string
          unit: string | null
          value_max: number | null
          value_min: number | null
          value_text: string
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
        }
        Insert: {
          actor_id: string
          actor_ontology_tag_id: string
          attribute_type: string
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
          value_text: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Update: {
          actor_id?: string
          actor_ontology_tag_id?: string
          attribute_type?: string
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
          value_text?: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
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
          {
            foreignKeyName: "actor_capacity_attributes_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_certifications: {
        Row: {
          actor_id: string
          classification_system: string
          confidence: string | null
          created_at: string
          decays_at: string | null
          evidence: string | null
          id: string
          issuing_authority: string | null
          level_national_term: string | null
          level_normalized: string
          valid_from: string | null
          valid_to: string | null
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
        }
        Insert: {
          actor_id: string
          classification_system: string
          confidence?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          issuing_authority?: string | null
          level_national_term?: string | null
          level_normalized: string
          valid_from?: string | null
          valid_to?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Update: {
          actor_id?: string
          classification_system?: string
          confidence?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          issuing_authority?: string | null
          level_national_term?: string | null
          level_normalized?: string
          valid_from?: string | null
          valid_to?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_certifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_certifications_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_contacts: {
        Row: {
          actor_id: string
          decays_at: string | null
          email: string | null
          id: string
          linkedin: string | null
          name: string
          phone: string | null
          title: string | null
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
        }
        Insert: {
          actor_id: string
          decays_at?: string | null
          email?: string | null
          id?: string
          linkedin?: string | null
          name: string
          phone?: string | null
          title?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Update: {
          actor_id?: string
          decays_at?: string | null
          email?: string | null
          id?: string
          linkedin?: string | null
          name?: string
          phone?: string | null
          title?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_contacts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_contacts_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          decays_at: string | null
          description: string | null
          domain: string | null
          id: string
          is_reference: boolean
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
          year: number | null
        }
        Insert: {
          actor_id: string
          branch_detail?: string | null
          created_at?: string
          customer_name: string
          customer_segment?: string | null
          decays_at?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          is_reference?: boolean
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
          year?: number | null
        }
        Update: {
          actor_id?: string
          branch_detail?: string | null
          created_at?: string
          customer_name?: string
          customer_segment?: string | null
          decays_at?: string | null
          description?: string | null
          domain?: string | null
          id?: string
          is_reference?: boolean
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
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
          {
            foreignKeyName: "actor_customer_history_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_descriptions: {
        Row: {
          actor_id: string
          content: string
          created_at: string
          decays_at: string | null
          id: string
          source: string
          type: string
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
        }
        Insert: {
          actor_id: string
          content: string
          created_at?: string
          decays_at?: string | null
          id?: string
          source: string
          type: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Update: {
          actor_id?: string
          content?: string
          created_at?: string
          decays_at?: string | null
          id?: string
          source?: string
          type?: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_descriptions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_descriptions_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          decays_at: string | null
          evidence: string | null
          id: string
          scope: string | null
          standard_name: string
          standard_number: string | null
          valid_from: string | null
          valid_to: string | null
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
        }
        Insert: {
          actor_id: string
          certifying_body?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          scope?: string | null
          standard_name: string
          standard_number?: string | null
          valid_from?: string | null
          valid_to?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Update: {
          actor_id?: string
          certifying_body?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          scope?: string | null
          standard_name?: string
          standard_number?: string | null
          valid_from?: string | null
          valid_to?: string | null
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_standards_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_standards_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          decays_at: string | null
          id: string
          legal_name: string
          org_number: string | null
          region: string | null
          source: string
          street_address: string | null
          trade_names: string[] | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verifier_confidence: string | null
          verifier_id: string | null
          websites: string[] | null
        }
        Insert: {
          city?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          decays_at?: string | null
          id?: string
          legal_name: string
          org_number?: string | null
          region?: string | null
          source: string
          street_address?: string | null
          trade_names?: string[] | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
          websites?: string[] | null
        }
        Update: {
          city?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          decays_at?: string | null
          id?: string
          legal_name?: string
          org_number?: string | null
          region?: string | null
          source?: string
          street_address?: string | null
          trade_names?: string[] | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verifier_confidence?: string | null
          verifier_id?: string | null
          websites?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "actors_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      audit_log: {
        Row: {
          actor_id: string | null
          actor_user_id: string | null
          changes: Json | null
          created_at: string
          event_type: string
          id: string
          programme_id: string | null
          reason: string | null
          target_record_id: string | null
          target_table: string
        }
        Insert: {
          actor_id?: string | null
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          event_type: string
          id?: string
          programme_id?: string | null
          reason?: string | null
          target_record_id?: string | null
          target_table: string
        }
        Update: {
          actor_id?: string | null
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          programme_id?: string | null
          reason?: string | null
          target_record_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
        ]
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
          programme_id: string | null
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
          programme_id?: string | null
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
          programme_id?: string | null
          publication_date?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_items_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_categories: {
        Row: {
          co_occurring_category_ids: string[]
          created_at: string
          description: string | null
          example_entries: string[]
          id: string
          keywords: string[]
          normalized_name: string
          sort_order: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          co_occurring_category_ids?: string[]
          created_at?: string
          description?: string | null
          example_entries?: string[]
          id?: string
          keywords?: string[]
          normalized_name: string
          sort_order?: number
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          co_occurring_category_ids?: string[]
          created_at?: string
          description?: string | null
          example_entries?: string[]
          id?: string
          keywords?: string[]
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
      programme_members: {
        Row: {
          invited_by: string | null
          joined_at: string
          programme_id: string
          role: string
          user_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string
          programme_id: string
          role: string
          user_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string
          programme_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_members_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      programme_outcomes: {
        Row: {
          actor_id: string
          completed_at: string | null
          evidence: Json
          id: string
          notes: string | null
          outcome_type: string
          programme_id: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          evidence?: Json
          id?: string
          notes?: string | null
          outcome_type: string
          programme_id: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          evidence?: Json
          id?: string
          notes?: string | null
          outcome_type?: string
          programme_id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programme_outcomes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_outcomes_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_outcomes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      programmes: {
        Row: {
          client_org: string | null
          created_at: string
          deliverables_summary: string | null
          description: string | null
          ended_at: string | null
          id: string
          name: string
          owner_user_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_org?: string | null
          created_at?: string
          deliverables_summary?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_org?: string | null
          created_at?: string
          deliverables_summary?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          programme_id: string | null
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
          programme_id?: string | null
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
          programme_id?: string | null
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
            foreignKeyName: "search_analytics_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
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
          programme_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_saved_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          programme_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_saved_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          programme_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_sessions_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
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
      user_attributes: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          key: string
          user_id: string
          value: string | null
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          key: string
          user_id: string
          value?: string | null
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          key?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_attributes_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attributes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          name?: string
          organization_name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      verification_events: {
        Row: {
          actor_id: string
          completed_at: string | null
          created_at: string
          decays_at: string | null
          evidence: Json
          id: string
          programme_id: string | null
          source_queue_id: string | null
          verification_status: string
          verifier_confidence: string | null
          verifier_id: string | null
          verifier_notes: string | null
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: Json
          id?: string
          programme_id?: string | null
          source_queue_id?: string | null
          verification_status: string
          verifier_confidence?: string | null
          verifier_id?: string | null
          verifier_notes?: string | null
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          created_at?: string
          decays_at?: string | null
          evidence?: Json
          id?: string
          programme_id?: string | null
          source_queue_id?: string | null
          verification_status?: string
          verifier_confidence?: string | null
          verifier_id?: string | null
          verifier_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_source_queue_id_fkey"
            columns: ["source_queue_id"]
            isOneToOne: false
            referencedRelation: "actor_validation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_approve_and_verify: {
        Args: {
          p_confidence: string
          p_decays_at: string
          p_evidence: Json
          p_notes: string
          p_programme_id?: string
          p_queue_id: string
        }
        Returns: Json
      }
      fn_audit_log_event: {
        Args: {
          p_actor_id?: string
          p_changes?: Json
          p_event_type: string
          p_programme_id?: string
          p_reason?: string
          p_target_record_id: string
          p_target_table: string
        }
        Returns: string
      }
      fn_check_decay: {
        Args: { _within?: string }
        Returns: {
          actor_id: string
          actor_name: string
          decays_at: string
          state: string
          verified_at: string
        }[]
      }
      fn_create_programme: {
        Args: { p_client_org?: string; p_description?: string; p_name: string }
        Returns: string
      }
      fn_onboard_verified_actor:
        | {
            Args: {
              p_identity: Json
              p_ontology_items: Json
              p_programme_id: string
              p_verification: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_consultant_decisions?: Json
              p_identity: Json
              p_ontology_items: Json
              p_programme_id: string
              p_verification: Json
            }
            Returns: Json
          }
      fn_programme_summary: {
        Args: { p_programme_id: string }
        Returns: {
          decay_warning_count: number
          member_count: number
          pending_suggestion_count: number
          session_count: number
          verified_actor_count: number
        }[]
      }
      fn_record_outcome: {
        Args: {
          p_actor_id: string
          p_completed_at?: string
          p_evidence?: Json
          p_notes?: string
          p_outcome_type: string
          p_programme_id: string
        }
        Returns: string
      }
      fn_reject_suggestion: {
        Args: { p_programme_id?: string; p_queue_id: string; p_reason?: string }
        Returns: string
      }
      fn_suggest_actor: {
        Args: { p_personal_actor_id: string }
        Returns: string
      }
      fn_user_has_attr: {
        Args: { _key: string; _uid: string; _value?: string }
        Returns: boolean
      }
      fn_user_is_programme_member: {
        Args: { _programme_id: string; _uid: string }
        Returns: boolean
      }
      fn_user_is_programme_owner: {
        Args: { _programme_id: string; _uid: string }
        Returns: boolean
      }
      fn_verify_actor: {
        Args: {
          p_actor_id: string
          p_confidence: string
          p_decays_at: string
          p_evidence: Json
          p_notes: string
          p_programme_id?: string
        }
        Returns: string
      }
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
