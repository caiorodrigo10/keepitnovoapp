# Flag de cartão salvo — design MVP

**Nível: MVP / mudança delimitada (bounded).**
**Data:** 2026-10-16. **Estado:** especificado; implementação não executada.
**Plano:** [2026-10-16-flag-cartao-salvo.md](../plans/2026-10-16-flag-cartao-salvo.md).

## Objetivo e limites

Desligar cadastro, apresentação e uso de cartões salvos até a liberação da tokenização na conta Asaas, mantendo cartão digitado sem salvamento e Pix. A pendência da liberação é premissa fornecida pelo solicitante; não houve consulta à conta ou teste no gateway.

- Nesta entrega: somente spec e plano, com commit local exclusivamente desses dois documentos.
- Sem implementação, push, deploy, produção, chamadas ao Asaas ou alterações em telecodex/hermes/app-server.
- Implementação futura: sem dependências novas, migrations, serviço de flags, endpoint de capabilities, cron ou mudanças no esquema.
- Não imprimir segredos nem dados de cartão; testes somente com fixtures sintéticas e dependências simuladas.

## Investigação do código existente

Inspeção local na branch `codex/integracao-piloto`, base `8e540f2`. Não foi encontrada flag equivalente de cartão salvo/tokenização nos fontes de `apps/cliente`, `apps/supabase` e `packages`. Portanto, adicionar a flag ao fluxo existente; não recriar tokenização ou pagamentos. Nenhum arquivo de ambiente com credenciais foi lido.

| Evidência local | Consequência para o MVP |
| --- | --- |
| `apps/supabase/supabase/functions/process-account-deletions/index.ts`: `Deno.env.get('ACCOUNT_DELETION_ENABLED') === 'true'`; `http.ts` recebe `enabled` e devolve 503 quando desligado | Reusar comparação estrita e injeção da flag no handler |
| `apps/cliente/src/config/buildInfo.ts`: `EXPO_PUBLIC_QA_ENABLED` com comparação estrita | Reusar leitura pública estática do Expo; não existe equivalente público de account deletion identificado |
| `tokenize-card/handler.ts`: disponibilidade depende de `CARD_VALIDATION_AMOUNT_CENTS` positivo | Valor de validação não é feature flag; manter sua validação, acrescentar bloqueio independente |
| `reconcile-card-validation/handler.ts`: reconciliação administrativa pode avançar validação/estorno | Bloquear o endpoint inteiro antes de construir dependências privilegiadas |
| `create-card-payment/handler.ts`: variantes `cartao_salvo_id` e cartão digitado com `salvar_cartao`; token é persistido apenas quando há consentimento | Bloquear variante salva e consentimento explícito; preservar ramo digitado sem salvamento |
| `components/checkout/CardPaymentForm.tsx`: salvar começa marcado em compra | Ocultar checkbox e forçar `false` no payload quando desligado |
| `hooks/useSavedCards.ts`, `Perfil.tsx`, `Cartoes.tsx`, `AdicionarCartao.tsx`, `Pagamento.tsx`, `Checkout.tsx`, `ModalProcessandoPagamento.tsx` | Cobrir perfil, checkout, recuperação e acesso direto; esconder apenas uma tela seria insuficiente |
| `packages/core-data/src/payment-errors.ts` e `supabase/payment.supabase.ts` | Acrescentar código à lista permitida para mostrar erro claro em app/servidor com flags divergentes |

## Decisões encerradas

1. **Backend:** `CARD_TOKENIZATION_ENABLED`. **App:** `EXPO_PUBLIC_CARD_TOKENIZATION_ENABLED`, exportada como `CARD_TOKENIZATION_ENABLED` em `apps/cliente/src/config/featureFlags.ts`. Somente a string exata `'true'` liga; ausente, vazia, `'false'`, `'1'`, `'TRUE'` e espaços desligam. Ambas desligadas por padrão.
2. Flags independentes de ambiente e datasource: mesmo comportamento visual em mock e Supabase. A flag pública controla apresentação; o backend é a autoridade para efeitos reais. Não aceitar flag no body/header nem override por usuário, QA ou AsyncStorage.
3. Sem sincronização remota: app lê a configuração pública no bundle e backend no runtime. Alteração pública só aparece em novo bundle. A futura ativação exige liberação Asaas confirmada e ambas as flags ligadas; este plano não realiza ativação nem publicação.
4. **Erro único:** HTTP **503**, `error.code = 'CARD_TOKENIZATION_DISABLED'`, `error.message = 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.'`. Sem IDs, dados de cartão ou detalhes Asaas no erro.
5. Com flag backend desligada, rejeitar `salvar_cartao: true` por inteiro antes de cobrar. Não ignorar silenciosamente o consentimento solicitado por um cliente antigo. O app atualizado envia `false`, portanto sua compra digitada continua normal. Ausência de `salvar_cartao` equivale a falso.
6. Guardas preservam CORS, OPTIONS, método, autenticação, autorização e validação de entrada. Para chamadas válidas/autorizadas, o bloqueio ocorre antes de `createDeps`, claims, consultas a tokens, gravações ou chamadas Asaas. Entradas inválidas e chamadas não autorizadas conservam 400/401/403; preflight continua 204.
7. Nenhum cartão existente é apagado, invalidado ou migrado pela flag. Não alterar RLS/RPCs de listagem/remoção nem prometer bloqueio de leitura por versões antigas. O requisito é ocultar no app atualizado e bloquear os endpoints de operação.
8. Preservar webhook, consulta/encerramento de tentativa e reconciliação financeira de compras já iniciadas. A flag não cancela dinheiro nem interrompe fatos financeiros em andamento. `reconcile-card-validation` fica bloqueado mesmo para pendências; elas permanecem duráveis até reativação. Não criar worker alternativo. Operações já iniciadas podem concluir pelo fluxo existente; não é cancelamento de requests em voo.

