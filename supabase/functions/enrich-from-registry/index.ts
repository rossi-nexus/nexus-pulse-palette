import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BrregAddress {
  adresse?: string[] | null;
  poststed?: string | null;
  postnummer?: string | null;
  kommune?: string | null;
  land?: string | null;
}

interface BrregEntity {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  hjemmeside?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  slettedato?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function titleCase(s: string): string {
  if (!s) return s;
  // If string is fully uppercase (BRREG often uppercases "OSLO"), titlecase it
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

function pickAddress(entity: BrregEntity): BrregAddress | null {
  return entity.forretningsadresse ?? entity.postadresse ?? null;
}

function mapCountry(land?: string | null): string | null {
  if (!land) return null;
  const trimmed = land.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "norge") return "Norway";
  return trimmed;
}

function sanitizeWebsite(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Looks like a hostname (has a dot, no spaces)
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function formatOrgNumberDisplay(org: string): string {
  const digits = org.replace(/\D/g, "");
  if (digits.length !== 9) return org;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

function buildProposalFromEntity(entity: BrregEntity) {
  const addr = pickAddress(entity);
  const street =
    addr?.adresse && Array.isArray(addr.adresse) && addr.adresse.length > 0
      ? addr.adresse.map((a) => (a ?? "").trim()).filter(Boolean).join(", ")
      : null;
  const city = addr?.poststed ? titleCase(addr.poststed.trim()) : null;
  const region = addr?.kommune ? titleCase(addr.kommune.trim()) : null;
  const country = mapCountry(addr?.land);
  const orgRaw = (entity.organisasjonsnummer ?? "").replace(/\D/g, "");
  return {
    actor_name: (entity.navn ?? "").trim() || null,
    org_number: orgRaw || null,
    org_number_display: orgRaw ? formatOrgNumberDisplay(orgRaw) : null,
    street_address: street && street.length > 0 ? street : null,
    city,
    region,
    country,
    actor_website: sanitizeWebsite(entity.hjemmeside),
  };
}

async function fetchBrregByOrgNumber(orgNumber: string): Promise<Response> {
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; NEXUS/1.0; +https://nexus.app)",
      },
    });
  } catch {
    return jsonResponse(
      { error: "Could not reach the BRREG registry. Try again later." },
      502,
    );
  }

  if (resp.status === 404) {
    return jsonResponse({ error: "No entity found for that org number." }, 404);
  }
  if (resp.status === 410) {
    return jsonResponse(
      { error: "This entity has been removed from the registry." },
      404,
    );
  }
  if (resp.status >= 500) {
    return jsonResponse(
      { error: `BRREG registry error (HTTP ${resp.status}). Try again later.` },
      502,
    );
  }
  if (!resp.ok) {
    return jsonResponse(
      { error: `Unexpected BRREG response (HTTP ${resp.status}).` },
      502,
    );
  }

  let entity: BrregEntity;
  try {
    entity = (await resp.json()) as BrregEntity;
  } catch {
    return jsonResponse(
      { error: "Unexpected response shape from BRREG." },
      502,
    );
  }

  if (entity.slettedato) {
    return jsonResponse(
      { error: "This entity has been removed from the registry." },
      404,
    );
  }

  const proposal = buildProposalFromEntity(entity);
  return jsonResponse({
    mode: "single",
    proposal,
    source: {
      registry: "BRREG",
      source_url: url,
    },
  });
}

async function fetchBrregByName(name: string): Promise<Response> {
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(
    name,
  )}&size=10`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; NEXUS/1.0; +https://nexus.app)",
      },
    });
  } catch {
    return jsonResponse(
      { error: "Could not reach the BRREG registry. Try again later." },
      502,
    );
  }

  if (resp.status >= 500) {
    return jsonResponse(
      { error: `BRREG registry error (HTTP ${resp.status}). Try again later.` },
      502,
    );
  }
  if (!resp.ok) {
    return jsonResponse(
      { error: `Unexpected BRREG response (HTTP ${resp.status}).` },
      502,
    );
  }

  let body: {
    _embedded?: { enheter?: BrregEntity[] };
    page?: { totalElements?: number };
  };
  try {
    body = await resp.json();
  } catch {
    return jsonResponse(
      { error: "Unexpected response shape from BRREG." },
      502,
    );
  }

  const enheter = Array.isArray(body._embedded?.enheter)
    ? body._embedded!.enheter!
    : [];
  const candidates = enheter
    .map((e) => {
      const orgRaw = (e.organisasjonsnummer ?? "").replace(/\D/g, "");
      const addr = pickAddress(e);
      return {
        actor_name: (e.navn ?? "").trim(),
        org_number: orgRaw,
        org_number_display: orgRaw ? formatOrgNumberDisplay(orgRaw) : "",
        city: addr?.poststed ? titleCase(addr.poststed.trim()) : null,
        organisasjonsform: e.organisasjonsform?.kode ?? null,
      };
    })
    .filter((c) => c.actor_name && c.org_number);

  return jsonResponse({
    mode: "candidates",
    candidates,
    total_hits: body.page?.totalElements ?? candidates.length,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const mode = (body as { mode?: string }).mode;

    if (mode === "org_number") {
      const raw = (body as { org_number?: unknown }).org_number;
      if (typeof raw !== "string") {
        return jsonResponse({ error: "org_number is required" }, 400);
      }
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 9) {
        return jsonResponse(
          { error: "Norwegian org numbers must be exactly 9 digits." },
          400,
        );
      }
      return await fetchBrregByOrgNumber(digits);
    }

    if (mode === "name") {
      const raw = (body as { name?: unknown }).name;
      if (typeof raw !== "string") {
        return jsonResponse({ error: "name is required" }, 400);
      }
      const trimmed = raw.trim();
      if (trimmed.length < 2) {
        return jsonResponse(
          { error: "Name must be at least 2 characters." },
          400,
        );
      }
      return await fetchBrregByName(trimmed);
    }

    return jsonResponse(
      { error: "mode must be 'org_number' or 'name'" },
      400,
    );
  } catch (err) {
    return jsonResponse(
      { error: `Registry lookup failed: ${(err as Error).message}` },
      500,
    );
  }
});
