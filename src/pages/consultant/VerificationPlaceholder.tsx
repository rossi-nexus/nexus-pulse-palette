import { ShieldCheck } from "lucide-react";

const VerificationPlaceholder = () => (
  <div className="flex items-center justify-center h-full bg-background">
    <div className="text-center">
      <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
      <h2 className="text-lg font-medium mb-2 text-foreground">Verification workspace</h2>
      <p className="text-foreground-muted text-sm">
        Coming soon — Phase 6.5.5b
      </p>
    </div>
  </div>
);

export default VerificationPlaceholder;
