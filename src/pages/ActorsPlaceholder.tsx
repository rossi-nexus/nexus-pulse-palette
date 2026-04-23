import { Database } from "lucide-react";

const ActorsPlaceholder = () => (
  <div className="flex items-center justify-center h-full bg-background">
    <div className="text-center">
      <Database className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
      <h2 className="text-lg font-medium mb-2 text-foreground">Actors</h2>
      <p className="text-foreground-muted text-sm">
        Browse your actor collection and the main database.
        <br />
        Coming soon.
      </p>
    </div>
  </div>
);

export default ActorsPlaceholder;
