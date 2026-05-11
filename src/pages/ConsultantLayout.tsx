import { Routes, Route, Navigate } from "react-router-dom";
import TopBar from "@/components/nexus/TopBar";
import ConsultantSidebar from "@/components/consultant/ConsultantSidebar";
import ConsultantProgrammesPage from "@/pages/consultant/ConsultantProgrammesPage";
import VerificationWorkspacePage from "@/pages/consultant/VerificationWorkspacePage";
import OnboardingPage from "@/pages/consultant/OnboardingPage";
import ProgrammeAnalyticsPage from "@/pages/consultant/ProgrammeAnalyticsPage";
import ProgrammeView from "@/pages/ProgrammeView";
import { useConsultantAccess } from "@/hooks/useConsultantAccess";
import { SessionProvider } from "@/contexts/SessionContext";

const ConsultantLayout = () => {
  const { hasAccess, loading } = useConsultantAccess();

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-foreground-muted text-sm">Loading workspace…</div>
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/pipeline" replace />;
  }

  return (
    <SessionProvider>
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <ConsultantSidebar />
          <div className="flex-1 overflow-hidden min-w-0">
            <Routes>
              <Route index element={<Navigate to="programmes" replace />} />
              <Route path="programmes" element={<ConsultantProgrammesPage />} />
              <Route path="verification" element={<VerificationWorkspacePage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="analytics" element={<ProgrammeAnalyticsPage />} />
              <Route path="programmes/:id" element={<ProgrammeView />} />
            </Routes>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
};

export default ConsultantLayout;
