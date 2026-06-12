import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FolderOpen, ExternalLink } from "lucide-react";

interface Props {
  sessionId: string | null;
  programmeId: string | null;
}

const ProgrammeContextBanner = ({ sessionId, programmeId }: Props) => {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!programmeId) {
      setName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("programmes")
        .select("name")
        .eq("id", programmeId)
        .maybeSingle();
      if (!cancelled) setName(data?.name ?? null);
    })();
    return () => { cancelled = true; };
  }, [programmeId, sessionId]);

  if (!programmeId || !name) return null;

  return (
    <Link
      to={`/consultant/programmes/${programmeId}`}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-elevated border border-border rounded-md text-body-sm text-foreground-secondary hover:text-foreground hover:border-border-accent/60 transition-colors w-fit"
    >
      <FolderOpen className="w-3.5 h-3.5 text-accent-teal" />
      <span>Part of <span className="text-foreground font-medium">{name}</span></span>
      <ExternalLink className="w-3 h-3" />
    </Link>
  );
};

export default ProgrammeContextBanner;
