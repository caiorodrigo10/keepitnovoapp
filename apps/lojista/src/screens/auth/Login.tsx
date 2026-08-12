import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { resolveRotaPosLogin } from '../../lib/loginRouting';
import type { AuthStackParamList } from '../../navigation/types';
import { signInLojista } from '../../navigation/lojistaSession';
import { useCadastroDraft } from './CadastroDraftContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Story 3.10 (Task, AC1, AC6): mensagem genérica sem fonte no protótipo/épico
 * (mesma natureza/texto do login do Cliente — `apps/cliente/src/screens/auth/Login.tsx`,
 * Story 2.6 — texto de UI, não regra de negócio). Deliberadamente única para
 * credencial inválida OU qualquer outra falha de `signIn` — o Supabase Auth
 * não distingue "e-mail não cadastrado" de "senha errada", e não há razão de
 * segurança para a UI revelar essa diferença.
 */
const MSG_CREDENCIAIS_INVALIDAS = 'E-mail ou senha incorretos. Tente novamente.';

/**
 * Story 3.10 (AC6): mensagem para quando o login teve SUCESSO mas a leitura
 * do próprio estabelecimento falhou de verdade (rede/RLS) — distinto do caso
 * "0 linhas" (AC4, nunca um erro). Nenhuma rota é decidida quando isto
 * acontece (AC6).
 */
const MSG_ERRO_LEITURA_ESTABELECIMENTO =
  'Não foi possível carregar os dados da sua loja agora. Tente novamente em instantes.';

/**
 * Login do Lojista — Story 0.8 (Task 8)/9.0.4 (sessão mock local), religada
 * a uma autenticação real pela Story 3.10 (AC1-AC6).
 *
 * Sem tela literal no protótipo do App Lojista — segue o padrão visual dark
 * equivalente ao Login do App Cliente (Story 0.4), usando apenas os tokens
 * de design como referência.
 *
 * **AC1.** "Entrar" chama `getDataClient().lojistaAuth.signIn(email, senha)`
 * (Supabase Auth real em `DATA_SOURCE=supabase`, decisão 10.4 — mesma
 * estrutura do Cliente/Admin). Credencial inválida rejeita a Promise: nenhuma
 * navegação, nenhuma sessão (nem real, nem a sessão mock local de
 * `lojistaSession.ts`) é estabelecida — só o banner de erro. Em
 * `DATA_SOURCE=mock`, a "permissividade" preservada é a mesma dos mocks
 * irmãos (Cliente/Admin): a SENHA não é validada, mas o e-mail precisa
 * corresponder a uma conta já criada nesta sessão do mock (via
 * `CadastroPasso1#signUp`) — ver JSDoc de `lojista-auth.mock.ts` para o
 * racional completo desse `[AUTO-DECISION]`.
 *
 * **AC2-AC6 — roteamento imperativo, não reativo.** Diferente do
 * `Login.tsx` do Cliente (Story 2.3.1/2.6, que só alterna Auth/Main via
 * `onAuthStateChange`), esta tela navega explicitamente após ler o PRÓPRIO
 * `estabelecimentos` (`getDataClient().estabelecimentoCadastro.getMeuEstabelecimento()`)
 * — `[AUTO-DECISION]`: o Lojista tem 5 ramos de destino, todos dentro do
 * MESMO `AuthStack` (`EmAnalise`, `CadastroRejeitado`, retomada do wizard,
 * `ContaIndisponivel`), não um simples Auth/Main binário; e o ramo "sem
 * estabelecimento" (AC4) precisa popular `CadastroDraftContext` (só acessível
 * de dentro do `AuthStack`) antes de navegar — um `RootNavigator` reativo
 * teria que ser içado para dentro do `CadastroDraftProvider` para fazer o
 * mesmo, mudança estrutural bem maior que o escopo desta Story. Navegação
 * imperativa dentro do `AuthStack` já é um padrão estabelecido neste app
 * (`CadastroPasso1` navega para `CadastroPasso2` após `signUp`; `EmAnalise`
 * navega para `Login` no botão "Entendi").
 *
 * A ÚNICA transição que continua reativa é `Auth` → `Main`: quando o status
 * lido é `'ativo'`, esta tela chama `signInLojista()` (sessão mock local,
 * `../../navigation/lojistaSession.ts`) — `RootNavigator` observa essa
 * sessão e troca para `Main` sozinho, exatamente como antes da Story 3.10.
 * Isso preserva o mecanismo existente (nenhuma tela de `MainTabs` lê a
 * identidade real do lojista logado ainda — reconciliar isso é carry-forward
 * para o Épico 6+, fora do escopo desta Story) enquanto garante que
 * `signInLojista()` só é chamado como CONSEQUÊNCIA do status real `'ativo'`
 * — nunca mais incondicionalmente a qualquer toque no botão.
 *
 * **AC6.** Falha real (não "0 linhas") na leitura do próprio estabelecimento
 * — após um `signIn` bem-sucedido — exibe `MSG_ERRO_LEITURA_ESTABELECIMENTO`
 * e não decide rota nenhuma (sem fallback silencioso).
 */
