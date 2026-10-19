---
name: design-refs-nao-sao-fonte-unica
description: As PNGs em docs/design-refs/ são recortes com cropping — a fonte de verdade da copy é keepit-app/index.html; grepar o HTML antes de declarar algo "inventado"
metadata:
  type: project
---

As capturas em `docs/design-refs/*.png` são recortes de um screenshot full-page do protótipo e **podem estar cortadas**. Elas são a referência de *layout*, mas **não** são a fonte de verdade da **copy**. A fonte de verdade textual é `keepit-app/index.html` (é HTML, então dá para grepar a string exata).

**Why:** em 2026-07-30, a validação da Story 2.1 concluiu que a frase *"Retira com código PIN no ponto"* era invenção do autor do épico, porque em `_design-system-legend.png` o card 2 aparece truncado e o card 3 nem aparece. Grepando o `index.html`, as três frases estão lá **literalmente** — o que estava errado era só o *contexto* atribuído a elas (bloco "COMO FUNCIONA" da legenda do design system, não copy de tela). Concluir "invenção" a partir do PNG teria produzido uma correção errada.

**How to apply:** ao aplicar Article IV (No Invention) sobre qualquer AC que cite texto de tela, grepar `keepit-app/index.html` **antes** de declarar a copy inventada. Duas armadilhas já confirmadas nesse arquivo: (1) o protótipo tem **uma única** tela de onboarding do Cliente (frame "01 · Onboarding") — qualquer AC que fale em 3 telas está descrevendo reconstrução, não protótipo; (2) rótulos como *"Passo 1 de 3"* e *"Continuar"* existem no HTML mas pertencem ao **Cadastro do estabelecimento do Lojista (frame P6)** — a mera presença da string não prova que ela é daquela tela. Distinguir sempre "a string existe" de "a string é desta tela". Relacionado: [[project-sms-removal-doc-debt]].

**Mapa de offsets de `keepit-app/index.html` (460.961 chars) — resolve "de qual app é esta string":**

| Faixa | Conteúdo |
|---|---|
| 0 – 272.042 | Legenda do design system (bloco "COMO FUNCIONA") — **não é copy de tela** |
| 272.043 – 374.606 | **App Cliente**, frames 01 Onboarding … 14 Recibo |
| 374.607 – fim | **App Lojista**, frames P1 … P11 |

Frames do Cliente: 01=272043, 02=276953, 03=287654, 04=294934, 05=302810, 06=309120, 07=317361, 08 Perfil=325034, 09 Criar conta=335223, 10 Login=341824, 11=347870, 12=354749, 13=360294, 14=366977. Lojista: P1=374630, P2=385926, P3=394803, P4=402342, P5=411114, P6=419901, P7=426122, P8=433052, P9=439773, P10=446098, P11=453486. **Admin não existe no protótipo.** Método: localizar o offset da string, achar em que faixa/frame cai, e só então afirmar a que tela pertence.

**Correção da correção (2026-07-30) — o pêndulo passou do ponto.** Depois de constatar que as frases eram do bloco "COMO FUNCIONA" e não de uma tela capturada, a AC2 da Story 2.1 passou a **proibir** usá-las e mandou manter a copy reconstruída no Épico 0. Isso inverteu o Article IV: preservou texto **efetivamente inventado** e barrou texto que está **literalmente no protótipo**. Resolvido fechando a 10.7 por fidelidade: o princípio nº 1 do `CLAUDE.md` faz de `keepit-app/index.html` a fonte autoritativa de **conteúdo**, não só de layout. **Regra prática:** quando a escolha é entre *copy do protótipo em contexto imperfeito* e *copy reconstruída por um agente*, vence a do protótipo — a dúvida de contexto vira nota de rastreabilidade, não veto.
