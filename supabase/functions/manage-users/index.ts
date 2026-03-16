import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify caller with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check super_admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

    // ACTION: create-user (admin or cashier)
    if (action === "create-user") {
      const { email, password, name, role, tenant_id, cafe_name } = body;

      if (!email || !password || !name || !role) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const metadata: Record<string, string> = { name };
      if (role === "cashier" && tenant_id) {
        metadata.tenant_id = tenant_id;
      }
      if (role === "admin" && cafe_name) {
        metadata.cafe_name = cafe_name;
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ user: { id: newUser.user.id, email: newUser.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: list-tenants
    if (action === "list-tenants") {
      const { data: tenants } = await adminClient
        .from("tenants")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });

      // Get admin profiles for each tenant
      const tenantsWithAdmins = [];
      for (const tenant of tenants || []) {
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, name")
          .eq("tenant_id", tenant.id);

        const profileIds = profiles?.map((p) => p.id) || [];
        
        let admins: { user_id: string; role: string }[] = [];
        if (profileIds.length > 0) {
          const { data: roles } = await adminClient
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", profileIds);
          admins = roles || [];
        }

        const adminProfile = profiles?.find((p) =>
          admins.some((r) => r.user_id === p.id && (r.role === "admin" || r.role === "super_admin"))
        );

        tenantsWithAdmins.push({
          ...tenant,
          admin_name: adminProfile?.name || "—",
          user_count: profiles?.length || 0,
        });
      }

      return new Response(JSON.stringify({ tenants: tenantsWithAdmins }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: list-tenant-users
    if (action === "list-tenant-users") {
      const { tenant_id } = body;
      if (!tenant_id) {
        return new Response(JSON.stringify({ error: "Missing tenant_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, name")
        .eq("tenant_id", tenant_id);

      const profileIds = profiles?.map((p) => p.id) || [];
      let roles: { user_id: string; role: string }[] = [];
      if (profileIds.length > 0) {
        const { data } = await adminClient.from("user_roles").select("user_id, role").in("user_id", profileIds);
        roles = data || [];
      }

      // Get emails from auth
      const users = [];
      for (const profile of profiles || []) {
        const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(profile.id);
        const role = roles.find((r) => r.user_id === profile.id);
        users.push({
          id: profile.id,
          name: profile.name,
          email: authUser?.email || "—",
          role: role?.role || "cashier",
        });
      }

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: delete-user
    if (action === "delete-user") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Don't allow deleting super_admin
      const { data: targetRole } = await adminClient.from("user_roles").select("role").eq("user_id", user_id).single();
      if (targetRole?.role === "super_admin") {
        return new Response(JSON.stringify({ error: "Cannot delete super admin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: update-tenant-name
    if (action === "update-tenant-name") {
      const { tenant_id, name } = body;
      if (!tenant_id || !name) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error } = await adminClient.from("tenants").update({ name }).eq("id", tenant_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
