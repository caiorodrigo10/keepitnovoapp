# Estabilização do Beta Android — App Cliente

**Data:** 2026-09-04  
**Status:** Aprovado para decomposição em épico e stories  
**Origem:** avaliação beta Android consolidada em 25/08/2026 e investigação do código atual

## 1. Objetivo

Transformar o app Cliente em um beta Android funcional, previsível e testável de ponta a ponta, preservando a identidade visual existente. A rodada deve eliminar os bloqueios observados na avaliação, tornar o modo mock demonstrável sem serviços externos e implementar os fluxos reais necessários para staging e produção.

## 2. Princípios e restrições

- Preservar cores, tipografia, espaçamentos, componentes e referências do design atual.
- Não realizar rebranding, redesign completo ou substituição do design system.
- Mock Cliente e mock Lojista permanecem independentes; não haverá sincronização entre aplicativos no modo mock.
- Telas e hooks consomem contratos de `@keepit/core-data`; a UI não implementa regras diferentes por datasource.
- Adapters mock e Supabase devem apresentar contratos e resultados semanticamente equivalentes quando a operação existir nos dois modos.
- Controles de QA não aparecem nas telas normais nem em builds de produção.
- Mudanças visuais, de teclado ou de safe area exigem validação em APK Android release.
- O termo apresentado ao usuário para `taxa_deslocamento_reais` será “Frete”.

## 3. Modos de execução

### 3.1 Desenvolvimento

- Usa mock e ferramentas técnicas.
- Pode expor logs e diagnóstico local.

### 3.2 QA

- Usa mock persistente.
- Disponibiliza Painel QA centralizado.
- Exibe versão, `versionCode`, commit, datasource e data do build.

### 3.3 Staging

- Usa backend real de homologação.
- Exercita autenticação, favoritos, pedidos, recuperação e exclusão reais.
- Não inclui controles técnicos expostos ao usuário.

### 3.4 Produção

- Usa backend real.
- Não inclui acesso ao Painel QA.
- Deve satisfazer os critérios funcionais e de publicação definidos neste design.

## 4. Arquitetura funcional

```text
Telas e hooks
     ↓
Ports de @keepit/core-data
     ↓
Mock adapter       ou       Supabase adapter
     ↓                         ↓
Estado local persistente     Backend real
```

O mock será um adapter funcional e persistente, não uma coleção de respostas visuais isoladas. O modo real utilizará os mesmos contratos por meio dos adapters Supabase e serviços de backend.

## 5. Mock Cliente persistente

### 5.1 Estado inicial

O cenário inicia zerado:

- sem pedidos;
- sem lojas favoritas;
- sem hubs favoritos;
- sem hub selecionado;
- carrinho vazio;
- conta demo ativa, sem exclusão agendada.

O usuário constrói o estado ao executar os fluxos que desejar.

### 5.2 Dados persistidos

- conta e credenciais demo;
- alterações de perfil e senha;
- exclusão agendada, cancelada ou concluída;
- pedidos, itens, timestamps e status;
- lojas e hubs favoritos;
- hub selecionado;
- carrinho;
- configurações e relógio do cenário QA.

O estado sobrevive ao fechamento e à reabertura do aplicativo. O armazenamento terá versão de schema e migração explícita quando sua estrutura mudar.

### 5.3 Reset

“Resetar cenário” exige confirmação, informa quais dados serão perdidos e restaura a fixture-base zerada. O reset é a única operação normal que retorna todo o mock ao estado inicial.

## 6. Painel de Demonstração/QA

O painel fica disponível somente quando a flag de build de QA estiver ativa. O acesso ocorre por sete toques sobre a identificação de versão no Perfil, sem senha fixa embarcada.

O painel permitirá:

- resetar o cenário;
- visualizar e selecionar a conta demo;
- avançar o relógio simulado;
- inspecionar e avançar pedidos manualmente como contingência;
- habilitar ou pausar o avanço automático de pedidos;
- simular loading, vazio e erro por domínio;
- simular callback de recuperação de senha;
- avançar o prazo de exclusão;
- restaurar a fixture-base;
- consultar versão, commit, ambiente, datasource e data do build.

