import type { AsaasCardInput, AsaasHolderInput } from '../_shared/asaas.ts';
import { advanceCardValidation, type CardValidationDeps } from '../_shared/card-validation.ts';
import { createAuthenticatedActionHttpHandler } from '../_shared/payment-http.ts';
import { cardTokenizationDisabled } from '../_shared/card-tokenization.ts';
import { trustedPayerIp } from '../create-card-payment/handler.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cardFields = ['holderName', 'number', 'expiryMonth', 'expiryYear', 'ccv'];
const holderFields = ['name', 'email', 'cpfCnpj', 'postalCode', 'addressNumber', 'phone'];
function exactStrings(value: unknown, fields: string[]): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((key) => typeof (value as Record<string, unknown>)[key] === 'string' && ((value as Record<string, string>)[key]).trim().length > 0);
}
function validRegistration(body: Record<string, unknown>): boolean {
  if (Object.keys(body).some((key) => !['acao', 'operacao_id', 'cartao', 'titular'].includes(key)) || body.acao !== 'cadastrar' || typeof body.operacao_id !== 'string' || !uuid.test(body.operacao_id)) return false;
  const card = body.cartao; const holder = body.titular;
  return exactStrings(card, cardFields) && /^\d{13,19}$/.test(card.number) && /^(0[1-9]|1[0-2])$/.test(card.expiryMonth) && /^20\d{2}$/.test(card.expiryYear) && /^\d{3,4}$/.test(card.ccv)
    && exactStrings(holder, holderFields) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder.email) && /^(\d{11}|\d{14})$/.test(holder.cpfCnpj) && /^\d{8}$/.test(holder.postalCode) && /^\d{10,13}$/.test(holder.phone);
}
export function createTokenizeCardHttpHandler(deps: {
  allowedOrigins: string[]; amountCents(): number | null; authenticate(token: string): Promise<string | null>; authorizeClient(token: string, userId: string): Promise<boolean>;
  trustedIp?(req: Request): string | null; createDeps(token: string): CardValidationDeps; advance?: typeof advanceCardValidation; enabled?: boolean;
}) {
  return createAuthenticatedActionHttpHandler({
    allowedOrigins: deps.allowedOrigins, authenticate: deps.authenticate,
    validateBody: (body) => (Object.keys(body).length === 1 && body.acao === 'configuracao') || validRegistration(body),
    async execute(usuarioId, token, body, req) {
      if (body.acao === 'cadastrar' && !await deps.authorizeClient(token, usuarioId)) {
        return { status: 403, body: { error: { code: 'ACESSO_NEGADO' } } };
      }
      if (deps.enabled !== true) return cardTokenizationDisabled();
      const amount = deps.amountCents();
      if (!Number.isSafeInteger(amount) || amount! <= 0) return { status: 503, body: { error: { code: 'VALIDACAO_INDISPONIVEL' } } };
      if (Object.keys(body).length === 1 && body.acao === 'configuracao') return { status: 200, body: { disponivel: true, valorCentavos: amount } };
      const remoteIp = (deps.trustedIp ?? trustedPayerIp)(req);
      if (!remoteIp) return { status: 400, body: { error: { code: 'IP_PAGADOR_INDISPONIVEL' } } };
      const advance = deps.advance ?? advanceCardValidation;
      const result = await advance({ clienteId: usuarioId, operationId: body.operacao_id as string, cartao: body.cartao as AsaasCardInput, titular: body.titular as AsaasHolderInput, remoteIp, valorCentavos: amount! }, deps.createDeps(token));
      return { status: 200, body: result };
    },
  });
}
