export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405);
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

      const claimResult = await env.DB.prepare(
        `UPDATE quiz_access_codes
         SET is_used = 1,
             used_at = datetime('now'),
             used_by_client_id = ?
         WHERE code = ? AND is_used = 0`
      )
        .bind(clientId || null, code)
        .run();

      if ((claimResult.meta?.changes || 0) > 0) {
        return json({ ok: true }, 200);
      }

      const exists = await env.DB.prepare(
        `SELECT code, is_used FROM quiz_access_codes WHERE code = ? LIMIT 1`
      )
        .bind(code)
        .first();

      if (!exists) {
        return json({ ok: false, message: 'Dieser Code ist nicht gueltig.' }, 404);
      }

      return json({ ok: false, message: 'Dieser Code wurde bereits verwendet.' }, 409);
    }

    // Submit quiz results and answers
    if (action === 'submit') {
      const code = String(body.code || '').replace(/\D/g, '').slice(0, 6) || null;
      const clientId = String(body.clientId || body.client_id || '') || null;
      const userName = body.user_name ? String(body.user_name).slice(0, 120) : null;
      const score = Number.isFinite(Number(body.score)) ? Number(body.score) : null;
      const total = Number.isFinite(Number(body.total)) ? Number(body.total) : null;
      const startedAt = body.started_at || null;
      const finishedAt = body.finished_at || null;
      const durationMs = Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null;
      const answers = Array.isArray(body.answers) ? body.answers : [];

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

      // Prepare insert statement for answers and run in a loop (single prepared statement)
      const insertAns = env.DB.prepare(
        `INSERT INTO quiz_attempt_answers (attempt_id, question, chosen, is_correct) VALUES (?, ?, ?, ?)`
      );

      for (const a of answers) {
        const q = String(a.question || '').slice(0, 1000);
        const chosen = a.chosen ? String(a.chosen).slice(0, 500) : null;
        const isCorrect = a.isCorrect ? 1 : 0;
        try {
          await insertAns.bind(attemptId, q, chosen, isCorrect).run();
        } catch (e) {
          // continue on individual answer failures
        }
      }

      return json({ ok: true, attempt_id: attemptId }, 200);
    }

    // Query top results (by score desc, duration asc)
    if (action === 'top') {
      const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(100, Number(body.limit))) : 10;
      const rows = await env.DB.prepare(
        `SELECT id, code, client_id, user_name, score, total, duration_ms, started_at, finished_at, created_at
         FROM quiz_attempts
         ORDER BY score DESC, duration_ms ASC, created_at ASC
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
