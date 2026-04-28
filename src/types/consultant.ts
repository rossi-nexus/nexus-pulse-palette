// Phase 6.5.5a: consultant workspace shared types.

export type ConsultantRoute = "programmes" | "verification" | "analytics";
export type WorkspaceContext = "user" | "consultant";

export interface ManagedProgramme {
  id: string;
  name: string;
  description: string | null;
  client_org: string | null;
  status: "active" | "archived";
  role: "owner" | "consultant";
  member_count: number;
  session_count: number;
}
