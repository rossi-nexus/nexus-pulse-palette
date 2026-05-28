import { useNavigate } from "react-router-dom";
import { List as ListIcon, Map as MapIcon, RefreshCw } from "lucide-react";

import { useActorsMap } from "@/hooks/useActorsMap";
import { ActorsMap } from "@/components/map/ActorsMap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ActorsMapPage = () => {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useActorsMap();

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-elevated/40 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-h2 font-semibold text-foreground">Actors</h1>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => navigate("/actors")}
                className="px-3 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-surface/60 transition-colors flex items-center gap-1.5"
              >
                <ListIcon className="w-3.5 h-3.5" />
                List
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium bg-surface text-foreground border-l border-border flex items-center gap-1.5"
                disabled
              >
                <MapIcon className="w-3.5 h-3.5" />
                Map
              </button>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        {error && (
          <div className="mt-2 text-body-sm text-destructive">Error: {error.message}</div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-4">
        <ActorsMap actors={data} viewStorageKey="actorsMapView" />
      </div>
    </div>
  );
};

export default ActorsMapPage;
