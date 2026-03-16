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
    const { invitation_id } = await req.json();
    if (!invitation_id) {
      return new Response(JSON.stringify({ error: "Missing invitation_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Increment used_count
    const { error } = await adminClient.rpc("increment_invite_usage" as any, { _invitation_id: invitation_id });
    
    // Fallback if RPC doesn't exist
    if (error) {
      await adminClient
        .from("invitations")
        .update({ used_count: adminClient.rpc("" as any) } as any)
        .eq("id", invitation_id);
      
      // Simple increment via raw update
      const { data: invite } = await adminClient
        .from("invitations")
        .select("used_count")
        .eq("id", invitation_id)
        .single();
      
      if (invite) {
        await adminClient
          .from("invitations")
          .update({ used_count: (invite.used_count || 0) + 1 })
          .eq("id", invitation_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
