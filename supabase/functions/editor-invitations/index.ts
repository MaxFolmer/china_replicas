import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const allowedOrigins = new Set([
  'https://china-replicas.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

function cors(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || origin.startsWith('http://127.0.0.1:'));
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'https://china-replicas.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}
function bytesToToken(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
async function owner(req: Request) {
  const authorization = req.headers.get('Authorization') || '';
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const [{ data: userData, error: userError }, { data: role, error: roleError }] = await Promise.all([
    userClient.auth.getUser(),
    userClient.rpc('my_admin_role'),
  ]);
  if (userError || roleError || role !== 'owner') return null;
  const user = userData.user;
  if (!user) return null;
  return user;
}

Deno.serve(async req => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, origin); }
  const action = String(payload.action || '');

  if (action === 'accept') {
    const token = String(payload.token || '');
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (token.length < 40 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10)
      return json({ error: 'invalid_registration' }, 400, origin);
    const tokenHash = await sha256(token);
    const { data: invitation, error: invitationError } = await service
      .rpc('service_get_editor_invitation', { p_token_hash: tokenHash }).maybeSingle();
    if (invitationError || !invitation || invitation.email !== email)
      return json({ error: 'invitation_invalid' }, 400, origin);

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createError || !created.user)
      return json({ error: createError?.message?.toLowerCase().includes('already') ? 'account_exists' : 'account_create_failed' }, 409, origin);
    const { error: acceptError } = await service.rpc('service_accept_editor_invitation', {
      p_token_hash: tokenHash, p_email: email, p_user_id: created.user.id,
    });
    if (acceptError) {
      await service.auth.admin.deleteUser(created.user.id);
      return json({ error: 'invitation_invalid' }, 400, origin);
    }
    return json({ ok: true }, 200, origin);
  }

  const currentOwner = await owner(req);
  if (!currentOwner) return json({ error: 'owner_required' }, 403, origin);

  if (action === 'list') {
    const [{ data: roles, error: rolesError }, { data: invitations, error: invitationsError }, usersResult] = await Promise.all([
      service.rpc('service_list_editor_roles'),
      service.rpc('service_list_editor_invitations', { p_requester: currentOwner.id }),
      service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (rolesError || invitationsError || usersResult.error) return json({ error: 'load_failed' }, 500, origin);
    const emails = new Map(usersResult.data.users.map(user => [user.id, user.email || '']));
    return json({
      editors: (roles || []).map((row: Record<string,unknown>) => ({ ...row, email: emails.get(String(row.user_id)) || '' })),
      invitations: (invitations || []).map((invitation: Record<string, unknown>) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
        accepted_at: invitation.accepted_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
      })),
    }, 200, origin);
  }

  if (action === 'create') {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'invalid_email' }, 400, origin);
    const tokenBytes = new Uint8Array(32); crypto.getRandomValues(tokenBytes);
    const token = bytesToToken(tokenBytes);
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await service.rpc('service_create_editor_invitation', {
      p_requester: currentOwner.id, p_email: email, p_token_hash: tokenHash, p_expires_at: expiresAt,
    });
    if (error) return json({ error: 'invitation_create_failed' }, 400, origin);
    const site = allowedOrigins.has(origin || '') ? origin! : 'https://china-replicas.vercel.app';
    const invitation = Array.isArray(data) ? data[0] : data;
    return json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
        created_at: invitation.created_at,
      },
      invite_url: `${site}/admin/register#token=${encodeURIComponent(token)}`,
    }, 201, origin);
  }

  if (action === 'revoke') {
    const id = String(payload.id || '');
    const { data, error } = await service.rpc('service_revoke_editor_invitation', { p_requester: currentOwner.id, p_id: id });
    if (error || !data) return json({ error: 'invitation_revoke_failed' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }

  return json({ error: 'unknown_action' }, 400, origin);
});

