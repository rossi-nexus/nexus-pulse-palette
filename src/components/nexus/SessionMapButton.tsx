import { lazy, Suspense, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Lazy: keeps leaflet out of the main bundle — only loads when the map dialog opens.
const ActorsMap = lazy(() =>
  import("@/components/map/ActorsMap").then((m) => ({ default: m.ActorsMap }))
);
import { useSessionActorsMap } from "@/hooks/useSessionActorsMap";

import { useSessionContext } from "@/contexts/SessionContext";

interface SessionMapButtonProps {
  /** Storage key prefix so each step has its own persisted view if reused. */
  variant: "search" | "analysis" | "database-check";
}

/**
 * Renders a "Session map" toggle button. When clicked, opens a dialog showing all
 * personal-collection actors saved from this pipeline session, plotted on a map.
 * Personal-collection rows are only created by Step 5 (saveToPersonalSpace), so
 * the map will be empty until Step 5 has run at least once for the session.
 */
export function SessionMapButton({ variant }: SessionMapButtonProps) {
  const { sessionId } = useSessionContext();
  const [open, setOpen] = useState(false);
  const { data, loading } = useSessionActorsMap(open ? sessionId : null);

  if (!sessionId) return null;

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="gap-2 text-foreground-muted hover:text-foreground"
      >
        <MapIcon className="w-3.5 h-3.5" />
        Session map
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[90vw] h-[80vh] flex flex-col p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>Session map</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-foreground-muted text-body-sm">
              Loading…
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-foreground-muted text-body-sm">
                  Loading…
                </div>
              }
            >
              <ActorsMap
                actors={data}
                viewStorageKey={`sessionMapView:${variant}:${sessionId}`}
                showFilters={false}
                hideProfileLink
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
