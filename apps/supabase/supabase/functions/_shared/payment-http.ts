/** Fronteira comum: CORS/POST → token verificado → body validado → operação privilegiada. */
export function createAuthenticatedActionHttpHandler(deps: {
  allowedOrigins: string[];
  authenticate(token: string): Promise<string | null>;
  validateBody(body: Record<string, unknown>): boolean;
  execute(usuarioId: string, token: string, body: Record<string, unknown>, req: Request): Promise<{ status: number; body: unknown }>;
}) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !deps.allowedOrigins.includes(origin)) return json(403, { error: { code: 'ORIGEM_NEGADA' } });
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json(405, { error: { code: 'METODO_INVALIDO' } });
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
    try {
      const token = authorization.slice(7); const usuarioId = await deps.authenticate(token);
      if (!usuarioId) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
      let body: unknown; try { body = await req.json(); } catch { return json(400, { error: { code: 'BODY_INVALIDO' } }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || !deps.validateBody(body as Record<string, unknown>)) return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      const result = await deps.execute(usuarioId, token, body as Record<string, unknown>, req);
      return json(result.status, result.body);
    } catch { return json(503, { error: { code: 'VALIDACAO_INDISPONIVEL' } }); }
  };
}

export function createPaymentHttpHandler(deps: {
  idField: 'pedido_id' | 'tentativa_id';
  allowedOrigins: string[];
  authenticate(token: string): Promise<string | null>;
  validateBody?(body: Record<string, unknown>): boolean;
  execute(id: string, operacaoId: string, usuarioId: string, token: string, body: Record<string, unknown>, req: Request): Promise<{ status: number; body: unknown }>;
}) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !deps.allowedOrigins.includes(origin)) return json(403, { error: { code: 'ORIGEM_NEGADA' } });
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json(405, { error: { code: 'METODO_INVALIDO' } });
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
    try {
      const token = authorization.slice(7);
      const usuario = await deps.authenticate(token);
      if (!usuario) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
      let body: unknown;
      try { body = await req.json(); } catch { return json(400, { error: { code: 'BODY_INVALIDO' } }); }
      const b = body as Record<string, unknown> | null;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const id = b?.[deps.idField];
      if (!b || typeof id !== 'string' || !uuid.test(id) || typeof b.operacao_id !== 'string' || !uuid.test(b.operacao_id)) return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      if (deps.validateBody && !deps.validateBody(b)) return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      const result = await deps.execute(id, b.operacao_id, usuario, token, b, req);
      return json(result.status, result.body);
    } catch { return json(503, { error: { code: 'PAGAMENTO_INDISPONIVEL', message: 'Não foi possível consultar o pagamento. Preserve esta operação para tentar novamente.' } }); }
  };
}
