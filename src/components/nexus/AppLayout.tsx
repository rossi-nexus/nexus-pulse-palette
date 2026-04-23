import { Routes, Route, Navigate } from "react-router-dom";
import TopBar from "./TopBar";
import SidebarNav from "./SidebarNav";
import PipelineView from "./PipelineView";
import ActorsPlaceholder from "@/pages/ActorsPlaceholder";
import ActorProfilePlaceholder from "@/pages/ActorProfilePlaceholder";
import AdminPlaceholder from "@/pages/AdminPlaceholder";
import { SessionProvider } from "@/contexts/SessionContext";

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
              <Route path="/actors" element={<ActorsPlaceholder />} />
              <Route path="/actors/:id" element={<ActorProfilePlaceholder />} />
              <Route path="/admin" element={<AdminPlaceholder />} />
            </Routes>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
};

export default AppLayout;
