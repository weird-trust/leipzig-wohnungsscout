import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hand-written row types mirroring supabase/migrations/. Only the db layer
 * uses these; everything else works with domain types.
 *
 * Value-set columns are typed as plain strings on purpose: rows are checked
 * at runtime in mapping.ts instead of being trusted.
 */

export type EmailRow = {
  id: string;
  provider_message_id: string;
  received_at: string;
  raw_from: string | null;
  raw_to: string[];
  raw_subject: string | null;
  raw_text: string | null;
  raw_html: string | null;
  detected_source: string;
  parser_version: string | null;
  parse_status: string;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailInsert = {
  provider_message_id: string;
  received_at: string;
  raw_from: string | null;
  raw_to: string[];
  raw_subject: string | null;
  raw_text: string | null;
  raw_html: string | null;
  detected_source: string;
};

/** Processing results only; the raw email columns are never updated. */
export type EmailUpdate = Partial<
  Pick<EmailRow, "parser_version" | "parse_status" | "parse_error" | "detected_source">
>;

export type ApartmentRow = {
  id: string;
  email_id: string | null;
  source: string;
  source_url: string | null;
  source_id: string | null;
  title: string;
  address: string | null;
  district: string | null;
  rooms: number | null;
  sqm: number | null;
  rent_cold: number | null;
  rent_warm: number | null;
  floor: number | null;
  top_floor: boolean | null;
  balcony: boolean | null;
  bathtub: boolean | null;
  residential_kitchen: boolean | null;
  elevator: boolean | null;
  building_type: string;
  description: string | null;
  image_url: string | null;
  fingerprint: string | null;
  first_seen: string;
  status: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Listing data and features only. Workflow fields (status, is_favorite,
 * first_seen) are left to column defaults on insert and are never touched by
 * an upsert, so re-receiving a listing cannot reset them.
 */
export type ApartmentInsert = Omit<
  ApartmentRow,
  "id" | "first_seen" | "status" | "is_favorite" | "created_at" | "updated_at"
>;

export type ApartmentUpdate = Partial<Pick<ApartmentRow, "status" | "is_favorite">>;

/** An apartment row with the received time of its email joined in. */
export type ApartmentWithEmailRow = ApartmentRow & {
  emails: { received_at: string } | null;
};

export type Database = {
  public: {
    Tables: {
      emails: {
        Row: EmailRow;
        Insert: EmailInsert;
        Update: EmailUpdate;
        Relationships: [];
      };
      apartments: {
        Row: ApartmentRow;
        Insert: ApartmentInsert;
        Update: ApartmentUpdate;
        Relationships: [
          {
            foreignKeyName: "apartments_email_id_fkey";
            columns: ["email_id"];
            isOneToOne: false;
            referencedRelation: "emails";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

export type Db = SupabaseClient<Database>;
