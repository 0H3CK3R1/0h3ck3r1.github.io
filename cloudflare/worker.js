export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405);
    }

    if (isMaintenanceEnabled(env)) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Service ist voruebergehend offline.' }),
        {
          status: 503,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': '300'
          }
        }
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch (_error) {
      return json({ ok: false, message: 'Ungueltiger Request-Body.' }, 400);
    }

    const action = String(body.action || 'claim');

    // Claim a code (backwards compatible)
    if (action === 'claim') {
      const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
      const clientId = String(body.clientId || body.client_id || '').slice(0, 120);

      if (code.length !== 6) {
        return json({ ok: false, message: 'Code muss 6-stellig sein.' }, 400);
      }

      const existing = await env.DB.prepare(
        `SELECT code, is_used
         FROM quiz_access_codes
         WHERE code = ?
         LIMIT 1`
      )
        .bind(code)
        .first();

      if (!existing) {
        return json({ ok: false, message: 'Dieser Code ist nicht gueltig.' }, 404);
      }

      if (existing.is_used) {
        return json({ ok: false, message: 'Dieser Code wurde bereits verwendet.' }, 409);
      }

      const claimResult = await env.DB.prepare(
        `INSERT INTO quiz_access_codes (code, is_used, used_at, used_by_client_id)
         VALUES (?, 1, datetime('now'), ?)
         ON CONFLICT(code) DO UPDATE SET
           is_used = 1,
           used_at = datetime('now'),
           used_by_client_id = excluded.used_by_client_id
         WHERE quiz_access_codes.is_used = 0`
      )
        .bind(code, clientId || null)
        .run();

      if ((claimResult.meta?.changes || 0) > 0) {
        return json({ ok: true }, 200);
      }

      return json({ ok: false, message: 'Dieser Code wurde bereits verwendet.' }, 409);
    }

    // Submit quiz result summary
    if (action === 'submit') {
      const code = String(body.code || '').replace(/\D/g, '').slice(0, 6) || null;
      const clientId = String(body.clientId || body.client_id || '') || null;
      const userName = body.user_name ? String(body.user_name).slice(0, 120) : null;
      const score = Number.isFinite(Number(body.score)) ? Number(body.score) : null;
      const total = Number.isFinite(Number(body.total)) ? Number(body.total) : null;
      const startedAt = body.started_at || null;
      const finishedAt = body.finished_at || null;
      const durationMs = Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null;

      if (score === null || total === null) {
        return json({ ok: false, message: 'Score und Total sind erforderlich.' }, 400);
      }

      // Insert attempt and return id using RETURNING for efficient retrieval
      const attemptRow = await env.DB.prepare(
        `INSERT INTO quiz_attempts (code, client_id, user_name, score, total, started_at, finished_at, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
        .bind(code, clientId, userName, score, total, startedAt, finishedAt, durationMs)
        .first();

      const attemptId = attemptRow?.id || null;

      if (!attemptId) {
        return json({ ok: false, message: 'Konnte Versuch nicht anlegen.' }, 500);
      }

      return json({ ok: true, attempt_id: attemptId }, 200);
    }

    // Query top results (by score desc, duration asc)
    if (action === 'top') {
      const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(100, Number(body.limit))) : 10;
      const rows = await env.DB.prepare(
        `SELECT id, code, client_id, user_name, score, total, duration_ms, started_at, finished_at, created_at
         FROM quiz_attempts
         ORDER BY score DESC, COALESCE(duration_ms, 2147483647) ASC, created_at ASC
         LIMIT ?`
      )
        .bind(limit)
        .all();

      return json({ ok: true, rows: rows.results || [] }, 200);
    }

    return json({ ok: false, message: 'Unbekannte Aktion' }, 400);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function isMaintenanceEnabled(env) {
  const raw = String(env.MAINTENANCE_MODE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
