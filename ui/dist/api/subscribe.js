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

  // Vercel renamed "Vercel KV" into the Upstash marketplace integration.
  // Old projects auto-inject KV_REST_API_*; new Upstash connections inject
  // UPSTASH_REDIS_REST_*. Support either.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.log("[subscribe] KV/Upstash not configured. Email:", email, "source:", source);
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
    // Storage succeeded. Fire-and-forget the welcome email — failures
    // here shouldn't break the user's subscribe experience.
    sendWelcomeEmail(email).catch((err) => {
      console.log("[subscribe] welcome email send failed:", err?.message);
    });
    return jsonResponse({ ok: true, stored: true });
  } catch (err) {
    console.log("[subscribe] KV exception:", err?.message);
    return jsonResponse({ ok: false, error: "Storage exception" }, 500);
  }
}

// Welcome email via Resend. Triggered after a successful KV write.
// If RESEND_API_KEY isn't configured, logs and skips silently.
async function sendWelcomeEmail(toEmail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[subscribe] RESEND_API_KEY not configured. Skipping welcome.");
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Eric at Itemized <hello@itemized.health>",
      reply_to: "hello@itemized.health",
      to: [toEmail],
      subject: "You're on the Itemized list.",
      text: WELCOME_TEXT,
      html: WELCOME_HTML,
      headers: {
        "List-Unsubscribe": "<mailto:hello@itemized.health?subject=unsubscribe>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.log("[subscribe] Resend non-2xx:", r.status, txt);
  }
}

const WELCOME_TEXT = `Welcome.

You'll get one email a month. Two things in it:

1. Hospitals we added — when our coverage expands, especially near you. We're at 160 hospitals across 18 states and growing.
2. Price shifts — when negotiated rates change more than 10% at a hospital you've viewed, or a procedure's national median moves significantly.

No marketing. No "10 tips for healthcare savings." No partner promos. If those creep in, unsubscribe — they're against the editorial rule we hold.

If you have a hospital we don't cover yet and want it added, hit reply. We add hospitals on a rolling basis.

— Eric
founder, itemized.health
https://itemized.health

To unsubscribe, reply with "unsubscribe" in the subject.
`;

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're on the Itemized list.</title>
</head>
<body style="margin:0;padding:0;background:#F5F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F0E0C;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1EA;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0" border="0">
        <tr><td>
          <div style="font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:24px;letter-spacing:-0.04em;color:#0F0E0C;margin-bottom:32px;">
            Itemized<span style="display:inline-block;width:8px;height:8px;background:#5B3FE0;border-radius:50%;margin:0 4px 2px;vertical-align:middle;"></span>
          </div>

          <h1 style="font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;font-size:32px;line-height:1.1;letter-spacing:-0.02em;font-weight:700;margin:0 0 16px;color:#0F0E0C;">
            Welcome.
          </h1>

          <p style="font-size:16px;line-height:1.6;color:#2A2925;margin:0 0 16px;">
            You'll get one email a month. Two things in it:
          </p>

          <ol style="font-size:16px;line-height:1.6;color:#2A2925;padding-left:20px;margin:0 0 24px;">
            <li style="margin-bottom:12px;">
              <strong>Hospitals we added</strong> — when our coverage expands, especially near you. We're at <strong>160 hospitals across 18 states</strong> and growing.
            </li>
            <li style="margin-bottom:12px;">
              <strong>Price shifts</strong> — when negotiated rates change more than 10% at a hospital you've viewed, or a procedure's national median moves significantly.
            </li>
          </ol>

          <p style="font-size:16px;line-height:1.6;color:#2A2925;margin:0 0 16px;">
            No marketing. No "10 tips for healthcare savings." No partner promos. If those creep in, unsubscribe — they're against the editorial rule we hold.
          </p>

          <p style="font-size:16px;line-height:1.6;color:#2A2925;margin:0 0 24px;">
            If you have a hospital we don't cover yet and want it added, hit reply. We add hospitals on a rolling basis.
          </p>

          <p style="font-size:16px;line-height:1.6;color:#2A2925;margin:0 0 4px;">— Eric</p>
          <p style="font-size:14px;line-height:1.6;color:#6B675F;margin:0 0 32px;">
            founder, <a href="https://itemized.health" style="color:#5B3FE0;text-decoration:none;">itemized.health</a>
          </p>

          <hr style="border:0;border-top:1px solid rgba(15,14,12,0.10);margin:24px 0;">

          <p style="font-size:12px;line-height:1.6;color:#6B675F;font-family:'JetBrains Mono','Menlo',monospace;letter-spacing:0.04em;margin:0;">
            You're getting this because you signed up at itemized.health. To unsubscribe, reply with "unsubscribe" in the subject.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
