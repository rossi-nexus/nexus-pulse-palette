import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const P36DiagnosticPage = () => {
  const { user, loading } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="p-8 text-foreground-muted">Loading…</div>;
  if (!user) return <div className="p-8 text-foreground-muted">Sign in required.</div>;

  const runDiagnostic = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    const { data, error } = await supabase.rpc("fn_p36_diagnostic" as never);
    setRunning(false);
    if (error) {
      setError(error.message);
      toast.error(`Diagnostic failed: ${error.message}`);
      return;
    }
    setResult(data);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">P36 Diagnostic — Read-only</h1>
      <p className="text-foreground-muted text-sm">
        Calls a SECURITY INVOKER function that attempts a programmes INSERT as the calling user
        and immediately rolls back. Captures session context (auth.uid, role, JWT claims) and
        returns the result as JSON. No persistent changes are made.
      </p>
      <Button onClick={runDiagnostic} disabled={running}>
        {running ? "Running…" : "Run diagnostic"}
      </Button>
      {error && (
        <pre className="p-4 bg-elevated border border-destructive/40 rounded text-sm text-destructive whitespace-pre-wrap">
          {error}
        </pre>
      )}
      {result !== null && (
        <pre className="p-4 bg-elevated border border-border rounded text-xs text-foreground whitespace-pre-wrap overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default P36DiagnosticPage;