Quando um estado artificial estiver ativo, o app exibirá uma faixa “Estado simulado ativo”. Simulações não permanecem ocultamente ativas após reset.

## 7. Onboarding

- As três etapas passam a existir em uma única tela paginada.
- A ilustração e o fundo permanecem montados durante a transição.
- O usuário avança por swipe ou botão.
- As etapas 2 e 3 oferecem retorno por swipe e botão visível.
- O botão físico/gesto de voltar do Android acompanha o índice atual.
- Na primeira etapa, uma saída acidental não encerra o fluxo sem confirmação.
- A flag de conclusão só é gravada em “Pular”, “Criar conta” ou “Entrar”.
- Os indicadores refletem sempre a página atual.

## 8. Formulários, teclado e safe areas

Será criado um padrão transversal para telas de formulário e outro para modais/bottom sheets. Eles deverão:

- respeitar safe areas superior e inferior;
- ajustar o conteúdo ao teclado;
- manter o campo focado visível;
- permitir scroll suficiente com o teclado aberto;
- manter CTAs fora das barras do sistema;
- controlar persistência de toque e fechamento do teclado;
- funcionar com navegação por gestos e por três botões.

O padrão será aplicado a cadastro, login, recuperação, perfil, cartão, CEP e CPF. O checkbox de termos deverá alinhar a caixa à primeira linha, manter toda a linha clicável e expor estado acessível de seleção e erro.

## 9. CPF

- O modal utilizará o wrapper padronizado de bottom sheet.
- Título, explicação, campo, erro e CTA permanecerão visíveis com teclado aberto.
- A máscara e validação de dígitos verificadores atuais serão preservadas.
- Falha de `updateCpf` será apresentada sem marcar o CPF como coletado.
- Submit duplo será bloqueado.
- O travamento relatado será investigado em APK release com instrumentação do `onChangeText` e profiling de renderização.
- Nenhuma alteração de performance será considerada correção sem reprodução e medição.

## 10. Pedidos do Cliente em mock

O mock não depende do app Lojista. Após a criação e confirmação do pagamento, o pedido progride automaticamente como se o lojista executasse as ações:

```text
aguardando_pagamento
→ aguardando_aceite
→ aceito após X segundos
→ em_preparo após Y segundos
→ saindo_hub após Z segundos
→ no_hub
```

A entrega não é automática, pois depende da retirada/PIN. Cancelamento, recusa e falhas podem ser acionados pelo Painel QA.

As transições serão baseadas em timestamps persistidos. Ao reabrir o app, o mock calcula e aplica as transições vencidas, sem depender de timers que permaneceriam ativos em background.

Pedidos recém-criados aparecem imediatamente em “Em andamento”. Ao alcançar estado terminal, migram para “Concluídos”. Loading, vazio, erro e conteúdo são estados distintos.

## 11. Consistência de pedidos e perfil

- Perfil, Meus Pedidos e detalhe consomem a mesma coleção/consulta.
- O contador é derivado da coleção, nunca mantido como valor independente.
- A invariante obrigatória é: total do Perfil igual à soma dos pedidos exibíveis nas abas “Em andamento” e “Concluídos”.
- Criação, transição, cancelamento, entrega e reset notificam todos os consumidores.
- Estados simulados no Painel QA ficam explicitamente identificados.

## 12. Favoritos de hubs e lojas

Existirão contratos separados para listar, consultar, favoritar e desfavoritar hubs e lojas.

### 12.1 Mock

- Persistência local vinculada à conta demo.
- Estado otimista com reversão em falha.
- Sem limite inicial de favoritos.
- Reset restaura listas vazias.

### 12.2 Real

