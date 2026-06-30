/**
 * Cloudflare Worker — FatSecret API Proxy (OAuth 1.0a)
 *
 * Proxies frontend requests to the FatSecret REST API, signing each one with
 * OAuth 1.0a so your Shared Secret never reaches the browser.
 *
 * ## Endpoints (frontend calls these)
 *   GET /search?q=chicken&page=0
 *   GET /food?id=12345
 *
 * ## Setup
 *   npx wrangler secret put FATSECRET_CLIENT_ID      # Consumer Key
 *   npx wrangler secret put FATSECRET_CLIENT_SECRET  # Shared Secret
 *   npx wrangler deploy
 */

const FATSECRET_BASE = 'https://platform.fatsecret.com/rest/server.api';

// ---------------------------------------------------------------------------
// Percent-encoding per RFC 3986 (OAuth 1.0a convention)
// ---------------------------------------------------------------------------
function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

// ---------------------------------------------------------------------------
// OAuth 1.0a parameter generation
// ---------------------------------------------------------------------------
function oauthParams(consumerKey) {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };
}

// ---------------------------------------------------------------------------
// Signature base string
// ---------------------------------------------------------------------------
async function buildBaseString(method, url, allParams) {
  const sortedKeys = Object.keys(allParams).sort();
  const pairs = sortedKeys.map(function (k) {
    return percentEncode(k) + '=' + percentEncode(allParams[k]);
  });
  const paramString = pairs.join('&');

  return method.toUpperCase() + '&' + percentEncode(url) + '&' + percentEncode(paramString);
}

// ---------------------------------------------------------------------------
// HMAC-SHA1 → base64
// ---------------------------------------------------------------------------
function bytesToBase64(bytes) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var len = bytes.length, result = '';
  for (var i = 0; i < len; i += 3) {
    var a = bytes[i], b = i + 1 < len ? bytes[i + 1] : 0, c = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? chars[c & 63] : '=';
  }
  return result;
}

async function hmacSha1Base64(key, data) {
  var enc = new TextEncoder();
  var cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  var sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return bytesToBase64(new Uint8Array(sig));
}

// ---------------------------------------------------------------------------
// FatSecret API call
// ---------------------------------------------------------------------------
async function callFatSecret(apiParams, env) {
  var clientId = env.FATSECRET_CLIENT_ID;
  var clientSecret = env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET env vars');
  }

  // Build OAuth params and sign
  var oa = oauthParams(clientId);
  var allParams = Object.assign({}, apiParams, oa);

  var baseString = await buildBaseString('GET', FATSECRET_BASE, allParams);
  var signingKey = percentEncode(clientSecret) + '&';
  var signature = await hmacSha1Base64(signingKey, baseString);

  // FatSecret uses "query-string OAuth" — all params go in the URL
  var allParamsWithSig = Object.assign({}, allParams, { oauth_signature: signature });
  var sortedKeys = Object.keys(allParamsWithSig).sort();
  var parts = sortedKeys.map(function (k) {
    return percentEncode(k) + '=' + percentEncode(allParamsWithSig[k]);
  });
  var fullUrl = FATSECRET_BASE + '?' + parts.join('&');

  return fetch(fullUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {}),
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
async function handleRequest(request, env) {
  var url = new URL(request.url);
  var path = url.pathname.replace(/\/+$/, '');
  var origin = request.headers.get('Origin') || '*';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Use GET' }, 405, corsHeaders(origin));
  }

  try {
    // /search?q=chicken&page=0
    if (path === '/search') {
      var query = url.searchParams.get('q');
      var page = url.searchParams.get('page') || '0';
      if (!query || !query.trim()) {
        return jsonResponse({ error: 'Missing q parameter' }, 400, corsHeaders(origin));
      }
      var resp = await callFatSecret({
        method: 'foods.search',
        search_expression: query.trim(),
        page_number: String(Math.max(0, parseInt(page, 10) || 0)),
        max_results: '20',
        format: 'json',
      }, env);
      var body = await resp.json();
      return jsonResponse(body, resp.status, corsHeaders(origin));
    }

    // /food?id=12345
    if (path === '/food') {
      var foodId = url.searchParams.get('id');
      if (!foodId || isNaN(parseInt(foodId, 10))) {
        return jsonResponse({ error: 'Missing or invalid id' }, 400, corsHeaders(origin));
      }
      var resp = await callFatSecret({
        method: 'food.get',
        food_id: foodId,
        format: 'json',
      }, env);
      var body = await resp.json();
      return jsonResponse(body, resp.status, corsHeaders(origin));
    }

    return jsonResponse({ error: 'Unknown endpoint', usage: { search: 'GET /search?q=...', food: 'GET /food?id=...' } }, 404, corsHeaders(origin));

  } catch (err) {
    return jsonResponse({ error: 'Proxy error: ' + err.message }, 500, corsHeaders(origin));
  }
}

export default { fetch: handleRequest };
