import type { DeletionWorkerService } from './types.ts';

export async function handleDeletionWorker(
  request: Request,
  deps: {
    enabled: boolean;
    authorized(request: Request): boolean | Promise<boolean>;
    createService(): DeletionWorkerService;
  },
): Promise<Response> {
  if (request.method !== 'POST') return response(405, { error: { code: 'METODO_INVALIDO' } });
  if (!deps.enabled) return response(503, { error: { code: 'PROCESSADOR_DESABILITADO' } });
  if (!await deps.authorized(request)) return response(401, { error: { code: 'NAO_AUTORIZADO' } });

  const limit = await parseLimit(request);
  if (limit === null) return response(400, { error: { code: 'ENTRADA_INVALIDA' } });

  try {
    const counts = await deps.createService().run(limit);
    if (!validCounts(counts)) throw new Error('CONTAGENS_INVALIDAS');
    return response(200, counts);
  } catch {
    return response(503, { error: { code: 'PROCESSAMENTO_INDISPONIVEL' } });
  }
}

async function parseLimit(request: Request): Promise<number | null> {
  let body: unknown;
  try { body = await request.json(); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const object = body as Record<string, unknown>;
  if (Object.keys(object).some((key) => key !== 'limit')) return null;
  if (object.limit === undefined) return 10;
  const limit = object.limit;
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : null;
}

function validCounts(value: unknown): value is { claimed: number; completed: number; pending: number; expired: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const counts = value as Record<string, unknown>;
  return ['claimed', 'completed', 'pending', 'expired'].every((key) =>
    typeof counts[key] === 'number' && Number.isInteger(counts[key]) && counts[key] >= 0);
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
