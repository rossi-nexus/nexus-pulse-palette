import { BarChart3 } from "lucide-react";

const AnalyticsPlaceholder = () => (
  <div className="flex items-center justify-center h-full bg-background">
    <div className="text-center">
      <BarChart3 className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
      <h2 className="text-lg font-medium mb-2 text-foreground">Programme analytics</h2>
      <p className="text-foreground-muted text-sm">
        Coming soon — Phase 6.5.5c
      </p>
    </div>
  </div>
);

export default AnalyticsPlaceholder;
