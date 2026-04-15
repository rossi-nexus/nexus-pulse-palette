import { Bot, Send } from "lucide-react";

const AxisSidebar = () => (
  <aside className="w-full h-full bg-elevated border-l border-border flex flex-col">
    {/* Header */}
    <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
      <div className="w-7 h-7 rounded-full bg-gradient-accent-subtle border border-border-accent flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-accent-teal" />
      </div>
      <div className="flex flex-col">
        <span className="text-label uppercase tracking-[0.15em] text-foreground-secondary">
          NEXUS AXIS
        </span>
      </div>
    </div>

    {/* Chat area */}
    <div className="flex-1 overflow-y-auto px-5 py-6">
      <div className="flex flex-col items-start gap-3">
        <div className="bg-surface border border-border rounded-card px-4 py-3 max-w-[90%]">
          <p className="text-body-sm text-foreground-secondary">
            Describe or paste your need. I'll help you structure it for search.
          </p>
        </div>
      </div>
    </div>

    {/* Input area */}
    <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
      <div className="flex items-center gap-2 bg-surface border border-border rounded-card px-4 py-2.5 focus-within:border-border-accent focus-within:ring-1 focus-within:ring-ring transition-colors">
        <input
          type="text"
          placeholder="Ask Axis..."
          className="flex-1 bg-transparent text-body-sm text-foreground placeholder:text-foreground-muted outline-none"
          disabled
        />
        <button
          disabled
          className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-accent-teal transition-colors disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </aside>
);

export default AxisSidebar;
