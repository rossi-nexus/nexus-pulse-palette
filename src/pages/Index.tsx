import { useAuth } from "@/hooks/useAuth";
import { Routes, Route } from "react-router-dom";
import AppLayout from "@/components/nexus/AppLayout";
import ConsultantLayout from "@/pages/ConsultantLayout";
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

  return (
    <Routes>
      <Route path="/consultant/*" element={<ConsultantLayout />} />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
};

export default Index;
