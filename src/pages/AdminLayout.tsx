import { Routes, Route, Navigate } from "react-router-dom";
import TopBar from "@/components/nexus/TopBar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import OntologyQueuePage from "@/pages/admin/OntologyQueuePage";
import RegistryImportPage from "@/pages/admin/RegistryImportPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import UserManagementPage from "@/pages/admin/UserManagementPage";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { SessionProvider } from "@/contexts/SessionContext";

const AdminLayout = () => {
  const { hasAccess, loading } = useAdminAccess();

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
          <AdminSidebar />
          <div className="flex-1 overflow-hidden min-w-0">
            <Routes>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="ontology" element={<OntologyQueuePage />} />
              <Route path="registry-import" element={<RegistryImportPage />} />
            </Routes>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
};

export default AdminLayout;