## Contrato de comportamento

| Chamada válida/autorizada | Backend desligado | Backend ligado |
| --- | --- | --- |
| `tokenize-card`, `acao: configuracao` | 503 + código único, sem consultar valor/serviço | Comportamento atual |
| `tokenize-card`, `acao: cadastrar` | 503 + código único, sem tokenização/validação | Comportamento atual |
| `reconcile-card-validation` | 503 + código único, sem consultar/avançar operação | Comportamento atual |
| `create-card-payment` com `cartao_salvo_id` | 503 + código único, sem claim/token/cobrança | Comportamento atual |
| `create-card-payment` com `salvar_cartao: true` | 503 + código único, sem cobrança nem persistência | Comportamento atual |
| `create-card-payment` digitado, `salvar_cartao: false` ou ausente | Fluxo atual, sem persistir token retornado pelo gateway | Fluxo atual |
| Pix, webhook, consulta e encerramento de tentativa | Fluxos atuais | Fluxos atuais |

## App cliente

- `useSavedCards`: quando desligada, não consultar nem mutar cartões; retornar lista vazia, sem loading/erro. Manter ordem dos hooks e proteções de sessão existentes.
- `Perfil`: esconder item “Formas de pagamento”, hoje exclusivo de cartões. `Cartoes` e `AdicionarCartao`: manter nomes de rotas, mas retornar uma tela simples de indisponibilidade com voltar, antes de montar o conteúdo que faz chamadas. Isso cobre navegação restaurada e evita reestruturar os stacks.
- `Pagamento`: manter Pix e novo cartão; remover lista, link de adicionar e frase “Salvar este cartão começa marcado”. Com flag desligada, usar “Informe os dados somente na revisão final.”.
- `Checkout`: não sugerir cartão principal, não mostrar resumo salvo e limpar seleção antiga `cartao_salvo`; não escolher automaticamente outra forma nem criar cobrança. Exigir nova escolha.
- Proteger o submit em `Pagamento` enquanto houver seleção salva antiga, inclusive antes do efeito de limpeza. Preservar retomada de pedido já criado; retirar somente `cartaoSalvoId` do destino de navegação quando desligado.
- `ModalProcessandoPagamento`: parâmetro antigo `cartaoSalvoId` abre escolha de cartão novo, sem mostrar cartão/lista. Continua consultando a tentativa; só habilita formulário quando `canSubmitCard` permitir e só cobra após toque explícito.
- `CardPaymentForm`: em compra, ocultar “Salvar este cartão” e enviar `salvarCartao: false`. Cadastro de perfil fica inacessível; defesa local também impede submissão desse modo quando desligado. Manter limpeza de PAN/CVV atual.
- `usePagamentoReal`: normalizar consentimento para falso e recusar tentativa local de usar cartão salvo com o código público. Não alterar polling, Pix, idempotência ou confirmação. Com flag pública ligada e backend desligado, o erro tipado continua legível; modal oferece cartão novo/Pix para recuperação.

## Alternativas descartadas

Ocultar somente a UI deixa clientes antigos chamarem o backend. Usar `CARD_VALIDATION_AMOUNT_CENTS` como chave mistura preço e disponibilidade e não bloqueia compras com token. Serviço remoto de flags/capabilities acrescentaria infraestrutura desnecessária. Duas variáveis explícitas e guardas locais são suficientes.

## Aceite e verificação futura

1. Sem configurar variáveis, todos os caminhos de cartão salvo ficam indisponíveis; somente `'true'` habilita cada camada.
2. UI desligada: nenhuma lista, checkbox ou entrada de cadastro visível; nenhuma chamada de saved cards por foco, refresh ou rota restaurada.
3. Chamadas bloqueadas retornam o código/mensagem definidos; factories, claims, gravações e gateway não são executados. Segurança e OPTIONS continuam funcionando.
4. Cartão digitado com falso/ausente cobra uma vez, mantém idempotência e não salva token mesmo quando o gateway devolve metadados; Pix conserva os testes existentes.
5. Seleção/rota antiga não cria cobrança nem impede usar novo cartão/Pix. Divergência app ligado/backend desligado produz erro legível e permite escolher outra forma.
6. Ligadas explicitamente nos testes, as flags preservam os fluxos atuais de cadastro, validação, salvamento e compra com token. Não mudar consentimento do modo ligado neste MVP.
7. Testes locais Vitest e typecheck dos pacotes afetados; sem teste financeiro real, banco remoto ou deploy. Testes descritos no plano são trabalho futuro, não evidência de implementação nesta entrega.

## Entrega

Plano com **7 tasks**, cada uma com RED → GREEN → verificação e checkpoint de commit local. A presente rodada grava e commita somente esta spec e o plano. Nenhuma questão aberta exige decisão do usuário.
