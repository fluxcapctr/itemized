// Email-capture endpoint for itemized.health.
//
// Posts to Vercel KV via its REST API. No npm deps required — using plain
// fetch() against the auto-injected KV_REST_API_URL + KV_REST_API_TOKEN
// env vars (these are available once you enable KV in the Vercel dashboard:
// Project → Storage → Create Database → KV → Connect to project).
//
// Until KV is connected the function returns {ok:true, stored:false} so the
// form still works for visual testing. Check the Vercel deploy logs for
// the "[subscribe] KV not configured" line if subscribers aren't landing.
//
// To list subscribers from the Vercel CLI:
//   vercel env pull && curl -H "Authorization: Bearer $KV_REST_API_TOKEN" \
//     "$KV_REST_API_URL/smembers/emails:set"

export const config = { runtime: "edge" };

export default async function handler(req) {
  // CORS preflight (mostly a no-op since the form is same-origin, but
  // some browsers preflight POST with non-simple headers).
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Bad JSON" }, 400);
  }

  const email = String(body?.email || "").toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ ok: false, error: "Invalid email" }, 400);
  }
  if (email.length > 254) {
    return jsonResponse({ ok: false, error: "Email too long" }, 400);
  }

  const source = String(body?.source || "unknown").slice(0, 50);
  const ts = new Date().toISOString();
  const userAgent = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.log("[subscribe] KV not configured. Email:", email, "source:", source);
    return jsonResponse({ ok: true, stored: false });
  }

  const record = JSON.stringify({ email, source, ts, ua: userAgent.slice(0, 200), ip });
  const safeKey = encodeURIComponent(`email:${email}`);
  const safeMember = encodeURIComponent(email);

  try {
    // Store one record keyed by email; Upstash REST API expects the value
    // as the request body for SET.
    const r1 = await fetch(`${url}/set/${safeKey}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: record,
    });
    if (!r1.ok) {
      const txt = await r1.text().catch(() => "");
      console.log("[subscribe] KV set failed:", r1.status, txt);
      return jsonResponse({ ok: false, error: "Storage error" }, 500);
    }
    // Add the email to a set so we can list all subscribers.
    const r2 = await fetch(`${url}/sadd/emails:set/${safeMember}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r2.ok) {
      const txt = await r2.text().catch(() => "");
      console.log("[subscribe] KV sadd failed:", r2.status, txt);
      // Non-fatal: the per-email record is already stored.
    }
    return jsonResponse({ ok: true, stored: true });
  } catch (err) {
    console.log("[subscribe] KV exception:", err?.message);
    return jsonResponse({ ok: false, error: "Storage exception" }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
