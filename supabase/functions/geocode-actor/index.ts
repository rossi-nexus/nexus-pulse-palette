// geocode-actor edge function (D2a)
// JWT-gated. Takes an actor-shaped address payload, calls Nominatim, derives precision,
// and optionally writes back to public.actors when actor_id is provided.
// Reusable across D2c (target_table will be extended).
//
// User-Agent below is a placeholder. REPLACE with real contact before production.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Precision = "street" | "postal" | "city" | "country" | "failed";

interface Body {
  street_address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  actor_id?: string | null;
  target_table?: "actors";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function derivePrecision(address: Record<string, unknown> | undefined | null): Precision {
  if (!address) return "failed";
  if (address.house_number) return "street";
  if (address.postcode) return "postal";
  if (address.city || address.town || address.village || address.hamlet || address.municipality) return "city";
  if (address.country) return "country";
  return "failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // JWT gate
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify the JWT by asking auth.getUser with a user-bound client.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const target_table = body.target_table ?? "actors";
  const actor_id = body.actor_id ?? null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  async function writeFailed(reason: string) {
    if (!actor_id) return;
    await admin
      .from(target_table)
      .update({ geocoded_precision: "failed", geocoded_at: new Date().toISOString() })
      .eq("id", actor_id);
    await admin.rpc("fn_audit_log_event", {
      p_event_type: "actor_geocoded",
      p_target_table: target_table,
      p_target_record_id: actor_id,
      p_actor_id: actor_id,
      p_programme_id: null,
      p_changes: { precision: "failed", reason, source: "nominatim" },
      p_reason: null,
    });
  }

  // Insufficient address?
  if (!body.street_address && !body.postal_code && !body.city && !body.country) {
    await writeFailed("insufficient_address");
    return jsonResponse({ error: "insufficient address" }, 400);
  }

  // Build Nominatim query
  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "1",
  });
  if (body.street_address) params.set("street", body.street_address);
  if (body.city) params.set("city", body.city);
  if (body.region) params.set("county", body.region);
  if (body.country) params.set("country", body.country);
  if (body.postal_code) params.set("postalcode", body.postal_code);

  let nomResp: Response;
  try {
    nomResp = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": "NEXUS-v3/1.0 (https://nexus.example.no; contact@nexus.example.no)",
        "Accept-Language": "nb;q=0.9,no;q=0.8,en;q=0.7",
      },
    });
  } catch (e) {
    return jsonResponse({ error: "nominatim network error", detail: String(e) }, 502);
  }

  if (nomResp.status === 429) {
    await nomResp.text();
    return jsonResponse({ error: "nominatim rate limited" }, 429);
  }
  if (nomResp.status >= 500) {
    await nomResp.text();
    return jsonResponse({ error: "nominatim upstream error" }, 502);
  }
  if (!nomResp.ok) {
    await nomResp.text();
    return jsonResponse({ error: `nominatim ${nomResp.status}` }, 502);
  }

  const results = (await nomResp.json()) as Array<{
    lat: string;
    lon: string;
    address?: Record<string, unknown>;
  }>;

  if (!results || results.length === 0) {
    await writeFailed("no_result");
    return jsonResponse({ latitude: null, longitude: null, geocoded_precision: "failed" });
  }

  const top = results[0];
  const latitude = Number(top.lat);
  const longitude = Number(top.lon);
  const precision = derivePrecision(top.address);

  if (actor_id) {
    const { error: updErr } = await admin
      .from(target_table)
      .update({
        latitude,
        longitude,
        geocoded_at: new Date().toISOString(),
        geocoded_precision: precision,
      })
      .eq("id", actor_id);
    if (updErr) {
      return jsonResponse({ error: "write failed", detail: updErr.message }, 500);
    }
    await admin.rpc("fn_audit_log_event", {
      p_event_type: "actor_geocoded",
      p_target_table: target_table,
      p_target_record_id: actor_id,
      p_actor_id: actor_id,
      p_programme_id: null,
      p_changes: { precision, latitude, longitude, source: "nominatim" },
      p_reason: null,
    });
  }

  return jsonResponse({ latitude, longitude, geocoded_precision: precision });
});
