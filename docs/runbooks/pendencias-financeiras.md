# Pendências financeiras do piloto

## Objetivo

Garantir que toda operação externa incerta permaneça visível, correlacionável e bloqueada até uma conferência humana. Este procedimento não cria cobrança, reembolso ou repasse. As ações financeiras continuam nos fluxos administrativos já existentes.

## Rotina diária

O responsável financeiro executa esta rotina uma vez por dia útil e registra a verificação no controle operacional privado, fora do Git.

1. Abra **Admin > Financeiro > Pendências financeiras** sem filtros de período.
2. Registre data, hora, responsável e quantidade de itens por tipo.
3. Para cada item, copie para o registro privado: pedido, operação, idade, último resultado, último erro e referência externa. Não copie chave, token, CPF, dados bancários completos ou conteúdo de comprovante.
4. Consulte o Asaas pela referência externa. Quando a referência estiver ausente, pesquise somente pela referência durável da tentativa, nunca crie outra cobrança.
5. Consulte o extrato bancário antes de concluir reembolso ou repasse com resposta perdida.
6. Execute somente a ação mostrada na fila e recarregue a fila após o resultado.
7. Registre a fonte consultada, o resultado comprovado, a resolução, o horário e a identidade do operador.

Casos abertos há mais de um dia útil aparecem sinalizados e devem ser priorizados. Tempo decorrido não confirma pagamento, estorno ou PIX.

## Tratamento por tipo

| Tipo | Conferência | Ação permitida | Condição de encerramento |
| --- | --- | --- | --- |
| Reconciliação com ID Asaas | Consultar a cobrança pelo ID exibido e conferir pedido, valor, meio e estado | **Reconciliar pagamento** | A releitura persistida remove a tentativa da fila ou mantém estado incerto |
| Reconciliação sem ID Asaas | Buscar no Asaas somente pela referência da tentativa | **Reconciliar pagamento** | Uma única cobrança compatível pode ser vinculada; zero ou várias mantêm o caso aberto |
| Evento divergente | Abrir **Inspecionar pedido** e conferir evento, cobrança, tentativa e pedido no Admin e no Asaas | **Inspecionar pedido** | Um evento posterior da mesma tentativa ou cobrança registra resultado sem erro; esse estado persistido retira a divergência da fila |
| Reembolso pendente ou com erro | Conferir pedido, reserva, referência e efeito no Asaas/banco | **Tratar reembolso** | Efeito externo comprovado é registrado, ou ausência de efeito é comprovada antes de reabrir/liberar |
| Repasse em análise | Conferir lote, operação, comprovante privado e extrato bancário | **Revisar repasse** | PIX comprovado é confirmado uma vez, ou ausência de PIX é documentada antes de liberar fontes |

## Resposta perdida e concorrência

- Não repita uma ação que possa movimentar dinheiro para “ver se funciona”.
- Recarregue o item e consulte a fonte externa antes de qualquer nova decisão.
- Reutilize o mesmo identificador de operação nos fluxos que o preservam.
- Se duas sessões atuarem ao mesmo tempo, uma deve reler o resultado persistido. Divergência ou ambiguidade mantém o caso aberto.
- A ausência de resposta da rede não comprova falha externa.

## Escalonamento

Escalone ao responsável financeiro e ao responsável técnico quando ocorrer qualquer um destes casos:

- mais de uma cobrança para a mesma tentativa;
- pedido, valor ou meio divergente;
- efeito no Asaas sem vínculo local;
- referência já usada por outra operação;
- repasse ou reembolso com efeito bancário incerto;
- pendência aberta por mais de um dia útil sem evidência suficiente.

A nova API do Asaas e testes de rede/sandbox pertencem ao gate posterior. Até esse gate, este runbook usa somente a fila local, consultas humanas autorizadas e registros persistidos existentes.

## Evidência local do ciclo de cancelamento e ausência — 02/10/2026

Validação executada em uma pilha Supabase local descartável, identificada como `keepit-task8-validation`, com todas as migrations versionadas aplicadas. O pgTAP `cancelamento_pin.test.sql` passou com 51 testes:

- cancelamento antes do aceite encerra o pedido como `cancelado`; quando já pago, reserva um único reembolso integral;
- cancelamento depois do aceite abre solicitação e mantém o pedido em curso até decisão Admin;
- ausência do cliente abre solicitação `cliente_ausente`, mantém o pedido em `no_hub` e não reserva reembolso enquanto aberta;
- ausência do lojista abre atendimento, mantém o pedido em `no_hub` e não reserva reembolso enquanto aberta;
- atraso abre atendimento, mantém o pedido em `em_preparo` e não reserva reembolso enquanto aberto;
- aprovação Admin torna o pedido `cancelado_admin` e reserva um único reembolso; PIN confirmado encerra solicitações relacionadas e gera um único crédito ao lojista.

No adapter real, `cancel` e `markCustomerNoShow` chamam `abrir_solicitacao_pedido`; `reportLojistaNaoVeio` chama `reportar_lojista_nao_veio`. Os testes unitários focados confirmaram as RPCs, a releitura do pedido e o mapeamento dos erros nomeados de autenticação, motivo, pedido, acesso e estado.

Esta evidência é exclusivamente local. Não comprova migration remota, publicação de app, smoke em dispositivo, integração com Asaas ou disponibilidade em ambiente de homologação/produção. `advanceStatus` continua restrito ao painel de QA/demo e não possui operação real no adapter Supabase.
