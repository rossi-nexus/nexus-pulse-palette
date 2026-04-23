import { useParams, Link } from "react-router-dom";
import { User, ArrowLeft } from "lucide-react";

const ActorProfilePlaceholder = () => {
  const { id } = useParams();
  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <User className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
        <h2 className="text-lg font-medium mb-2 text-foreground">Actor Profile</h2>
        <p className="text-foreground-muted text-sm mb-4">
          Profile view for actor <span className="font-mono">{id}</span> — coming soon.
        </p>
        <Link
          to="/actors"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to actors
        </Link>
      </div>
    </div>
  );
};

export default ActorProfilePlaceholder;
