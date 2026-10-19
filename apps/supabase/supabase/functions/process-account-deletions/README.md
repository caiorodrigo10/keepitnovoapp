# process-account-deletions

Runtime interno de exclusão definitiva. Caio o aciona manualmente uma vez ao
dia, com segredo dedicado e lote limitado. `ACCOUNT_DELETION_ENABLED` permanece
desabilitado por padrão. Não há cron, Vault, fila, dashboard, diário
automatizado ou endpoint público de consulta.

O endpoint aceita somente `POST {"limit"?: 1..20}`. No lote manual expira
retenções F/H e auditoria A vencidas, depois processa exclusões elegíveis,
devolvendo apenas contagens agregadas. Erro, timeout ou resposta perdida nunca
é prova de remoção: o checkpoint só avança depois da releitura/ausência.

## Checklist operacional do piloto

1. Antes de cada lote, Caio registra em arquivo operacional privado, fora do
   conjunto restaurável, para **todas** as solicitações `scheduled` e
   `processing` (inclusive as não vencidas): request ID, UUID, data de
   vencimento e estado. Não registrar senha, JWT, token, contato, URL assinada
   ou payload financeiro.
2. Confirma que a política MVP está habilitada somente no ambiente autorizado,
   que Admin continua fora do processador e que pendências seguem bloqueadas.
   Sete dias tornam a solicitação elegível; não são promessa de conclusão no
   instante do vencimento.
3. Executa lote pequeno, registra somente cenário, data/hora, operador,
   contagens agregadas e códigos fechados. Atualiza o registro após resultados
   confirmados; itens incertos ficam pendentes e com acesso isolado.
4. A exportação prévia é inventário para recuperação, **nunca** comprovação de
   exclusão concluída. O registro é mantido enquanto a solicitação estiver
   ativa e por 180 dias após conclusão/cancelamento.
5. Antes da ativação, Caio registra as janelas efetivas do provedor e confirma
   que cópias/logs sob controle Keepit expiram em até 30 dias da criação, sem
   renovar o prazo ao copiar. Comprovantes mínimos indispensáveis são F; dados
   de terceiros seguem a política declarada por eles. O processador não chama
   Asaas.

## Restore e ensaio manual

Restaurar banco e blobs sintéticos somente em stack isolada. Usar o registro
operacional para reaplicar exclusões confirmadas, conciliar as incertas e
provar ausência de identidade Auth, sessão/refresh e objetos antes de liberar
qualquer acesso. Se o registro não for confiável, o restore permanece isolado.
O ensaio manual não cria script, framework ou automação de recuperação.

## Evidência local da Task 11

Os testes exigem uma stack própria `keepit-account-deletion-task11`, host local,
`KEEPIT_DISPOSABLE_DB=1` e `KEEPIT_EXTERNAL_GATEWAY_BLOCKED=1`; recusam Cloud,
`keepit-dev`, o projeto `jhhbewnmnorhmsdvfppo`, credenciais reais e destino
ambíguo. A evidência sanitizada contém somente nome da stack, cenário, resultado
e contagens — nunca segredo. Depois de uma execução criada para esse fim, parar
somente essa stack com `supabase stop --no-backup`.

### Execução sanitizada — 2026-10-16

| Stack | Cenário | Resultado | Contagens |
| --- | --- | --- | --- |
| `keepit-account-deletion-task11` | pgTAP de redação de repasses | aprovado | 13 asserções, 0 falhas |
| `keepit-account-deletion-task11` | corrida cancelamento/claim no prazo | aprovado | 1 claim, 0 cancelamentos |
| `keepit-account-deletion-task11` | dois workers e lease antiga | aprovado | 2 workers; 1 geração vencedora; escrita tardia negada |
| `keepit-account-deletion-task11` | integração Auth/Storage/SQL para cliente, lojista e duplo | aprovado | 2 testes, 0 falhas, 0 skips |
