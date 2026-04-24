import {
  type RegistryAdapter,
  jsonResponse,
  titleCase,
} from "./types.ts";

interface PrhAddress {
  street?: string;
  postCode?: string;
  city?: string;
  country?: string;
  source?: number;
  version?: number;
  registrationDate?: string;
  endDate?: string | null;
}

interface PrhNamedEntry {
  name?: string;
  endDate?: string | null;
  source?: number;
  registrationDate?: string;
}

interface PrhResult {
  businessId: string;
  name: string;
  registrationDate?: string;
  companyForm?: string;
  names?: PrhNamedEntry[];
  auxiliaryNames?: PrhNamedEntry[];
  addresses?: PrhAddress[];
  companyForms?: Array<{ type: string; endDate?: string | null }>;
  businessLines?: Array<{ description?: string; endDate?: string | null }>;
}

interface PrhResponse {
  totalResults?: number;
  resultsFrom?: number;
  results?: PrhResult[];
}

const UA = "Mozilla/5.0 (compatible; NEXUS/1.0; +https://nexus.app)";

function isActive<T extends { endDate?: string | null }>(entry: T): boolean {
  return !entry.endDate;
}

function pickActiveAddress(addresses?: PrhAddress[]): PrhAddress | null {
  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  const active = addresses.filter(isActive);
  const pool = active.length > 0 ? active : addresses;
  const sorted = [...pool].sort((a, b) => {
    if ((a.source ?? 99) !== (b.source ?? 99)) {
      return (a.source ?? 99) - (b.source ?? 99);
    }
    return (b.registrationDate ?? "").localeCompare(a.registrationDate ?? "");
  });
  return sorted[0] ?? null;
}

function pickActiveName(result: PrhResult): string {
  const candidates = Array.isArray(result.names) ? result.names.filter(isActive) : [];
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) =>
      (b.registrationDate ?? "").localeCompare(a.registrationDate ?? ""),
    );
    return (sorted[0].name ?? result.name ?? "").trim();
  }
  return (result.name ?? "").trim();
}

function buildProposalFromResult(result: PrhResult) {
  const addr = pickActiveAddress(result.addresses);
  const street = addr?.street?.trim() || null;
  const city = addr?.city ? titleCase(addr.city.trim()) : null;
  const businessId = (result.businessId ?? "").trim();
  return {
    actor_name: pickActiveName(result) || null,
    org_number: businessId || null,
    org_number_display: businessId || null,
    street_address: street,
    city,
    region: null as string | null,
    country: "Finland",
    actor_website: null as string | null,
  };
}

async function fetchPrh(url: string): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
  } catch {
    return jsonResponse(
      { error: "Could not reach PRH. Try again later." },
      502,
    );
  }

  if (resp.status === 404) {
    return jsonResponse({ error: "No entity found in PRH." }, 404);
  }
  if (resp.status === 429) {
    return jsonResponse(
      { error: "PRH rate limit reached. Please wait a moment and try again." },
      429,
    );
  }
  if (resp.status >= 500) {
    return jsonResponse(
      { error: `PRH error (HTTP ${resp.status}). Try again later.` },
      502,
    );
  }
  if (!resp.ok) {
    return jsonResponse(
      { error: `Unexpected PRH response (HTTP ${resp.status}).` },
      502,
    );
  }
  return resp;
}

function normalizeYTunnus(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

export const prhAdapter: RegistryAdapter = {
  id: "prh",
  name: "PRH (Finland)",
  country_codes: ["fi", "finland", "suomi"],

  validateOrgNumber(raw: string) {
    const normalized = normalizeYTunnus(raw);
    if (!normalized) {
      return {
        ok: false,
        error:
          "Finnish Business ID (Y-tunnus) must be 7 digits + check digit (e.g. 1234567-8).",
      };
    }
    return { ok: true, digits: normalized };
  },

  async lookupByOrgNumber(orgNumber: string): Promise<Response> {
    const url = `https://avoindata.prh.fi/bis/v1/${encodeURIComponent(orgNumber)}`;
    const resp = await fetchPrh(url);

    if (
      resp.headers.get("Content-Type")?.includes("application/json") &&
      resp.status !== 200
    ) {
      return resp;
    }

    let body: PrhResponse;
    try {
      body = (await resp.json()) as PrhResponse;
    } catch {
      return jsonResponse({ error: "Unexpected response shape from PRH." }, 502);
    }

    const result =
      Array.isArray(body.results) && body.results.length > 0 ? body.results[0] : null;
    if (!result) {
      return jsonResponse({ error: "No entity found in PRH." }, 404);
    }

    const proposal = buildProposalFromResult(result);
    return jsonResponse({
      mode: "single",
      proposal,
      source: { registry: "PRH", source_url: url },
    });
  },

  async lookupByName(name: string): Promise<Response> {
    const url = `https://avoindata.prh.fi/bis/v1?name=${encodeURIComponent(name)}&maxResults=10`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
      });
    } catch {
      return jsonResponse(
        { error: "Could not reach PRH. Try again later." },
        502,
      );
    }

    // Name search: 404 means "no matches" — return empty candidates, not an error.
    if (resp.status === 404) {
      return jsonResponse({ mode: "candidates", candidates: [], total_hits: 0 });
    }
    if (resp.status === 429) {
      return jsonResponse(
        { error: "PRH rate limit reached. Please wait a moment and try again." },
        429,
      );
    }
    if (!resp.ok) {
      return jsonResponse(
        { error: `PRH error (HTTP ${resp.status}). Try again later.` },
        502,
      );
    }

    let body: PrhResponse;
    try {
      body = (await resp.json()) as PrhResponse;
    } catch {
      return jsonResponse({ error: "Unexpected response shape from PRH." }, 502);
    }

    const results = Array.isArray(body.results) ? body.results : [];
    const candidates = results
      .map((r) => {
        const businessId = (r.businessId ?? "").trim();
        const addr = pickActiveAddress(r.addresses);
        return {
          actor_name: pickActiveName(r),
          org_number: businessId,
          org_number_display: businessId,
          city: addr?.city ? titleCase(addr.city.trim()) : null,
          organisasjonsform: r.companyForm ?? null,
        };
      })
      .filter((c) => c.actor_name && c.org_number);

    return jsonResponse({
      mode: "candidates",
      candidates,
      total_hits: body.totalResults ?? candidates.length,
    });
  },
};
