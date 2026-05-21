import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import TopBar from "./TopBar";
import SidebarNav from "./SidebarNav";
import PipelineView from "./PipelineView";
import ActorsView from "./ActorsView";
import ActorProfile from "@/pages/ActorProfile";
import { SessionProvider } from "@/contexts/SessionContext";

/**
 * A4 Area 2 — Canonical programme route is /consultant/programmes/:id.
 * Legacy any-auth /programmes/:id redirects (preserving search + hash).
 */
const LegacyProgrammeRedirect = () => {
  const { id } = useParams<{ id: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/consultant/programmes/${id ?? ""}${search}${hash}`} replace />;
};

const AppLayout = () => {
  return (
    <SessionProvider>
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <SidebarNav />
          <div className="flex-1 overflow-hidden min-w-0">
            <Routes>
              <Route path="/" element={<Navigate to="/pipeline" replace />} />
              <Route path="/pipeline" element={<PipelineView />} />
              <Route path="/actors" element={<ActorsView />} />
              <Route path="/actors/:id" element={<ActorProfile />} />
              {/* A4 Area 2: redirect legacy any-auth programme URLs to canonical consultant path. */}
              <Route path="/programmes/:id" element={<LegacyProgrammeRedirect />} />
              {/* A4 Area 1: /admin is gated by AdminLayout (mounted in Index). */}
            </Routes>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
};

export default AppLayout;
