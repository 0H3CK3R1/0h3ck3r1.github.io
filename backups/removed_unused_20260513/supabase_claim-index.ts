import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, message: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, message: 'Server environment missing' });
  }

  let body: { code?: string; clientId?: string } = {};
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse(400, { ok: false, message: 'Ungültiger Request-Body.' });
  }

  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const clientId = String(body.clientId || '').slice(0, 120);

  if (code.length !== 6) {
    return jsonResponse(400, { ok: false, message: 'Code muss 6-stellig sein.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Atomic claim: only one request can flip is_used from false to true.
  const { data, error } = await supabase
    .from('quiz_access_codes')
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
      used_by_client_id: clientId || null
    })
    .eq('code', code)
    .eq('is_used', false)
    .select('code')
    .limit(1);

  if (error) {
    return jsonResponse(500, { ok: false, message: 'Datenbankfehler beim Einlösen.' });
  }

  if (!data || data.length === 0) {
    const { data: existing, error: existingError } = await supabase
      .from('quiz_access_codes')
      .select('code, is_used')
      .eq('code', code)
      .limit(1);

    if (existingError) {
      return jsonResponse(500, { ok: false, message: 'Datenbankprüfung fehlgeschlagen.' });
    }

    if (!existing || existing.length === 0) {
      return jsonResponse(404, { ok: false, message: 'Dieser Code ist nicht gültig.' });
    }

    return jsonResponse(409, { ok: false, message: 'Dieser Code wurde bereits verwendet.' });
  }

  return jsonResponse(200, { ok: true });
});

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
