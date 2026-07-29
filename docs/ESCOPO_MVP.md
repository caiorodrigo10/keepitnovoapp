# Keepit — Escopo do MVP

Complemento de `ENTENDIMENTO_APP.md`. Este documento consolida o **escopo acordado** para o MVP e os princípios que devem guiar as decisões técnicas.

## Produtos que compõem o MVP

Três produtos, um único backend:

1. **App do Cliente** — nativo **iOS + Android**. Interface conforme protótipo (tema claro).
2. **App do Lojista (Parceiro)** — nativo **iOS + Android**. Interface conforme protótipo (tema dark `#1B1E1C`).
3. **Painel de Controle (Admin Keepit)** — painel **básico**, uso interno dos donos da Keepit. Objetivo: cruzar dados de clientes finais e de estabelecimentos. Web.

## Princípios de execução

- **Fidelidade ao protótipo**: a interface deve ser **exatamente** como o material entregue em `keepit-app/index.html`. Não repropor UX no MVP.
- **Backend simples e funcional**: deve funcionar bem, mas sem sofisticação. Priorizar clareza e velocidade de entrega.
- **Sem preocupação com escalabilidade agora**: não introduzir cache distribuído, filas, microserviços, sharding, feature flags complexos ou qualquer camada motivada por "e se crescer". Vertical simples serve.
- **Nada além do necessário**: se uma feature não está no protótipo nem é regra de negócio essencial para operar a transação (comprar → separar → retirar com PIN → repassar dinheiro), fica fora do MVP.

## Papéis no projeto

- **Stakeholder / dono do produto**: dono(s) da Keepit. É quem decide regras de negócio (taxa, prazo de repasse, política de reembolso, modelo do hub, etc.).
- **Desenvolvedor do produto (usuário desta conversa — Caio)**: responsável pela construção técnica. Não é o decisor das regras de negócio — leva ao stakeholder tudo o que ultrapassa decisão técnica.
- **Claude (assistente)**: antes de assumir qualquer regra de negócio, deve **perguntar**. Se a resposta depende do stakeholder, registrar em `PERGUNTAS_REGRAS_NEGOCIO.md` como pendente, sem inventar default.

## O que ainda precisa ser decidido antes de codar

Regras de negócio críticas ainda em aberto — ver `PERGUNTAS_REGRAS_NEGOCIO.md`. As mais bloqueantes:

- **Gateway/meio de pagamento** (PIX + cartão, split entre lojista e Keepit).
- **Modelo financeiro do repasse**: escrow até confirmação do PIN? SLA de liberação? Quem cobre chargeback?
- **Operação do hub**: quem opera, horários, estoque intermediário.
- **Fluxos de exceção**: cliente não aparece, lojista não entrega no hub, PIN não bate, cancelamento, reembolso.

Enquanto essas respostas não vierem, não faz sentido travar arquitetura de pagamento nem modelagem de estados de pedido.