export default function Login({ navigation }: Props) {
  const { updateDraft } = useCadastroDraft();
  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleEntrar() {
    setSubmitError(null);
    setLoading(true);

    const client = getDataClient();

    try {
      await client.lojistaAuth.signIn(identificador.trim(), senha);
    } catch {
      // AC1: credencial inválida (ou qualquer outra falha de signIn) —
      // mensagem genérica, sem navegar, sem sessão.
      setSubmitError(MSG_CREDENCIAIS_INVALIDAS);
      setLoading(false);
      return;
    }

    try {
      const meuEstabelecimento = await client.estabelecimentoCadastro.getMeuEstabelecimento();
      const decisao = resolveRotaPosLogin(meuEstabelecimento);

      switch (decisao.tipo) {
        case 'retomarWizard': {
          // AC4 — conta existe, sem nenhuma linha em `estabelecimentos`
          // ainda (0 linhas, nunca um erro): retoma o wizard a partir do
          // Passo 2, pulando o `signUp` (já feito). Prefill best-effort —
          // metadata ausente/parcial nunca bloqueia a retomada (AC4).
          try {
            const metadata = await client.lojistaAuth.getCadastroMetadata();
            if (metadata) {
              updateDraft({
                nome_fantasia: metadata.nome_fantasia,
                cnpj: metadata.cnpj,
                telefone: metadata.telefone,
                responsavel_nome: metadata.responsavel_nome,
              });
            }
          } catch {
            // Best-effort (AC4): falha ao ler metadata não bloqueia a
            // retomada — o wizard abre com os campos que o draft já tinha.
          }
          navigation.navigate('CadastroPasso2');
          break;
        }
        case 'emAnalise':
          navigation.navigate('EmAnalise');
          break;
        case 'ativo':
          // Ver JSDoc do componente — única transição reativa (Auth → Main).
          signInLojista();
          break;
        case 'rejeitado':
          navigation.navigate('CadastroRejeitado', { motivoRejeicao: decisao.motivoRejeicao });
          break;
        case 'contaIndisponivel':
          navigation.navigate('ContaIndisponivel');
          break;
      }
    } catch {
      // AC6 — falha real de rede/RLS na leitura (distinta de "0 linhas"):
      // nenhuma rota é decidida.
      setSubmitError(MSG_ERRO_LEITURA_ESTABELECIMENTO);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <Text style={[styles.logo, { color: darkColors.text.primary }]}>KEEPITHUB</Text>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Entrar na sua loja</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Acesse com o e-mail e a senha cadastrados.
          </Text>
        </View>

        {!!submitError && <Text style={[styles.submitError, { color: darkColors.accent.warning }]}>{submitError}</Text>}

        <View style={styles.form}>
          <FormField
            label="E-mail"
            value={identificador}
            onChangeText={setIdentificador}
            placeholder="voce@sualoja.com"
            keyboardType="email-address"
          />
          <FormField label="Senha" value={senha} onChangeText={setSenha} placeholder="••••••••" secureTextEntry />
        </View>

        <PrimaryButton label="Entrar" onPress={handleEntrar} loading={loading} disabled={!identificador || !senha} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    gap: spacing[8],
  },
  titleBlock: {
    gap: spacing[2],
  },
  logo: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.lg.fontSize,
    letterSpacing: typography.letterSpacing.wide,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
  },
  submitError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  form: {
    gap: spacing[4],
  },
});
