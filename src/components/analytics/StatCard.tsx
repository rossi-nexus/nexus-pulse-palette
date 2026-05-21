interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "success";
}

export const StatCard = ({ label, value, hint, tone = "default" }: StatCardProps) => {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
      ? "text-success"
      : "text-foreground";
  return (
    <div className="bg-surface border border-border rounded-md p-4 space-y-1">
      <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-muted">
        {label}
      </div>
      <div className={`text-2xl font-light ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-foreground-muted">{hint}</div>}
    </div>
  );
};

export default StatCard;
