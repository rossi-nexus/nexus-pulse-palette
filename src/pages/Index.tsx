import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/nexus/AppShell";
import LoginPage from "@/components/nexus/LoginPage";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-foreground-muted text-body-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <AppShell />;
};

export default Index;
