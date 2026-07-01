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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Use GET or POST' }, 405, corsHeaders(origin));
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

    // POST /email — send weekly review via Resend
    if (path === '/email' && request.method === 'POST') {
      var body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders(origin));
      }

      var to = (body.to || '').trim();
      var subject = (body.subject || '').trim();
      var html = (body.html || '').trim();

      if (!to || !subject || !html) {
        return jsonResponse({ error: 'Missing required fields: to, subject, html' }, 400, corsHeaders(origin));
      }

      var resendKey = env.RESEND_API_KEY;
      if (!resendKey) {
        return jsonResponse({ error: 'Server misconfiguration: RESEND_API_KEY not set' }, 500, corsHeaders(origin));
      }

      try {
        var resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + resendKey
          },
          body: JSON.stringify({
            from: 'Progression <onboarding@resend.dev>',
            to: [to],
            subject: subject,
            html: html
          })
        });

        var resendBody = await resendResp.json();

        if (resendResp.ok) {
          return jsonResponse({ ok: true, id: resendBody.id }, 200, corsHeaders(origin));
        } else {
          return jsonResponse({ error: 'Resend error: ' + (resendBody.message || resendResp.status) }, 502, corsHeaders(origin));
        }
      } catch (err) {
        return jsonResponse({ error: 'Resend request failed: ' + err.message }, 502, corsHeaders(origin));
      }
    }

    // POST /deepseek — proxy AI requests
    if (path === '/deepseek' && request.method === 'POST') {
      var aiKey = env.DEEPSEEK_API_KEY;
      if (!aiKey) {
        return jsonResponse({ error: 'Server misconfiguration: DEEPSEEK_API_KEY not set' }, 500, corsHeaders(origin));
      }
      try {
        var aiResp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + aiKey
          },
          body: request.body
        });
        var aiBody = await aiResp.json();
        return jsonResponse(aiBody, aiResp.status, corsHeaders(origin));
      } catch (err) {
        return jsonResponse({ error: 'DeepSeek proxy error: ' + err.message }, 502, corsHeaders(origin));
      }
    }

    // POST /backup — store app data in KV
    if (path === '/backup' && request.method === 'POST') {
      var backupBody;
      try {
        backupBody = await request.json();
      } catch (e) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders(origin));
      }
      var backupProfile = (backupBody.profile || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
      var backupData = backupBody.data;
      if (!backupData) {
        return jsonResponse({ error: 'Missing data field' }, 400, corsHeaders(origin));
      }
      try {
        await env.APP_BACKUP.put('backup_' + backupProfile, JSON.stringify(backupData));
        await env.APP_BACKUP.put('backup_ts_' + backupProfile, new Date().toISOString());
        return jsonResponse({ ok: true }, 200, corsHeaders(origin));
      } catch (err) {
        return jsonResponse({ error: 'KV write failed: ' + err.message }, 502, corsHeaders(origin));
      }
    }

    // GET /restore?profile=default — retrieve backed up data
    if (path === '/restore' && request.method === 'GET') {
      var restoreProfile = (url.searchParams.get('profile') || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
      try {
        var restoredData = await env.APP_BACKUP.get('backup_' + restoreProfile);
        var restoredTs = await env.APP_BACKUP.get('backup_ts_' + restoreProfile);
        if (!restoredData) {
          return jsonResponse({ error: 'No backup found for profile: ' + restoreProfile }, 404, corsHeaders(origin));
        }
        return jsonResponse({ data: JSON.parse(restoredData), backedUpAt: restoredTs }, 200, corsHeaders(origin));
      } catch (err) {
        return jsonResponse({ error: 'KV read failed: ' + err.message }, 502, corsHeaders(origin));
      }
    }

    // POST /admin/wipe — delete a profile's cloud data (requires admin key)
if (path === '/admin/wipe' && request.method === 'POST') {
  var wipeBody;
  try { wipeBody = await request.json(); } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders(origin));
  }
  var adminKey = (wipeBody.adminKey || '').trim();
  var wipeProfile = (wipeBody.profile || 'default').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!adminKey || adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders(origin));
  }

  try {
    await env.APP_BACKUP.delete('backup_' + wipeProfile);
    await env.APP_BACKUP.delete('backup_ts_' + wipeProfile);
    return jsonResponse({ ok: true, wiped: wipeProfile }, 200, corsHeaders(origin));
  } catch (err) {
    return jsonResponse({ error: 'KV delete failed: ' + err.message }, 502, corsHeaders(origin));
  }
}

return jsonResponse({ error: 'Unknown endpoint', usage: { search: 'GET /search?q=...', food: 'GET /food?id=...', email: 'POST /email {to,subject,html}', deepseek: 'POST /deepseek', backup: 'POST /backup', restore: 'GET /restore?profile=...', wipe: 'POST /admin/wipe {profile,adminKey}' } }, 404, corsHeaders(origin));

  } catch (err) {
    return jsonResponse({ error: 'Proxy error: ' + err.message }, 500, corsHeaders(origin));
  }
}

export default { fetch: handleRequest };
