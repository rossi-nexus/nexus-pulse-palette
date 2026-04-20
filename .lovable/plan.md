

## Quick fix — Role progress boxes show full role name

**Problem:** Boxes truncate role names to one line (~10 chars). "Prime Systems Integrator & C2 Provider" becomes "Prime Syst...".

**Constraint:** All 5 boxes must still fit on one row in the Step 3 header (no wrapping to a second row of boxes), so we widen modestly and let the *text* wrap to up to 3 lines.

### Proposal

In `src/components/nexus/RoleProgressBox.tsx`:

1. **Widen each box** so headlines breathe:
   - `min-w-[120px]` → `min-w-[140px] max-w-[180px]`
   - With 5 roles + gap-2 in a `~75%`-width main column at 1690px viewport, 5 × 180px + gaps fits comfortably.

2. **Allow the role name to wrap to up to 3 lines** instead of single-line truncation:
   - Remove `truncate max-w-[100px]`.
   - Replace with line-clamp-3 + balanced wrapping:
     ```
     "text-caption font-medium leading-tight text-center line-clamp-3 [text-wrap:balance] break-words"
     ```
   - `line-clamp-3` keeps very long names (rare) bounded to 3 lines so box heights stay aligned.
   - `text-wrap:balance` distributes words evenly across lines (e.g. "Prime Systems / Integrator & / C2 Provider") instead of one long + one orphan.
   - `text-center` already implied by parent `items-center`; keep alignment consistent.

3. **Add `tabular-nums` / keep counts row unchanged** — counts stay on their own line under the wrapped title.

4. **Tooltip fallback** — add `title={result.role_name}` on the `<button>` so the full name is always visible on hover, even in the rare case it exceeds 3 lines.

### Visual result

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│      ↻       │  │      ○       │  │      ○       │
│ Prime Systems│  │   Coastal    │  │  Unmanned    │
│ Integrator & │  │ Surveillance │  │   Aerial     │
│  C2 Provider │  │   Sensors    │  │   Systems    │
│   0 found    │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Scope

- **Only file changed:** `src/components/nexus/RoleProgressBox.tsx`
- **No** changes to layout, hooks, edge functions, types, or other steps.

