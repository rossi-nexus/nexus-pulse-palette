import { Info } from "lucide-react";

/**
 * Inline explainer shown once per role in Step 4 when that role contains
 * at least one reference (non-commercial) actor. Subtle blue info styling.
 */
const ReferenceActorInfoBox = () => (
  <div className="flex gap-2 rounded-card border border-accent-blue/30 bg-accent-blue/5 px-3 py-2.5">
    <Info className="w-3.5 h-3.5 text-accent-blue shrink-0 mt-0.5" />
    <p className="text-caption text-foreground-secondary leading-relaxed">
      Public entities and non-commercial organizations (e.g. government agencies,
      research institutes) are included as <span className="text-foreground">reference actors</span>{" "}
      — they are relevant to the context but are not commercially available suppliers.
      They are not deep-analyzed but remain visible for awareness. They carry through
      to Step 5 where they can be saved to your collection.
    </p>
  </div>
);

export default ReferenceActorInfoBox;
