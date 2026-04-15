import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const accounts = [
    { email: "admin@nexus.test", name: "Admin User", role: "admin", access_tier: "tier_1", password: "NexusAdmin2026!" },
    { email: "user.t1@nexus.test", name: "Tier 1 User", role: "user", access_tier: "tier_1", password: "NexusT1User2026!" },
    { email: "user.t2@nexus.test", name: "Tier 2 User", role: "user", access_tier: "tier_2", password: "NexusT2User2026!" },
    { email: "user.t3@nexus.test", name: "Tier 3 User", role: "user", access_tier: "tier_3", password: "NexusT3User2026!" },
  ];

  const results = [];

  for (const acct of accounts) {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: acct.email,
      password: acct.password,
      email_confirm: true,
    });

    if (authErr) {
      results.push({ email: acct.email, error: authErr.message });
      continue;
    }

    const { error: profileErr } = await supabase.from("users").insert({
      id: authData.user.id,
      email: acct.email,
      name: acct.name,
      role: acct.role,
      access_tier: acct.access_tier,
    });

    results.push({ email: acct.email, id: authData.user.id, profileError: profileErr?.message || null });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
