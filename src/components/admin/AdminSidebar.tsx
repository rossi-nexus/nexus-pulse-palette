import { NavLink, Link } from "react-router-dom";
import { Tags, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/admin/ontology", icon: Tags, label: "Ontology" },
];

const AdminSidebar = () => {
  return (
    <aside className="h-full w-[240px] bg-elevated border-r border-border flex flex-col shrink-0">
      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-2.5 mx-2 mt-3 rounded-md text-xs font-medium text-foreground-secondary hover:bg-surface/60 hover:text-foreground transition-colors border border-border"
        title="Switch to user workspace"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to user workspace
      </Link>

      <div className="px-2 mt-2 mb-2">
        <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-secondary px-2 py-1.5">
          Admin workspace
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.to} className="px-2 mb-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-surface text-foreground font-semibold"
                      : "text-foreground hover:bg-surface/60",
                  )
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