- Persistência vinculada à conta e sincronizada entre dispositivos.
- Relações separadas para hubs e lojas.
- RLS restringe leitura e mutação ao próprio usuário.
- Restrição de unicidade impede duplicatas.

Lojas e hubs favoritos indisponíveis permanecem visíveis, com estado textual e visual de indisponibilidade. Um hub indisponível não pode ser selecionado para novo pedido.

## 13. Hub, loja e carrinho

- Tocar em um hub salva a seleção e retorna imediatamente à tela anterior.
- O botão “Confirmar ponto” deixa de existir.
- Home, buscas, carrinho e checkout refletem a seleção.
- A tela anterior mostra o hub escolhido e a ação “Alterar”.
- Ao trocar de hub ou loja com carrinho preenchido, o app informa que o carrinho será zerado.
- Após confirmação, o carrinho é zerado e a nova seleção é persistida.
- Nenhuma troca remove itens silenciosamente.
- O carrinho continua limitado a uma loja por pedido.

## 14. Visibilidade e estado das lojas

- Home e tela de Hub listam somente lojas disponíveis para compra.
- A busca pode retornar lojas abertas, fechadas e pausadas.
- Fechadas e pausadas apresentam estado visualmente diferente e exibem texto explícito.
- O usuário pode abrir e consultar o catálogo de loja indisponível.
- Adicionar itens e finalizar compra ficam bloqueados enquanto a loja estiver indisponível.
- Lojas favoritas indisponíveis permanecem na seção de favoritos.
- A regra de disponibilidade será centralizada e usada por todas as superfícies.

## 15. Busca e estados vazios

A busca distinguirá:

- carregamento;
- erro;
- nenhum resultado geral;
- nenhuma loja;
- nenhum produto;
- categoria sem resultado;
- resultados e sugestões.

Sem texto, a tela apresenta sugestões e recentes. Se apenas uma seção possuir resultados, somente ela ocupa espaço. Sugestões gerais ficam identificadas e separadas dos resultados da categoria; nenhuma área vazia será reservada para conteúdo inexistente.

## 16. Header, navegação e acessibilidade

Será criado um header compartilhado com:

- altura e padding padronizados;
- ícone vetorial de voltar;
- slots esquerdo e direito simétricos;
- título geometricamente centralizado;
- variantes para badge, subtítulo e ação lateral;
- fallback seguro quando não houver histórico;
- área de toque e labels acessíveis.

Acessibilidade também inclui estado selecionado/favoritado, área mínima de toque, escala de fonte e contraste suficiente para itens indisponíveis.

## 17. Recuperação de senha

### 17.1 Real

- Solicitação por e-mail e callback de recuperação usam o backend/provedor real.
- Link inválido, expirado ou consumido apresenta retorno seguro.
- Nova solicitação invalida o caminho anterior conforme capacidade do provedor.
- Após redefinição, a sessão de recuperação é encerrada.

### 17.2 Mock

- A confirmação oferece ação identificada como demonstração para abrir o callback simulado.
- A sessão mock pode ser válida, expirada ou já consumida.
- A nova senha substitui a credencial demo e é exigida no próximo login.
- O reset restaura a senha inicial.

## 18. Exclusão agendada de conta

### 18.1 Fluxo no app

- O usuário encontra a ação no Perfil.
- A tela informa consequências e prazo.
- O usuário confirma e se reautentica com a senha atual.
- O backend registra solicitação e data prevista para sete dias depois.
- A sessão atual é encerrada.
- Novo login durante o prazo abre exclusivamente “Exclusão agendada”.
- A tela oferece “Recuperar minha conta” e “Sair”.
- Cancelar a exclusão restaura o acesso normal sem atendimento.

### 18.2 Conclusão no backend

- Uma tarefa segura e idempotente conclui solicitações vencidas.
- Dados pessoais são removidos ou anonimizados.
- Dados que precisem ser retidos seguem política previamente validada; a implementação não inventará regras de retenção.
- Auditoria registra somente o necessário para provar o processamento.

