import type { Database } from "@/integrations/supabase/types";

export type ProgrammeStatus = "active" | "archived";
export type ProgrammeRole = "owner" | "consultant" | "viewer";

export type Programme = Database["public"]["Tables"]["programmes"]["Row"];
export type ProgrammeMember = Database["public"]["Tables"]["programme_members"]["Row"];

export interface ProgrammeMemberWithUser extends ProgrammeMember {
  user_email?: string | null;
  user_name?: string | null;
}

export interface ProgrammeListItem {
  id: string;
  name: string;
  status: ProgrammeStatus;
  role: ProgrammeRole;
}
