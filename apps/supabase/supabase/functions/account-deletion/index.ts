/// <reference path="../_shared/deno-globals.d.ts" />

import { createClient } from '@supabase/supabase-js';

import {
  handleAccountDeletion,
  parseAccountDeletionInput,
  type AccountDeletionInput,
  type AccountDeletionRecord,
  type AccountDeletionRepository,
} from './handler.ts';

type Row = {
  status: AccountDeletionRecord['status'];
  requested_at: string;
  delete_at: string;
};

type QueryResult = { data: Row | null; error: { code?: string; message: string } | null };
type ServiceClient = {
  rpc(
    fn: 'cancel_account_deletion_request',
    args: { p_user_id: string },
  ): { maybeSingle(): Promise<QueryResult> };
  from(table: 'account_deletion_requests'): {
    select(columns: string): any;
    insert(values: { user_id: string }): { select(columns: string): { single(): Promise<QueryResult> } };
  };
};

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const ROW_COLUMNS = 'status,requested_at,delete_at';

function toRecord(row: Row | null): AccountDeletionRecord | null {
  return row && { status: row.status, requestedAt: row.requested_at, deleteAt: row.delete_at };
}

function repository(client: ServiceClient): AccountDeletionRepository {
  const latest = async (userId: string): Promise<AccountDeletionRecord | null> => {
    const { data, error } = await client
      .from('account_deletion_requests')
      .select(ROW_COLUMNS)
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle() as QueryResult;
    if (error) throw new Error(error.message);
    return toRecord(data);
  };

  return {
    status: latest,
    async schedule(userId) {
      const { data, error } = await client
        .from('account_deletion_requests')
        .insert({ user_id: userId })
        .select(ROW_COLUMNS)
        .single();
      if (!error && data) return toRecord(data)!;
      if (error?.code === '23505') {
        const current = await latest(userId);
        if (current?.status === 'scheduled' || current?.status === 'processing') return current;
      }
      throw new Error(error?.message ?? 'account deletion schedule failed');
    },
    async cancel(userId) {
      const { data, error } = await client
        .rpc('cancel_account_deletion_request', { p_user_id: userId })
        .maybeSingle();
      if (error) throw new Error(error.message);
      return toRecord(data) ?? latest(userId);
    },
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: RESPONSE_HEADERS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED' } }), { status: 405, headers: RESPONSE_HEADERS });
  }

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401, headers: RESPONSE_HEADERS });
  }

  const token = authorization.slice('Bearer '.length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user?.email) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401, headers: RESPONSE_HEADERS });
  }

  let rawInput: unknown;
  try {
    rawInput = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: { code: 'INVALID_BODY' } }), { status: 400, headers: RESPONSE_HEADERS });
  }
  const input: AccountDeletionInput | null = parseAccountDeletionInput(rawInput);
  if (!input) {
    return new Response(JSON.stringify({ error: { code: 'INVALID_BODY' } }), { status: 400, headers: RESPONSE_HEADERS });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await handleAccountDeletion(input, { id: user.id, email: user.email }, {
    repository: repository(serviceClient as unknown as ServiceClient),
    async reauthenticate(email, password) {
      const perRequestClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await perRequestClient.auth.signInWithPassword({ email, password });
      return error || !data.user ? null : { id: data.user.id };
    },
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: { code: result.error.code } }), {
      status: result.error.status,
      headers: RESPONSE_HEADERS,
    });
  }
  return new Response(JSON.stringify(result.data), { status: 200, headers: RESPONSE_HEADERS });
});
