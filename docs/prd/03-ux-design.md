# 03 — User Interface Design Goals

## Overall UX Vision

O Keepit apresenta uma experiência **hyper-local, direta e sem gordura**: o cliente abre o app, escolhe o hub mais próximo, encontra produtos das lojas da vizinhança e retira no mesmo lugar. O lojista, do outro lado, opera uma versão espelhada e enxuta focada em receber, preparar e entregar pedidos rapidamente.

A UX é otimizada para o cenário de **encontro sincronizado no hub**: o cliente sabe exatamente quanto tempo esperar (tempo médio do lojista + 10 min de janela), e o lojista sabe exatamente quando sair da loja e o que digitar (PIN de 4 dígitos). Nada precisa ser explicado duas vezes.

Princípios de UX que atravessam o produto:

1. **Simplicidade primeiro**. Se uma tela do protótipo pode ser cortada sem prejuízo da função essencial, ela é cortada (ex.: chat interno → botão WhatsApp; avaliações → v2; favoritos → v2).
2. **Feedback claro do estado**. O usuário sempre sabe onde está no fluxo: aguardando pagamento, aguardando aceite, em preparo, saindo pro hub, entregue.
3. **Botões grandes, textos curtos**. Design otimizado pra uso rápido de balcão / com uma mão.
4. **Nenhum passo ambíguo**. Se o próximo passo depende de outra pessoa (cliente esperando lojista, lojista esperando cliente), a UI explicita quem está esperando quem.

## Key Interaction Paradigms

- **Fluxo linear no cliente**: escolher hub → escolher loja → escolher produto → carrinho → pagar → esperar → ir ao hub → mostrar PIN.
- **Fluxo reativo no lojista**: receber notificação → aceitar → preparar → marcar "Saindo" → ir ao hub → digitar PIN.
- **Estados sempre visíveis** no card do pedido — cliente e lojista veem a mesma linha do tempo, cada um com sua ação atual destacada.
- **Push notifications** como coluna vertebral da coordenação — sem depender do usuário abrir o app pra descobrir mudança de estado.
- **Suporte via WhatsApp** com contexto pré-preenchido (nome do usuário, ID do pedido, motivo do contato) para o operador da Keepit responder rápido.

## Core Screens and Views

### App do Cliente (tema claro)

1. Onboarding "Como funciona" (3 telas)
2. Login / Criar conta / Esqueci minha senha — ~~Confirmação SMS~~ **removida do MVP pela decisão 10.4 (2026-07-29)**: a tela `ConfirmacaoSMS` existe na casca visual (Épico 0) mas fica **fora do fluxo de navegação** do MVP; o cadastro navega direto para a home. Candidata a v2.
3. Home — hubs próximos + categorias
4. Hub selecionado — lojas do hub (com estado Aberta/Fechada/Pausada)
5. Busca (por produto + por loja)
6. Loja · catálogo
7. Detalhe do produto
8. Carrinho + Checkout (com taxa deslocamento, taxa Keepit, total, validações)
9. Escolha do ponto de retirada (confirmar hub)
10. Pagamento (PIX / cartão salvo / novo cartão)
11. Confirmar retirada · PIN (código de 4 dígitos)
12. Recibo · pedido concluído
13. Meus pedidos (Em andamento + Concluídos)
14. Perfil + Configurações (Termos, Privacidade, Excluir conta via WhatsApp, notificações)
15. Ajuda & suporte (WhatsApp)

### App do Lojista (tema dark, `#1B1E1C`)

1. Onboarding + Login
2. Cadastro do estabelecimento (3 passos)
3. "Em análise"
4. Painel · Dashboard (vendas, saldo, ticket médio, top produtos)
5. Pedidos recebidos (Novos / Em preparo / Concluídos)
6. Detalhe do pedido · separar
7. Confirmar retirada · digitar PIN
8. Gerenciar catálogo
9. Cadastrar / editar produto (com upload de foto)
10. Horários & disponibilidade + botão "Pausar novos pedidos"
11. Carteira (saldo disponível / bloqueado)
12. Solicitar saque · PIX
13. Extrato simples (vendas + saques)
14. Perfil público do estabelecimento
15. Configurações (Termos, Privacidade, Excluir conta via WhatsApp)
16. Ajuda & suporte (WhatsApp)

### Painel Admin Keepit (web, tema dark seguindo design system do app do lojista)

1. Login admin
2. Lista de lojistas — aprovar / rejeitar / suspender
3. Detalhe do lojista
4. Lista de pedidos — filtros por status
5. Detalhe do pedido — ação "forçar cancelamento"
6. Fila de reembolsos manuais
7. Lista de clientes — buscar / bloquear
8. CRUD de hubs
9. Dashboard financeiro geral

## Accessibility

**Alvo: WCAG AA** onde a fidelidade ao protótipo permitir. O protótipo já foi desenhado com contraste alto (paleta verde `#75DC8D` sobre `#1B1E1C` no lojista; textos escuros sobre fundos claros no cliente). Ajustes necessários no MVP:

- Tamanho mínimo de fonte para textos secundários ≥ 12px.
- Botões com área de toque ≥ 44×44px.
- Labels claros em todos os inputs (nada só de placeholder).
- Contraste dos textos secundários (cinzas médios) revisado se falhar no teste AA.

Sem esforço adicional para AAA no MVP — pode entrar na v2.

## Branding

O design system está integralmente definido pelo protótipo e deve ser replicado com fidelidade. Extração inclui:

- **Paleta escura (app lojista + admin)**: `#1B1E1C` (fundo), `#75DC8D` (accent verde de marca), `#1F9D57` (sucesso), tons de cinza `#20241A` a `#A6ABA2`, laranja alerta `#E0894A`.
- **Paleta clara (app cliente)**: fundos `#EDF0E8` / `#EFF2EB` / `#F6F7F3`, verdes claros para badges `#CDEED7` / `#DBE6CC` / `#E2F7E8`.
- **Tipografia**: **Hanken Grotesk** nos pesos Regular, Medium, Bold, Extrabold. Tamanhos 10-12px para labels/badges com tracking alto em títulos all-caps.
- **Elementos**: badges arredondados (`border-radius: 20px`), cards com sombra suave, seções em all-caps com letter-spacing (ex.: `ACESSO`, `PRODUTOS`, `RETIRADA & ENCONTRO`).
- **Logo**: casinha estilizada dentro de círculo `#75DC8D` + wordmark "keepit" com bolinha verde após o "t".

Os assets **serão extraídos do HTML bundled** (`keepit-app/index.html`) — fontes em base64 convertidas para `.woff2`, imagens e ícones extraídos, e uma escala de tokens (`ui-tokens/tokens.json`) compartilhada pelos 3 apps no monorepo. Ver Story 1.2 e 1.3.

## Target Device and Platforms

- **App do Cliente**: iOS (iPhone) + Android (smartphone), portrait apenas.
- **App do Lojista**: iOS (iPhone) + Android (smartphone), portrait apenas.
- **Painel Admin**: web responsive, otimizado para **desktop e laptop** (não é objetivo do MVP funcionar bem em mobile — o operador da Keepit usa no navegador de computador).
