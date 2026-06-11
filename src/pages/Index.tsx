import { lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Routes, Route } from "react-router-dom";
import { AUTH_BYPASS_ACTIVE } from "@/lib/devAuthBypass";
import LoginPage from "@/components/nexus/LoginPage";

// Route-level code splitting: each layout (and everything it imports) becomes
// its own chunk, so e.g. admin/consultant code never loads for regular users.
const AppLayout = lazy(() => import("@/components/nexus/AppLayout"));
const ConsultantLayout = lazy(() => import("@/pages/ConsultantLayout"));
const AdminLayout = lazy(() => import("@/pages/AdminLayout"));

const RouteFallback = () => (
  <div className="h-screen bg-background flex items-center justify-center">
    <div className="text-foreground-muted text-body-sm">Loading...</div>
  </div>
);

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-foreground-muted text-body-sm">Loading...</div>
      </div>
    );
  }

  if (!AUTH_BYPASS_ACTIVE && !user) return <LoginPage />;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/consultant/*" element={<ConsultantLayout />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </Suspense>
  );
};

export default Index;
