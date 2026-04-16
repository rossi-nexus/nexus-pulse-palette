import { cn } from "@/lib/utils";

interface ExampleSearchCardProps {
  label: string;
  onClick: () => void;
}

const ExampleSearchCard = ({ label, onClick }: ExampleSearchCardProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-5 py-4 rounded-card",
        "bg-surface border border-border",
        "hover:border-border-accent transition-colors duration-200",
        "cursor-pointer group"
      )}
    >
      <span className="text-label text-foreground-secondary group-hover:text-foreground transition-colors">
        {label}
      </span>
    </button>
  );
};

export default ExampleSearchCard;
