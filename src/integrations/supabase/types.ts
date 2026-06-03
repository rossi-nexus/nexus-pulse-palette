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
      actor_aliases: {
        Row: {
          actor_id: string
          alias_name: string
          alias_type: string | null
          created_at: string
          created_by: string | null
          evidence: string | null
          id: string
          source_url: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          actor_id: string
          alias_name: string
          alias_type?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          source_url?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          actor_id?: string
          alias_name?: string
          alias_type?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          source_url?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_aliases_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_capacity_attributes: {
        Row: {
          actor_id: string
          actor_ontology_tag_id: string | null
          attribute_type: string
          created_at: string
          decays_at: string | null
          evidence: string | null
          id: string
          source: string | null
          source_url: string | null
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
          actor_ontology_tag_id?: string | null
          attribute_type: string
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          source?: string | null
          source_url?: string | null
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
          actor_ontology_tag_id?: string | null
          attribute_type?: string
          created_at?: string
          decays_at?: string | null
          evidence?: string | null
          id?: string
          source?: string | null
          source_url?: string | null
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
          is_featured: boolean
          is_hidden: boolean
          linkedin: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string
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
          is_featured?: boolean
          is_hidden?: boolean
          linkedin?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
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
          is_featured?: boolean
          is_hidden?: boolean
          linkedin?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
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
          last_enriched_at: string | null
          metadata: Json | null
          name: string | null
          source: string
          source_url: string | null
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
          last_enriched_at?: string | null
          metadata?: Json | null
          name?: string | null
          source: string
          source_url?: string | null
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
          last_enriched_at?: string | null
          metadata?: Json | null
          name?: string | null
          source?: string
          source_url?: string | null
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
          crop_data: Json | null
          id: string
          linked_ontology_entry_id: string | null
          original_url: string | null
          source: string | null
          type: string
          updated_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          crop_data?: Json | null
          id?: string
          linked_ontology_entry_id?: string | null
          original_url?: string | null
          source?: string | null
          type: string
          updated_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          crop_data?: Json | null
          id?: string
          linked_ontology_entry_id?: string | null
          original_url?: string | null
          source?: string | null
          type?: string
          updated_at?: string
          uploaded_by?: string | null
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
          accepted_at: string | null
          actor_id: string
          confidence: string | null
          created_at: string
          evidence: string | null
          id: string
          ontology_entry_id: string
          source: string
          source_url: string | null
        }
        Insert: {
          accepted_at?: string | null
          actor_id: string
          confidence?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          ontology_entry_id: string
          source: string
          source_url?: string | null
        }
        Update: {
          accepted_at?: string | null
          actor_id?: string
          confidence?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          ontology_entry_id?: string
          source?: string
          source_url?: string | null
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
      actor_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          evidence: string | null
          id: string
          relationship_type: string
          source_actor_id: string
          source_url: string | null
          target_actor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          relationship_type: string
          source_actor_id: string
          source_url?: string | null
          target_actor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          relationship_type?: string
          source_actor_id?: string
          source_url?: string | null
          target_actor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_relationships_source_actor_id_fkey"
            columns: ["source_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_relationships_target_actor_id_fkey"
            columns: ["target_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_section_skips: {
        Row: {
          actor_id: string
          reason: string | null
          section_key: string
          skipped_at: string
          skipped_by: string | null
        }
        Insert: {
          actor_id: string
          reason?: string | null
          section_key: string
          skipped_at?: string
          skipped_by?: string | null
        }
        Update: {
          actor_id?: string
          reason?: string | null
          section_key?: string
          skipped_at?: string
          skipped_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_section_skips_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
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
          source: string | null
          source_url: string | null
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
          source?: string | null
          source_url?: string | null
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
          source?: string | null
          source_url?: string | null
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
          linked_actor_id: string | null
          origin: string
          origin_external_id: string | null
          origin_registry: string | null
          proposed_items: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_by: string
          user_personal_actor_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          duplicate_check_result?: Json | null
          id?: string
          linked_actor_id?: string | null
          origin?: string
          origin_external_id?: string | null
          origin_registry?: string | null
          proposed_items?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by: string
          user_personal_actor_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          duplicate_check_result?: Json | null
          id?: string
          linked_actor_id?: string | null
          origin?: string
          origin_external_id?: string | null
          origin_registry?: string | null
          proposed_items?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string
          user_personal_actor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_validation_queue_linked_actor_id_fkey"
            columns: ["linked_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
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
          actor_classification: string
          city: string | null
          country: string | null
          created_at: string
          data_completeness: string[] | null
          decays_at: string | null
          geocoded_at: string | null
          geocoded_precision: string | null
          id: string
          latitude: number | null
          legal_name: string
          longitude: number | null
          merged_at: string | null
          merged_into_id: string | null
          org_number: string | null
          postal_code: string | null
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
          actor_classification?: string
          city?: string | null
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          decays_at?: string | null
          geocoded_at?: string | null
          geocoded_precision?: string | null
          id?: string
          latitude?: number | null
          legal_name: string
          longitude?: number | null
          merged_at?: string | null
          merged_into_id?: string | null
          org_number?: string | null
          postal_code?: string | null
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
          actor_classification?: string
          city?: string | null
          country?: string | null
          created_at?: string
          data_completeness?: string[] | null
          decays_at?: string | null
          geocoded_at?: string | null
          geocoded_precision?: string | null
          id?: string
          latitude?: number | null
          legal_name?: string
          longitude?: number | null
          merged_at?: string | null
          merged_into_id?: string | null
          org_number?: string | null
          postal_code?: string | null
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
            foreignKeyName: "actors_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
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
      consultant_drafts: {
        Row: {
          client_session_id: string | null
          created_at: string
          draft_payload: Json
          id: string
          target_id: string | null
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_session_id?: string | null
          created_at?: string
          draft_payload: Json
          id?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_session_id?: string | null
          created_at?: string
          draft_payload?: Json
          id?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultant_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      saved_searches: {
        Row: {
          axis_weights: Json | null
          created_at: string
          id: string
          last_notified_at: string | null
          name: string
          need_payload: Json
          programme_id: string | null
          threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          axis_weights?: Json | null
          created_at?: string
          id?: string
          last_notified_at?: string | null
          name: string
          need_payload: Json
          programme_id?: string | null
          threshold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          axis_weights?: Json | null
          created_at?: string
          id?: string
          last_notified_at?: string | null
          name?: string
          need_payload?: Json
          programme_id?: string | null
          threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes"
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
      user_actor_interactions: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          interaction_type: string
          metadata: Json | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          interaction_type: string
          metadata?: Json | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          interaction_type?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_actor_interactions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_actor_interactions_session_id_fkey"
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
      user_notification_state: {
        Row: {
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          geocoded_at: string | null
          geocoded_precision: string | null
          id: string
          latitude: number | null
          longitude: number | null
          match_timestamp: string | null
          matched_main_db_actor_id: string | null
          merged_actor_id: string | null
          notes: string | null
          org_number: string | null
          postal_code: string | null
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
          geocoded_at?: string | null
          geocoded_precision?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          match_timestamp?: string | null
          matched_main_db_actor_id?: string | null
          merged_actor_id?: string | null
          notes?: string | null
          org_number?: string | null
          postal_code?: string | null
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
          geocoded_at?: string | null
          geocoded_precision?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          match_timestamp?: string | null
          matched_main_db_actor_id?: string | null
          merged_actor_id?: string | null
          notes?: string | null
          org_number?: string | null
          postal_code?: string | null
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
      user_preferences: {
        Row: {
          default_axis_weights: Json | null
          onboarding_seen: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          default_axis_weights?: Json | null
          onboarding_seen?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          default_axis_weights?: Json | null
          onboarding_seen?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          deactivated_at: string | null
          email: string
          id: string
          name: string
          organization_name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          email: string
          id: string
          name: string
          organization_name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
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
      earth: { Args: never; Returns: number }
      fn_accept_item_addition: {
        Args: { p_accepted_items: Json; p_queue_id: string; p_reason?: string }
        Returns: string
      }
      fn_actors_for_map: {
        Args: never
        Returns: {
          city: string
          country: string
          decays_at: string
          geocoded_precision: string
          id: string
          latitude: number
          legal_name: string
          longitude: number
          primary_domain_category: string
          primary_domain_name: string
          verification_status: string
          verified_at: string
        }[]
      }
      fn_admin_dashboard_summary: {
        Args: never
        Returns: {
          actor_total: number
          actor_unverified: number
          actor_verified: number
          attribute_holders_by_kv: Json
          audit_events_30d: number
          audit_events_7d: number
          audit_top_event_types_7d: Json
          decay_due_30d: number
          decay_expired: number
          ontology_active: number
          ontology_archived: number
          ontology_decisions_30d: number
          ontology_decisions_7d: number
          ontology_proposed: number
          programme_total: number
          registry_imports_by_action_30d: Json
          user_admin: number
          user_total: number
          validation_queue_by_status: Json
          verification_events_30d: number
          verification_events_7d: number
        }[]
      }
      fn_admin_deactivate_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      fn_admin_list_users: {
        Args: never
        Returns: {
          attributes: Json
          created_at: string
          deactivated_at: string
          email: string
          id: string
          name: string
          programmes: Json
          role: string
        }[]
      }
      fn_admin_ontology_decision: {
        Args: {
          p_action: string
          p_category_id?: string
          p_description?: string
          p_entry_id: string
          p_raw_name?: string
          p_reason?: string
          p_target_entry_id?: string
        }
        Returns: Json
      }
      fn_admin_remove_user_attribute: {
        Args: { p_key: string; p_user_id: string; p_value: string }
        Returns: undefined
      }
      fn_admin_set_user_attribute: {
        Args: {
          p_expires_at?: string
          p_key: string
          p_user_id: string
          p_value: string
        }
        Returns: undefined
      }
      fn_admin_update_user: {
        Args: { p_name: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      fn_approve_and_verify: {
        Args: {
          p_confidence: string
          p_consultant_decisions?: Json
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
      fn_backfill_actor_descriptions_from_personal: {
        Args: never
        Returns: {
          actor_id: string
          descriptions_added: number
          legal_name: string
          tags_updated: number
        }[]
      }
      fn_backfill_ontology_tag_confidence: {
        Args: never
        Returns: {
          rows_updated: number
          rows_with_confidence: number
        }[]
      }
      fn_backfill_provenance_labels: {
        Args: never
        Returns: {
          contacts_updated: number
          descriptions_updated: number
          media_updated: number
          tags_updated: number
          total_processed: number
        }[]
      }
      fn_can_write_actor_media: {
        Args: { _actor_id: string }
        Returns: boolean
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
      fn_check_saved_search_hits: {
        Args: { p_actor_id: string }
        Returns: undefined
      }
      fn_check_strong_product_association: {
        Args: { _alt: string; _product_name: string; _url: string }
        Returns: boolean
      }
      fn_cleanup_old_drafts: { Args: never; Returns: number }
      fn_compute_actor_relevance_score_v2: {
        Args: {
          p_actor_ids: string[]
          p_constraints?: Json
          p_user_id?: string
          p_weights?: Json
        }
        Returns: {
          actor_id: string
          breakdown: Json
          total_score: number
        }[]
      }
      fn_create_actor_hybrid: {
        Args: {
          p_country: string
          p_data: Json
          p_org_number: string
          p_source: string
        }
        Returns: Json
      }
      fn_create_programme: {
        Args: { p_client_org?: string; p_description?: string; p_name: string }
        Returns: string
      }
      fn_delete_archived_actor: {
        Args: { p_actor_id: string; p_reason?: string }
        Returns: string
      }
      fn_geocode_missing_actors: {
        Args: never
        Returns: {
          failed: number
          skipped_no_address: number
          successful: number
          total_attempted: number
        }[]
      }
      fn_geocode_missing_personal_actors: {
        Args: never
        Returns: {
          processed_actor_id: string
          processed_actor_name: string
          processed_count: number
          remaining_count: number
          total_count: number
        }[]
      }
      fn_geocode_missing_verified_actors: {
        Args: never
        Returns: {
          processed_actor_id: string
          processed_actor_name: string
          processed_count: number
          remaining_count: number
          total_count: number
        }[]
      }
      fn_import_actor_from_registry: {
        Args: {
          p_data: Json
          p_evidence_url?: string
          p_external_id: string
          p_registry: string
        }
        Returns: Json
      }
      fn_merge_actors: {
        Args: { p_reason?: string; p_source_id: string; p_survivor_id: string }
        Returns: string
      }
      fn_notifications_decay_for_me: {
        Args: { _within?: string }
        Returns: {
          actor_id: string
          decays_at: string
          legal_name: string
          state: string
          verified_at: string
        }[]
      }
      fn_onboard_verified_actor: {
        Args: {
          p_consultant_decisions?: Json
          p_identity: Json
          p_ontology_items: Json
          p_programme_id: string
          p_verification: Json
        }
        Returns: Json
      }
      fn_persist_actor_enrichment: {
        Args: {
          p_actor_id: string
          p_capacity?: Json
          p_source_url?: string
          p_standards?: Json
        }
        Returns: {
          capacity_inserted: number
          standards_inserted: number
        }[]
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
      fn_propose_items_for_actor: {
        Args: {
          p_db_actor_id: string
          p_items: Json
          p_personal_actor_id: string
          p_reason?: string
        }
        Returns: string
      }
      fn_propose_new_entry_for_actor: {
        Args: {
          p_category_id: string
          p_confidence?: string
          p_db_actor_id: string
          p_description?: string
          p_entry_name: string
          p_evidence?: string
          p_personal_actor_id: string
          p_reason?: string
          p_source_url?: string
        }
        Returns: string
      }
      fn_rank_actors_by_ontology_overlap: {
        Args: {
          p_countries?: string[]
          p_entry_ids: string[]
          p_limit?: number
        }
        Returns: {
          actor_id: string
          city: string
          country: string
          decays_at: string
          latitude: number
          legal_name: string
          longitude: number
          matched_entry_ids: string[]
          overlap_count: number
          region: string
          verification_status: string
          verified_at: string
          websites: string[]
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
      fn_reject_item_addition: {
        Args: { p_queue_id: string; p_reason?: string }
        Returns: string
      }
      fn_reject_suggestion: {
        Args: { p_programme_id?: string; p_queue_id: string; p_reason?: string }
        Returns: string
      }
      fn_reprocess_auto_enrichment_media: {
        Args: never
        Returns: {
          rows_inspected: number
          rows_kept_linked: number
          rows_orphaned: number
        }[]
      }
      fn_resolve_description_type: {
        Args: { p_mapped_entry_id: string; p_proposed_category_id: string }
        Returns: string
      }
      fn_suggest_actor: {
        Args: { p_personal_actor_id: string }
        Returns: string
      }
      fn_suggest_role_for_summary_point: {
        Args: { p_existing_role_names?: string[]; p_summary_point: string }
        Returns: string
      }
      fn_update_actor: {
        Args: { p_actor_id: string; p_reason?: string; p_updates: Json }
        Returns: string
      }
      fn_url_host: { Args: { _url: string }; Returns: string }
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
          p_consultant_decisions?: Json
          p_decays_at: string
          p_evidence: Json
          p_notes: string
          p_programme_id?: string
        }
        Returns: string
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
