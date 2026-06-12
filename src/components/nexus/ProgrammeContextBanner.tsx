import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FolderOpen, ExternalLink } from "lucide-react";
import CalloutRow from "./CalloutRow";

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
    <CalloutRow
      variant="info"
      icon={FolderOpen}
      action={
        <Link
          to={`/consultant/programmes/${programmeId}`}
          className="inline-flex items-center gap-1 text-caption text-accent-teal hover:underline"
        >
          Open <ExternalLink className="w-3 h-3" />
        </Link>
      }
    >
      Part of <span className="text-foreground font-medium">{name}</span>
    </CalloutRow>
  );
};

export default ProgrammeContextBanner;
