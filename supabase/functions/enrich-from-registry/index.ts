import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import {
  ADAPTERS,
  getAdapterById,
  getAdapterByCountry,
} from "./adapters/index.ts";
import { corsHeaders, jsonResponse } from "./adapters/types.ts";

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

    const { registry, mode, org_number, name, actor_context } = body as {
      registry?: string;
      mode?: string;
      org_number?: unknown;
      name?: unknown;
      actor_context?: { country?: string | null } | null;
    };

    // Resolve adapter — explicit registry param wins, else country auto-detect
    let adapter = null;
    if (registry) {
      adapter = getAdapterById(String(registry));
      if (!adapter) {
        return jsonResponse(
          {
            error: `Unknown registry: ${registry}`,
            supported_registries: ADAPTERS.map((a) => ({ id: a.id, name: a.name })),
          },
          400,
        );
      }
    } else {
      const country = actor_context?.country?.toString().toLowerCase().trim();
      adapter = country ? getAdapterByCountry(country) : null;
      if (!adapter) {
        return jsonResponse(
          {
            error:
              "Country not supported by any registry adapter — please specify registry explicitly.",
            supported_registries: ADAPTERS.map((a) => ({ id: a.id, name: a.name })),
          },
          400,
        );
      }
    }

    if (mode === "org_number") {
      if (typeof org_number !== "string") {
        return jsonResponse({ error: "org_number is required" }, 400);
      }
      const validation = adapter.validateOrgNumber(org_number);
      if (!validation.ok) {
        return jsonResponse({ error: validation.error }, 400);
      }
      return await adapter.lookupByOrgNumber(validation.digits);
    }

    if (mode === "name") {
      if (typeof name !== "string") {
        return jsonResponse({ error: "name is required" }, 400);
      }
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        return jsonResponse({ error: "Name must be at least 2 characters." }, 400);
      }
      return await adapter.lookupByName(trimmed);
    }

    return jsonResponse({ error: "mode must be 'org_number' or 'name'" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: `Registry lookup failed: ${(err as Error).message}` },
      500,
    );
  }
});
