import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Your sign-in session is no longer valid. Please sign in again." }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid workspace details." }, 400);
  }

  const name = String(input.name || "My Business").trim().slice(0, 120) || "My Business";
  const businessType = input.business_type ? String(input.business_type).slice(0, 120) : null;
  const timezone = String(input.timezone || "Europe/Nicosia").slice(0, 80);
  const currency = String(input.currency || "EUR").slice(0, 8);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
  const { data: workspace, error } = await admin
    .from("workspaces")
    .insert({ name, business_type: businessType, timezone, currency, created_by: user.id })
    .select("id,name")
    .single();

  if (error) return json({ error: "Could not create workspace.", detail: error.message }, 400);
  return json({ workspace });
});
