/**
 * jpstay-api — Cloudflare Worker proxy for Rakuten Travel API + Jalan Web Service
 *
 * Keeps API secrets on the server side instead of requiring users to paste
 * them into the browser. Adds a short edge cache (15 minutes) so repeated
 * identical searches do not re-hit the upstream APIs.
 *
 * Routes:
 *   GET /vacant-hotel-search  -> proxies Rakuten Travel/VacantHotelSearch/20170426 (JSON)
 *   GET /area-class           -> proxies Rakuten Travel/GetAreaClass/20131024 (JSON)
 *   GET /jalan-area-search    -> proxies Jalan APICommon/AreaSearch/V1 (XML)
 *   GET /jalan-vacant-search  -> proxies Jalan APIAdvance/StockSearch/V1 (XML)
 *
 * Required secrets (set via Cloudflare dashboard, Settings > Variables and Secrets):
 *   RAKUTEN_APP_ID
 *   RAKUTEN_ACCESS_KEY   (Rakuten Travel API now requires this in addition to applicationId)
 *   JALAN_API_KEY
 *
 * Optional var (set in wrangler.toml):
 *   ALLOWED_ORIGIN (defaults to https://jpstay.pages.dev)
 */

const RAKUTEN_ENDPOINTS = {
    "/vacant-hotel-search": "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426",
    "/area-class": "https://app.rakuten.co.jp/services/api/Travel/GetAreaClass/20131024",
};

const JALAN_ENDPOINTS = {
    "/jalan-area-search": "http://jws.jalan.net/APICommon/AreaSearch/V1/",
    "/jalan-vacant-search": "http://jws.jalan.net/APIAdvance/StockSearch/V1/",
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

function jsonError(error, message, status, headers) {
    return new Response(JSON.stringify({ error, message }), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
    });
}

async function cachedFetch(targetUrl, headers, ctx, contentType) {
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
          headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=900", ...headers },
    });
    if (apiResp.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
}

async function handleRakuten(pathname, url, env, headers, ctx) {
    if (!env.RAKUTEN_APP_ID) {
          return jsonError("server_misconfigured", "RAKUTEN_APP_ID secret is not set.", 500, headers);
    }
    if (!env.RAKUTEN_ACCESS_KEY) {
          return jsonError("server_misconfigured", "RAKUTEN_ACCESS_KEY secret is not set.", 500, headers);
    }
    const targetUrl = new URL(RAKUTEN_ENDPOINTS[pathname]);
    for (const [key, value] of url.searchParams.entries()) {
          if (key === "applicationId" || key === "accessKey" || key === "format" || key === "callback") continue;
          targetUrl.searchParams.set(key, value);
    }
    targetUrl.searchParams.set("format", "json");
    targetUrl.searchParams.set("applicationId", env.RAKUTEN_APP_ID);
    targetUrl.searchParams.set("accessKey", env.RAKUTEN_ACCESS_KEY);
    return cachedFetch(targetUrl, headers, ctx, "application/json");
}

async function handleJalan(pathname, url, env, headers, ctx) {
    if (!env.JALAN_API_KEY) {
          return jsonError("server_misconfigured", "JALAN_API_KEY secret is not set.", 500, headers);
    }
    const targetUrl = new URL(JALAN_ENDPOINTS[pathname]);
    for (const [key, value] of url.searchParams.entries()) {
          if (key === "key") continue;
          targetUrl.searchParams.set(key, value);
    }
    targetUrl.searchParams.set("key", env.JALAN_API_KEY);
    return cachedFetch(targetUrl, headers, ctx, "text/xml; charset=UTF-8");
}

export default {
    async fetch(request, env, ctx) {
          const headers = corsHeaders(env);
          if (request.method === "OPTIONS") return new Response(null, { headers });

      const url = new URL(request.url);
          const pathname = url.pathname;

      if (RAKUTEN_ENDPOINTS[pathname]) {
              return handleRakuten(pathname, url, env, headers, ctx);
      }
          if (JALAN_ENDPOINTS[pathname]) {
                  return handleJalan(pathname, url, env, headers, ctx);
          }
          return jsonError("not_found", "Unknown route.", 404, headers);
    },
};
