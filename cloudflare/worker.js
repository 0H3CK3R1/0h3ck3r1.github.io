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
