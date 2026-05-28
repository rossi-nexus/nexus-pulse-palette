import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Payload {
  email: string;
  name?: string;
  role?: "user" | "admin";
  attributes?: Array<{ key: string; value: string; expires_at?: string | null }>;
  programme_ids?: string[];
  send_invite?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdminData, error: isAdminErr } = await admin.rpc("is_admin", {
      _user_id: userResp.user.id,
    });
    if (isAdminErr || !isAdminData) {
      return new Response(JSON.stringify({ error: "admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newUserId: string | null = null;
    if (body.send_invite !== false) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
        data: { name: body.name ?? null },
      });
      if (error || !data.user) {
        return new Response(JSON.stringify({ error: error?.message ?? "invite failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newUserId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        email_confirm: false,
        user_metadata: { name: body.name ?? null },
      });
      if (error || !data.user) {
        return new Response(JSON.stringify({ error: error?.message ?? "create failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newUserId = data.user.id;
    }

    // Wait a moment for handle_new_user trigger to seed public.users
    await new Promise((r) => setTimeout(r, 300));

    // Update name + role on public.users
    await admin
      .from("users")
      .update({
        name: body.name ?? body.email.split("@")[0],
        role: body.role ?? "user",
      })
      .eq("id", newUserId);

    // Apply attributes
    for (const attr of body.attributes ?? []) {
      await admin.from("user_attributes").upsert(
        {
          user_id: newUserId,
          key: attr.key,
          value: attr.value,
          granted_by: userResp.user.id,
          expires_at: attr.expires_at ?? null,
        },
        { onConflict: "user_id,key" },
      );
    }

    // Apply programme memberships
    for (const pid of body.programme_ids ?? []) {
      await admin.from("programme_members").upsert(
        {
          programme_id: pid,
          user_id: newUserId,
          role: "member",
          invited_by: userResp.user.id,
        },
        { onConflict: "programme_id,user_id" },
      );
    }

    await admin.rpc("fn_audit_log_event", {
      p_event_type: "admin_user_created",
      p_target_table: "users",
      p_target_record_id: newUserId,
      p_actor_id: null,
      p_programme_id: null,
      p_changes: {
        email: body.email,
        role: body.role ?? "user",
        attributes: body.attributes ?? [],
        programme_ids: body.programme_ids ?? [],
        invited: body.send_invite !== false,
      },
      p_reason: null,
    });

    return new Response(JSON.stringify({ user_id: newUserId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
