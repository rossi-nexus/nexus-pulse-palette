import { Routes, Route, Navigate } from "react-router-dom";
import TopBar from "./TopBar";
import SidebarNav from "./SidebarNav";
import PipelineView from "./PipelineView";
import ActorsView from "./ActorsView";
import ActorProfile from "@/pages/ActorProfile";
import AdminPlaceholder from "@/pages/AdminPlaceholder";
import ProgrammeView from "@/pages/ProgrammeView";
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
              <Route path="/actors" element={<ActorsView />} />
              <Route path="/actors/:id" element={<ActorProfile />} />
              <Route path="/programmes/:id" element={<ProgrammeView />} />
              <Route path="/admin" element={<AdminPlaceholder />} />
            </Routes>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
};

export default AppLayout;
