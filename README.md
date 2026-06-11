# NEXUS — Pulse Palette

AI-assisted supplier discovery and verification platform for Nordic defence & security programmes. Users describe a capability need in natural language; the system interprets it into procurement roles and constraints, searches and enriches a registry of companies ("actors") from official sources (Brønnøysund, CVR, PRH), the web, and documents, and routes results through consultant verification and admin ontology workflows.

## Stack

- **Frontend:** Vite + React 18 + TypeScript, Tailwind, shadcn/ui, react-router, TanStack Query, Leaflet (maps), Recharts (analytics)
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions on Deno)
- **AI:** Lovable AI gateway (Gemini) from edge functions

## Development

```sh
npm install
npm run dev        # local dev server
npm run build      # production build
npx vitest run     # unit tests
npm run lint       # eslint
```

Environment (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. The publishable (anon) key is safe to expose; access control is enforced by RLS.

Optional dev-only flag: `VITE_ALLOW_AUTH_BYPASS=true` skips login **in dev builds only** (see `src/lib/devAuthBypass.ts`).

## Structure

- `src/pages` — top-level routes; user app under `AppLayout`, plus `/consultant/*` and `/admin/*` areas (all lazy-loaded)
- `src/components/nexus` — core pipeline UI (need input → interpretation → search → analysis)
- `src/hooks` — data access hooks wrapping Supabase
- `supabase/functions` — edge functions (AI enrichment, registry adapters, admin ops). Shared SSRF guard in `_shared/urlGuard.ts` — use `safeFetch` for any user-supplied URL.
- `supabase/migrations` — schema + RLS policies

## Roles

`user` (search & analyse), `consultant` (verification workspace, programme analytics), `admin` (user management, ontology queue, registry import).
