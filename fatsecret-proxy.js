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

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    // GET /admin/stats?profile=X&adminKey=Y — view profile summary
if (path === '/admin/stats' && request.method === 'GET') {
  var statsKey = (url.searchParams.get('adminKey') || '').trim();
  var statsProfile = (url.searchParams.get('profile') || 'default').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!statsKey || statsKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders(origin));
  }

  try {
    var rawData = await env.APP_BACKUP.get('backup_' + statsProfile);
    var ts = await env.APP_BACKUP.get('backup_ts_' + statsProfile);
    if (!rawData) {
      return jsonResponse({ profile: statsProfile, exists: false }, 200, corsHeaders(origin));
    }
    var parsedData = JSON.parse(rawData);
    return jsonResponse({
      profile: statsProfile,
      exists: true,
      lastBackup: ts,
      workouts: (parsedData.workouts || []).length,
      nutritionDays: Object.keys(parsedData.nutrition || {}).length,
      bodyweightEntries: Object.keys(parsedData.bodyweight || {}).length,
      dataSizeKB: Math.round(rawData.length / 1024),
    }, 200, corsHeaders(origin));
  } catch (err) {
    return jsonResponse({ error: 'Stats read failed: ' + err.message }, 502, corsHeaders(origin));
  }
}

// GET /admin/export?profile=X&adminKey=Y — download profile JSON
if (path === '/admin/export' && request.method === 'GET') {
  var exportKey = (url.searchParams.get('adminKey') || '').trim();
  var exportProfile = (url.searchParams.get('profile') || 'default').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!exportKey || exportKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders(origin));
  }

  try {
    var expData = await env.APP_BACKUP.get('backup_' + exportProfile);
    if (!expData) {
      return jsonResponse({ error: 'No data found for profile: ' + exportProfile }, 404, corsHeaders(origin));
    }
    return new Response(expData, {
      status: 200,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="progression-backup-' + exportProfile + '.json"',
      }, corsHeaders(origin)),
    });
  } catch (err) {
    return jsonResponse({ error: 'Export failed: ' + err.message }, 502, corsHeaders(origin));
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

// GET /progress/:profile — public read-only progress page
if (path.match(/^\/progress\/([a-zA-Z0-9_-]+)$/) && request.method === 'GET') {
  var viewProfile = path.split('/')[2].replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    var progData = await env.APP_BACKUP.get('backup_' + viewProfile);
    if (!progData) {
      return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No Data</title><style>body{font-family:system-ui;background:#050505;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center;padding:40px}h1{color:#cc0000;font-size:24px}p{color:#888;font-size:14px}a{color:#884444}</style></head><body><div><h1>No Data</h1><p>Profile "' + viewProfile + '" has no data yet.</p><a href="https://github.com/EpicCows/my-gym-app">Powered by Progression</a></div></body></html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    var p = JSON.parse(progData);
    var workouts = (p.workouts || []).slice().reverse();
    var nutrition = p.nutrition || {};
    var bw = p.bodyweight || {};

    // Stats
    var totalWorkouts = workouts.length;
    var totalVolume = workouts.reduce(function(s, w) { return s + (w.totalVolume || 0); }, 0);
    var nutritionDays = Object.keys(nutrition).length;

    // Recent workouts (last 10)
    var recentHtml = '';
    for (var wi = 0; wi < Math.min(10, workouts.length); wi++) {
      var w = workouts[wi];
      var exList = (w.exercises || []).map(function(ex) {
        var setDescs = (ex.sets || []).map(function(s) { return (s.weight||0) + 'kg x ' + s.reps + (s.rpe ? ' @' + s.rpe : ''); });
        return '<span style="color:#e0e0e0">' + escapeHtml(ex.name) + '</span> <span style="color:#666">' + setDescs.join(' | ') + ' · ' + (w.totalVolume||0).toLocaleString() + ' kg</span>';
      }).join('<br>');
      recentHtml += '<div style="margin-bottom:16px;padding:12px;background:#0c0c0c;border-radius:10px;border-left:3px solid #cc0000">';
      recentHtml += '<div style="font-size:14px;font-weight:600;color:#cc0000;margin-bottom:4px">' + escapeHtml(w.dayType) + ' <span style="color:#888;font-weight:400;font-size:12px">' + w.date + '</span></div>';
      recentHtml += '<div style="font-size:12px;line-height:1.8">' + exList + '</div>';
      recentHtml += '</div>';
    }

    // Bodyweight trend
    var bwKeys = Object.keys(bw).sort().slice(-14);
    var bwVals = bwKeys.map(function(k) { return bw[k]; });
    var bwTrend = '';
    if (bwVals.length >= 2) {
      bwTrend = bwVals[0].toFixed(1) + ' → ' + bwVals[bwVals.length-1].toFixed(1) + ' kg (' + bwVals.length + ' entries)';
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    html += '<title>Progression - ' + escapeHtml(viewProfile) + '</title>';
    html += '<style>body{font-family:system-ui;background:#050505;color:#e0e0e0;max-width:480px;margin:0 auto;padding:20px 16px 40px}';
    html += 'h1{font-size:22px;font-weight:700;margin:0 0 4px}h1 span{color:#cc0000}';
    html += '.stat-grid{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}';
    html += '.stat{flex:1;min-width:80px;padding:12px;background:#0c0c0c;border-radius:10px;text-align:center}';
    html += '.stat-val{font-size:20px;font-weight:700;color:#cc0000}.stat-label{font-size:10px;color:#888;margin-top:2px}';
    html += '.footer{text-align:center;margin-top:24px;font-size:11px;color:#444}a{color:#884444;text-decoration:none}';
    html += '</style></head><body>';
    html += '<h1>Progression <span>' + escapeHtml(viewProfile) + '</span></h1>';
    html += '<p style="color:#888;font-size:13px;margin:0 0 16px">Public progress page — updated on each backup</p>';

    html += '<div class="stat-grid">';
    html += '<div class="stat"><div class="stat-val">' + totalWorkouts + '</div><div class="stat-label">Workouts</div></div>';
    html += '<div class="stat"><div class="stat-val">' + (totalVolume/1000).toFixed(1) + 'k</div><div class="stat-label">Total Volume</div></div>';
    html += '<div class="stat"><div class="stat-val">' + nutritionDays + '</div><div class="stat-label">Nutrition Days</div></div>';
    if (bwTrend) html += '<div class="stat"><div class="stat-val" style="font-size:14px">' + bwTrend + '</div><div class="stat-label">Bodyweight</div></div>';
    html += '</div>';

    html += '<h2 style="font-size:16px;font-weight:600;color:#cc0000;margin:20px 0 12px">Recent Workouts</h2>';
    html += (recentHtml || '<p style="color:#666;font-size:13px">No workouts yet.</p>');

    html += '<div class="footer"><a href="/csv/' + viewProfile + '">📥 Download CSV</a> · <a href="https://github.com/EpicCows/my-gym-app">Progression App</a></div>';
    html += '</body></html>';

    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    return new Response('Error loading data', { status: 500 });
  }
}

// GET /csv/:profile — download workout history as CSV
if (path.match(/^\/csv\/([a-zA-Z0-9_-]+)$/) && request.method === 'GET') {
  var csvProfile = path.split('/')[2].replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    var csvRaw = await env.APP_BACKUP.get('backup_' + csvProfile);
    if (!csvRaw) {
      return new Response('No data for profile: ' + csvProfile, { status: 404 });
    }
    var csvData = JSON.parse(csvRaw);
    var csvWorkouts = (csvData.workouts || []);

    var csvLines = ['Date,Day Type,Exercise,Set,Weight (kg),Reps,RPE,Notes'];
    for (var ci = 0; ci < csvWorkouts.length; ci++) {
      var cw = csvWorkouts[ci];
      for (var ei = 0; ei < (cw.exercises || []).length; ei++) {
        var ex = cw.exercises[ei];
        for (var si = 0; si < (ex.sets || []).length; si++) {
          var set = ex.sets[si];
          csvLines.push([
            cw.date,
            '"' + (cw.dayType || '').replace(/"/g, '""') + '"',
            '"' + (ex.name || '').replace(/"/g, '""') + '"',
            si + 1,
            set.weight || 0,
            set.reps || 0,
            set.rpe || '',
            '"' + (set.notes || '').replace(/"/g, '""') + '"',
          ].join(','));
        }
      }
    }

    var csvText = csvLines.join('\n');
    return new Response(csvText, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="progression-' + csvProfile + '.csv"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Error generating CSV', { status: 500 });
  }
}

return jsonResponse({ error: 'Unknown endpoint', usage: { search: 'GET /search?q=...', food: 'GET /food?id=...', email: 'POST /email {to,subject,html}', deepseek: 'POST /deepseek', backup: 'POST /backup', restore: 'GET /restore?profile=...', wipe: 'POST /admin/wipe {profile,adminKey}' } }, 404, corsHeaders(origin));

  } catch (err) {
    return jsonResponse({ error: 'Proxy error: ' + err.message }, 500, corsHeaders(origin));
  }
}

export default { fetch: handleRequest };
