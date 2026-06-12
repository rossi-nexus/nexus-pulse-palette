import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import logo from "@/assets/logo_aexs.png";
import bgLogin from "@/assets/bg-login.jpg";
import { AtmosphereBackground } from "./AtmosphereBackground";

const LoginPage = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <AtmosphereBackground image={bgLogin} variant="hero" className="h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm px-8">
        <div className="flex flex-col items-center gap-6 mb-8">
          <img src={logo} alt="æXs" className="h-10" />
          <div className="text-center">
            <h1 className="text-h2 text-foreground">NEXUS</h1>
            <p className="text-body-sm text-foreground-muted mt-1">
              Enable Access. Leverage Excess.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-label uppercase text-foreground-muted block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-card border border-border bg-surface text-body-sm text-foreground placeholder:text-foreground-muted outline-none focus:border-border-accent focus:ring-1 focus:ring-ring"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-label uppercase text-foreground-muted block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-card border border-border bg-surface text-body-sm text-foreground placeholder:text-foreground-muted outline-none focus:border-border-accent focus:ring-1 focus:ring-ring"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Lock className="w-3.5 h-3.5" />
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
