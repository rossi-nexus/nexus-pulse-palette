import {
  type RegistryAdapter,
  jsonResponse,
  titleCase,
  sanitizeWebsite,
} from "./types.ts";

interface CvrEntity {
  vat?: number | string;
  name?: string;
  address?: string;
  zipcode?: string | number;
  city?: string;
  protected?: boolean;
  phone?: string;
  email?: string;
  fax?: string;
  startdate?: string;
  enddate?: string | null;
  employees?: string | number | null;
  industrycode?: number | string;
  industrydesc?: string;
  companycode?: number | string;
  companydesc?: string;
  creditstartdate?: string;
  // Some endpoints expose homepage / website
  website?: string;
  homepage?: string;
  // Error shape
  error?: string;
  t?: number;
}

function formatCvrDisplay(digits: string): string {
  // 8 digits → "12 34 56 78"
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`;
}

function buildProposalFromCvr(entity: CvrEntity) {
  const orgRaw = String(entity.vat ?? "").replace(/\D/g, "");
  const street = entity.address ? entity.address.trim() : null;
  const city = entity.city ? titleCase(entity.city.trim()) : null;
  const website = sanitizeWebsite(entity.website ?? entity.homepage ?? null);
  return {
    actor_name: (entity.name ?? "").trim() || null,
    org_number: orgRaw || null,
    org_number_display: orgRaw ? formatCvrDisplay(orgRaw) : null,
    street_address: street && street.length > 0 ? street : null,
    city,
    region: null as string | null, // CVR does not expose a kommune-equivalent cleanly
    country: "Denmark",
    actor_website: website,
  };
}

const UA = "NEXUS/1.0 (nexus.app)";

async function fetchCvr(url: string): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
  } catch {
    return jsonResponse(
      { error: "Could not reach the CVR registry. Try again later." },
      502,
    );
  }

  if (resp.status === 404) {
    return jsonResponse({ error: "No entity found in CVR." }, 404);
  }
  if (resp.status === 429) {
    return jsonResponse(
      { error: "CVR rate limit reached. Please wait a moment and try again." },
      429,
    );
  }
  if (resp.status >= 500) {
    return jsonResponse(
      { error: `CVR registry error (HTTP ${resp.status}). Try again later.` },
      502,
    );
  }
  if (!resp.ok) {
    return jsonResponse(
      { error: `Unexpected CVR response (HTTP ${resp.status}).` },
      502,
    );
  }
  return resp;
}

export const cvrAdapter: RegistryAdapter = {
  id: "cvr",
  name: "CVR (Denmark)",
  country_codes: ["dk", "denmark", "danmark"],

  validateOrgNumber(raw: string) {
    const digits = (raw ?? "").replace(/\D/g, "");
    if (digits.length !== 8) {
      return { ok: false, error: "Danish CVR numbers must be exactly 8 digits." };
    }
    return { ok: true, digits };
  },

  async lookupByOrgNumber(orgNumber: string): Promise<Response> {
    const url = `https://cvrapi.dk/api?country=dk&vat=${orgNumber}`;
    const resp = await fetchCvr(url);
    // If fetchCvr already returned a JSON error response, pass through
    if (resp.headers.get("Content-Type")?.includes("application/json") && resp.status !== 200) {
      return resp;
    }

    let entity: CvrEntity;
    try {
      entity = (await resp.json()) as CvrEntity;
    } catch {
      return jsonResponse({ error: "Unexpected response shape from CVR." }, 502);
    }

    if (entity.error) {
      // cvrapi.dk may return 200 with {error: "..."}
      return jsonResponse({ error: `CVR: ${entity.error}` }, 404);
    }
    if (!entity.vat || !entity.name) {
      return jsonResponse({ error: "No entity found in CVR." }, 404);
    }

    const proposal = buildProposalFromCvr(entity);
    return jsonResponse({
      mode: "single",
      proposal,
      source: { registry: "CVR", source_url: url },
    });
  },

  async lookupByName(name: string): Promise<Response> {
    // cvrapi.dk free tier returns a single best-match result, not a list
    const url = `https://cvrapi.dk/api?country=dk&search=${encodeURIComponent(name)}`;
    const resp = await fetchCvr(url);

    if (resp.status === 404) {
      // Empty candidates uniformity
      return jsonResponse({
        mode: "candidates",
        candidates: [],
        total_hits: 0,
      });
    }
    if (resp.headers.get("Content-Type")?.includes("application/json") && resp.status !== 200) {
      return resp;
    }

    let entity: CvrEntity;
    try {
      entity = (await resp.json()) as CvrEntity;
    } catch {
      return jsonResponse({ error: "Unexpected response shape from CVR." }, 502);
    }

    if (entity.error || !entity.vat || !entity.name) {
      return jsonResponse({
        mode: "candidates",
        candidates: [],
        total_hits: 0,
      });
    }

    const orgRaw = String(entity.vat).replace(/\D/g, "");
    const candidate = {
      actor_name: (entity.name ?? "").trim(),
      org_number: orgRaw,
      org_number_display: orgRaw ? formatCvrDisplay(orgRaw) : "",
      city: entity.city ? titleCase(entity.city.trim()) : null,
      organisasjonsform: entity.companydesc ?? null,
    };

    return jsonResponse({
      mode: "candidates",
      candidates: [candidate],
      total_hits: 1,
    });
  },
};
