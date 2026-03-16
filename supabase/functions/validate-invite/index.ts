import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string" || code.length > 20) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: invite, error } = await adminClient
      .from("invitations")
      .select("id, code, tenant_id, role, max_uses, used_count, expires_at, is_active, tenants(name)")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (error || !invite) {
      return new Response(JSON.stringify({ error: "كود الدعوة غير صالح" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "كود الدعوة منتهي الصلاحية" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check usage limit
    if (invite.max_uses && invite.used_count >= invite.max_uses) {
      return new Response(JSON.stringify({ error: "تم استخدام كود الدعوة بالكامل" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantName = (invite.tenants as any)?.name || "مقهى";

    return new Response(
      JSON.stringify({
        valid: true,
        tenant_id: invite.tenant_id,
        tenant_name: tenantName,
        role: invite.role,
        invitation_id: invite.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
