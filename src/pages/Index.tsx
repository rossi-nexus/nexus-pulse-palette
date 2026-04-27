import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/nexus/AppLayout";
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

  // Login temporarily disabled — render app directly.
  // To restore: uncomment the line below.
  // if (!user) return <LoginPage />;

  return <AppLayout />;
};

export default Index;
