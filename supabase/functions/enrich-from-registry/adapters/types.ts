// Shared types for registry adapters

export interface RegistryAdapter {
  id: "brreg" | "cvr";
  name: string;
  country_codes: string[]; // lowercase
  validateOrgNumber(raw: string): { ok: true; digits: string } | { ok: false; error: string };
  lookupByOrgNumber(digits: string): Promise<Response>;
  lookupByName(name: string): Promise<Response>;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function titleCase(s: string): string {
  if (!s) return s;
  if (s === s.toUpperCase()) {
    return s
      .toLowerCase()
      .split(/(\s+|-)/)
      .map((part) =>
        /^\s+$/.test(part) || part === "-"
          ? part
          : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join("");
  }
  return s;
}

export function sanitizeWebsite(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}
