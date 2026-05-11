import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  Programme,
  ProgrammeMemberWithUser,
  ProgrammeRole,
  ProgrammeListItem,
} from "@/types/programme";

interface ProgrammeSession {
  id: string;
  name: string | null;
  user_id: string;
  updated_at: string;
  status: string;
}

interface UseProgrammeResult {
  programme: Programme | null;
  members: ProgrammeMemberWithUser[];
  sessions: ProgrammeSession[];
  currentUserRole: ProgrammeRole | null;
  isOwner: boolean;
  loading: boolean;
  notFound: boolean;
  refresh: () => Promise<void>;
}

export function useProgramme(programmeId: string | undefined): UseProgrammeResult {
  const { user } = useAuth();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [members, setMembers] = useState<ProgrammeMemberWithUser[]>([]);
  const [sessions, setSessions] = useState<ProgrammeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!programmeId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);

    try {
      const { data: prog, error: progErr } = await supabase
        .from("programmes")
        .select("*")
        .eq("id", programmeId)
        .maybeSingle();
      if (progErr) throw progErr;

      if (!prog) {
        setProgramme(null);
        setMembers([]);
        setSessions([]);
        setNotFound(true);
        return;
      }

      setProgramme(prog as Programme);

      const { data: memberRows, error: memErr } = await supabase
        .from("programme_members")
        .select("*")
        .eq("programme_id", programmeId);
      if (memErr) throw memErr;

      const memberList: ProgrammeMemberWithUser[] = (memberRows ?? []) as ProgrammeMemberWithUser[];

      if (memberList.length > 0) {
        const userIds = memberList.map((m) => m.user_id);
        const { data: userRows, error: userErr } = await supabase
          .from("users")
          .select("id, email, name")
          .in("id", userIds);
        if (userErr) throw userErr;
        const userMap = new Map<string, { email: string; name: string }>();
        for (const u of userRows ?? []) userMap.set(u.id, { email: u.email, name: u.name });
        for (const m of memberList) {
          const u = userMap.get(m.user_id);
          m.user_email = u?.email ?? null;
          m.user_name = u?.name ?? null;
        }
      }
      setMembers(memberList);

      const { data: sessRows, error: sessErr } = await supabase
        .from("search_sessions")
        .select("id, name, user_id, updated_at, status")
        .eq("programme_id", programmeId)
        .order("updated_at", { ascending: false });
      if (sessErr) throw sessErr;
      setSessions((sessRows ?? []) as ProgrammeSession[]);
    } catch (e: any) {
      toast.error(`Failed to load programme: ${e?.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [programmeId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const currentUserRole: ProgrammeRole | null =
    (members.find((m) => m.user_id === user?.id)?.role as ProgrammeRole | undefined) ?? null;

  return {
    programme,
    members,
    sessions,
    currentUserRole,
    isOwner: currentUserRole === "owner",
    loading,
    notFound,
    refresh: load,
  };
}

export function useProgrammeList() {
  const { user } = useAuth();
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProgrammes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: memberRows, error: memErr } = await supabase
        .from("programme_members")
        .select("programme_id, role")
        .eq("user_id", user.id);
      if (memErr) throw memErr;

      const ids = (memberRows ?? []).map((r) => r.programme_id);
      if (ids.length === 0) {
        setProgrammes([]);
        return;
      }

      const { data: progRows, error: progErr } = await supabase
        .from("programmes")
        .select("id, name, status")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      if (progErr) throw progErr;

      const roleMap = new Map<string, string>();
      for (const r of memberRows ?? []) roleMap.set(r.programme_id, r.role);

      const list: ProgrammeListItem[] = (progRows ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status as ProgrammeListItem["status"],
        role: (roleMap.get(p.id) ?? "viewer") as ProgrammeListItem["role"],
      }));
      setProgrammes(list);
    } catch (e: any) {
      toast.error(`Failed to load programmes: ${e?.message ?? "Unknown error"}`);
      setProgrammes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { programmes, loading, refresh: load };
}
