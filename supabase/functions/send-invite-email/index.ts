import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, code, role, cafeName } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "email and code are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get tenant name for the email
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    let tenantName = cafeName || "المقهى";
    if (profile?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", profile.tenant_id)
        .single();
      if (tenant) tenantName = tenant.name;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const siteUrl =
      Deno.env.get("SITE_URL") ||
      req.headers.get("origin") ||
      "https://nexa-cafe-hub.lovable.app";
    const inviteLink = `${siteUrl}/auth?invite=${code}`;
    const roleLabel = role === "manager" ? "مشرف" : "كاشير";

    // Use Lovable AI to generate email content
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "أنت مساعد لكتابة رسائل بريد إلكتروني احترافية بالعربية. أرجع HTML فقط بدون markdown أو شرح. الرسالة يجب أن تكون بتصميم بسيط وأنيق مع RTL.",
            },
            {
              role: "user",
              content: `اكتب رسالة بريد إلكتروني HTML لدعوة موظف للانضمام لنظام إدارة مقهى.
              اسم المقهى: ${tenantName}
              الصلاحية: ${roleLabel}
              كود الدعوة: ${code}
              رابط التسجيل: ${inviteLink}
              
              الرسالة يجب أن تكون:
              - بتنسيق HTML مع dir="rtl"
              - تحتوي على الكود ورابط التسجيل
              - احترافية وودية
              - بألوان هادئة (primary: #6366f1)
              - الزر يكون واضح للتسجيل`,
            },
          ],
          max_tokens: 1500,
        }),
      }
    );

    if (!aiResponse.ok) {
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let htmlContent =
      aiData.choices?.[0]?.message?.content || getFallbackHtml(tenantName, roleLabel, code, inviteLink);

    // Strip markdown code fences if present
    htmlContent = htmlContent
      .replace(/^```html?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    // Send email via Resend-compatible API or fallback
    // For now, we return the HTML so the frontend can use mailto or show it
    return new Response(
      JSON.stringify({
        success: true,
        html: htmlContent,
        subject: `دعوة للانضمام لفريق عمل ${tenantName}`,
        inviteLink,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getFallbackHtml(
  cafeName: string,
  role: string,
  code: string,
  link: string
) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:40px 20px;direction:rtl;">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<h2 style="color:#6366f1;margin-bottom:8px;">دعوة للانضمام لفريق ${cafeName}</h2>
<p style="color:#374151;">تمت دعوتك للانضمام كـ <strong>${role}</strong> في نظام إدارة ${cafeName}.</p>
<div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin:24px 0;">
<p style="color:#6b7280;margin:0 0 8px;">كود الدعوة</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#6366f1;margin:0;">${code}</p>
</div>
<a href="${link}" style="display:block;background:#6366f1;color:#fff;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">سجّل الآن</a>
<p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center;">هذه الدعوة مرسلة من نظام نيكسا كافيه</p>
</div>
</body>
</html>`;
}
