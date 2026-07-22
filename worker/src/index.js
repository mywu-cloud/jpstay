/**
 * jpstay-api — Cloudflare Worker proxy for Rakuten Travel API
 *
 * Keeps the Rakuten "Application ID" secret on the server side instead of
 * requiring users to paste it into the browser. Adds a short edge cache
 * (15 minutes) so repeated identical searches do not re-hit the Rakuten API.
 *
 * Routes:
 *   GET /vacant-hotel-search  -> proxies Travel/VacantHotelSearch/20170426
 *   GET /area-class           -> proxies Travel/GetAreaClass/20131024
 *
 * Required secret (set via Cloudflare dashboard, Settings > Variables and Secrets):
 *   RAKUTEN_APP_ID
 *
 * Optional var (set in wrangler.toml):
 *   ALLOWED_ORIGIN (defaults to https://jpstay.pages.dev)
 */

const RAKUTEN_ENDPOINTS = {
  "/vacant-hotel-search": "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426",
  "/area-class": "https://app.rakuten.co.jp/services/api/Travel/GetAreaClass/20131024",
};

function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || "https://jpstay.pages.dev";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env, ctx) {
    const headers = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const target = RAKUTEN_ENDPOINTS[url.pathname];

    if (!target) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    if (!env.RAKUTEN_APP_ID) {
      return new Response(
        JSON.stringify({ error: "server_misconfigured", message: "RAKUTEN_APP_ID secret is not set." }),
        { status: 500, headers: { "Content-Type": "application/json", ...headers } }
      );
    }

    const targetUrl = new URL(target);
    for (const [key, value] of url.searchParams.entries()) {
      if (key === "applicationId" || key === "format" || key === "callback") continue;
      targetUrl.searchParams.set(key, value);
    }
    targetUrl.searchParams.set("format", "json");
    targetUrl.searchParams.set("applicationId", env.RAKUTEN_APP_ID);

    const cache = caches.default;
    const cacheKey = new Request(targetUrl.toString(), { method: "GET" });

    let response = await cache.match(cacheKey);
    if (response) {
      response = new Response(response.body, response);
      for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      return response;
    }

    const apiResp = await fetch(targetUrl.toString());
    const body = await apiResp.text();

    response = new Response(body, {
      status: apiResp.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=900",
        ...headers,
      },
    });

    if (apiResp.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
