import { Settings, Lock } from "lucide-react";
import { useSessionContext } from "@/contexts/SessionContext";

const AdminPlaceholder = () => {
  const { isAdmin } = useSessionContext();

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
          <h2 className="text-lg font-medium mb-2 text-foreground">Not authorized</h2>
          <p className="text-foreground-muted text-sm">
            You need admin access to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <Settings className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
        <h2 className="text-lg font-medium mb-2 text-foreground">Admin Dashboard</h2>
        <p className="text-foreground-muted text-sm">
          Database management, validation queue, ontology tools.
          <br />
          Coming soon.
        </p>
      </div>
    </div>
  );
};

export default AdminPlaceholder;