### 18.3 Mock/demo

- O mesmo fluxo visual agenda a exclusão no estado local.
- O Painel QA pode avançar o relógio.
- Após o prazo simulado, o login é bloqueado e os dados ativos são eliminados/anonimizados no mock.
- O reset restaura a conta demo.

### 18.4 Recurso externo

Uma página pública mínima permitirá iniciar a solicitação sem reinstalar o app. Ela utilizará o mesmo serviço de exclusão e terá identificação/verificação, informação do prazo, agendamento e suporte. O fluxo principal permanece dentro do app.

## 19. Terminologia de frete

O label “Frete” será centralizado e utilizado em detalhe da loja, carrinho, checkout, pagamento, recibo e mensagens. O campo técnico `taxa_deslocamento_reais` pode permanecer inalterado.

## 20. Identificação e rastreabilidade do build

Builds QA exibem:

- versão;
- `versionCode`/build number;
- commit SHA;
- datasource;
- ambiente;
- data do build.

Essas informações aparecem no Perfil e no Painel QA. A geração de APK deve impedir reaproveitamento silencioso de bundle incompatível com o commit declarado.

## 21. Tratamento de erros

- Toda operação assíncrona apresenta loading, sucesso, vazio ou erro explícito.
- Falha de persistência nunca mostra sucesso.
- Favorito otimista reverte quando a gravação falha.
- Troca de hub/loja não limpa o carrinho antes da confirmação.
- Solicitar, cancelar e concluir exclusão são operações idempotentes.
- Erros de sessão direcionam para recuperação segura, sem expor detalhes internos.

## 22. Estratégia de testes

Cada story inclui, conforme seu escopo:

- testes de funções puras;
- testes dos adapters mock;
- testes dos adapters Supabase;
- testes de persistência e migração do mock;
- testes de componentes e interação;
- testes de navegação;
- verificação manual em APK Android release.

Pedidos usam relógio falso nos testes automatizados. A matriz Android mínima cobre tela pequena e grande, gestos e três botões, Gboard, escala de fonte aumentada, reinício do app, rede normal/lenta/indisponível, instalação limpa e atualização sobre versão anterior.

## 23. Critérios do release candidate

- Fluxos Cliente executáveis no modo correspondente.
- Mock persistente e reset restaurando cenário zerado.
- Controles QA ausentes em produção.
- Pedidos novos e terminais nas abas corretas.
- Contador do Perfil consistente.
- Nenhum campo ou CTA obrigatório encoberto por teclado ou barras do Android.
- Favoritos funcionando em mock e real.
- Exclusão funcionando no app, mock, backend e recurso externo.
- Recuperação de senha funcionando em staging e mock.
- APK com identificação verificável.
- Testes automatizados e roteiro Android aprovados.

## 24. Decomposição aprovada do épico

1. Infraestrutura de mock persistente.
2. Painel QA e identificação do build.
3. Teclado, safe areas e wrappers de formulário.
4. Header compartilhado e acessibilidade estrutural.
5. Onboarding contínuo e reversível.
6. CPF: modal, erros e investigação de desempenho.
7. Ciclo automático de pedidos no mock.
8. Consistência entre pedidos, histórico e Perfil.
9. Seleção de hub/loja e limpeza do carrinho.
10. Estados das lojas, busca e estados vazios.
11. Favoritos de hubs e lojas.
12. Recuperação de senha real e mock.
13. Exclusão agendada no app, backend, mock e recurso externo.
14. Consolidação, terminologia, acessibilidade e QA Android.

Cada item será uma story independente. Depois de aprovada, cada story receberá um plano técnico Superpowers próprio antes da implementação.

## 25. Fora do escopo

- sincronização entre mocks Cliente e Lojista;
- alterações funcionais no app Lojista;
- redesign ou rebranding;
- substituição do design system;
- publicação efetiva nas lojas;
- funcionalidades sem relação com a avaliação beta e as decisões registradas neste documento.
