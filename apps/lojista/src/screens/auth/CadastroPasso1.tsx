import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { EmailJaExisteError, getDataClient } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CadastroHeader } from '../../components/CadastroHeader';
import { Checkbox } from '../../components/Checkbox';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import { isCnpjValido } from '../../lib/cnpj';
import { isTelefoneBRValido, maskTelefoneBR } from '../../lib/telefoneMask';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';
import { HUB_OPTIONS } from './cadastroDraft';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso1'>;

interface FormErrors {
  nome_fantasia?: string;
  cnpj?: string;
  telefone?: string;
  responsavel_nome?: string;
  email?: string;
  senha?: string;
  termos?: string;
}

/**
 * Máscara visual simples de CNPJ (`00.000.000/0001-00`) — só formatação,
 * sem validar dígito verificador aqui (a validação real vive em `validate()`,
 * via `isCnpjValido` — Story 3.3, AC1).
 */
function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length > 5) out = `${out.slice(0, 6)}.${out.slice(6)}`;
  if (digits.length > 8) out = `${out.slice(0, 10)}/${out.slice(10)}`;
  if (digits.length > 12) out = `${out.slice(0, 15)}-${out.slice(15)}`;
  return out;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Story 3.2 (Task, issue análogo à REL-004 da Story 2.3): mensagens sem
 * fonte no protótipo/épico — texto novo em pt-BR, não regra de negócio.
 */
const MSG_EMAIL_JA_CADASTRADO = 'Este e-mail já está cadastrado.';
const MSG_ERRO_GENERICO = 'Não foi possível criar sua conta agora. Tente novamente em instantes.';

/**
 * Story 3.3 (AC1, AC2) — mensagens textuais da própria Story (não do
 * protótipo/épico original — a validação de CNPJ é reclassificação SIMPLE
 * do piloto, sem tela de referência visual nova).
 */
const MSG_CNPJ_INVALIDO = 'CNPJ inválido — confira os números.';
const MSG_CNPJ_DUPLICADO = 'Este CNPJ já está cadastrado. Se acha que é um engano, fale com a Keepit.';

/**
 * Cadastro passo 1 — dados básicos — Story 0.8 (Task 4), conta real do
 * lojista — Story 3.2 (AC1-AC7).
 *
 * Fiel a `docs/design-refs/lojista-06-cadastro-passo1.png` (painel P6) para
 * os campos já existentes (logo, nome, categoria, CNPJ, hub). **Story 3.2
 * acrescenta** telefone, nome do responsável, e-mail e senha — campos do
 * Épico 3 (AC1) ausentes na tela original da Story 0.8. **Story 3.4** move o
 * campo `categoria` para `CadastroPasso2.tsx` (Épico 3, Story 3.4 AC1 lista
 * categoria como campo do Passo 2 — resolve a metade "categoria" do gap
 * conhecido das Dev Notes da Story 3.2). `hubPreferencialId` permanece
 * intocado — associação loja↔hub não decidida (ver Dependencies da Story
 * 3.4), fora do escopo desta fatia.
 *
 * **AC4/AC7 — conta real.** "Continuar" chama
 * `getDataClient().lojistaAuth.signUp(...)` (port dedicada — Story 3.2,
 * `packages/core-data/src/ports/lojista-auth.port.ts`), que envia
 * `role: 'lojista'` em `raw_user_meta_data` (discriminador lido pelo trigger
 * `criar_cliente_apos_signup` corrigido pela migration
 * `20260812032149_desambiguar_signup_lojista.sql` — sem isso, o signup do
 * lojista criaria uma linha órfã em `clientes`). E-mail já cadastrado exibe
 * uma mensagem específica; qualquer outro erro (rede, validação do
 * provedor) exibe uma mensagem genérica — a UI não distingue os dois casos
 * de outra forma (mesma decisão anti-enumeração da Story 2.6 do Cliente).
 *
 * **AC5 — navegação honesta.** Sucesso navega para `CadastroPasso2`
 * (rótulo "Passo 2 de 3" do wizard mock já existente, Story 0.8) — isso NÃO
 * representa cadastro concluído nem estabelecimento "em análise" (Passos
 * 2/3 seguem mock neste lote, Stories 3.4/3.5 fora deste bloco). Nenhuma
 * linha é criada em `estabelecimentos` por esta tela. `nome_fantasia`,
 * `cnpj`, `telefone` e `responsavel_nome` são persistidos no
 * `CadastroDraftContext` já existente (mesmo shape da Story 0.8) para
 * reaproveito pelos Passos 2/3; `email`/`senha` NUNCA entram no draft (são
 * credenciais de auth, não campos de `estabelecimentos` — descartados deste
 * componente assim que o submit termina, com sucesso ou falha).
 *
 * **AC3 — validação client-side.** Senha ≥ 8 caracteres (decisão 10.4,
 * replicada ao lojista pelo Épico 3 AC5), e-mail em formato básico.
 * `nome_fantasia`/`telefone`/`responsavel_nome` não vazios e aceite de
 * Termos marcado são validações de formulário básicas — [AUTO-DECISION]
 * tratadas como obrigatórias → (reason: AC1 lista os quatro como campos do
 * formulário e a Story 2.3 do Cliente já trata `nome` como obrigatório no
 * mesmo padrão; não é uma regra de negócio nova, é completude de
 * formulário).
 *
 * **CNPJ (Story 3.3, AC1/AC2/AC3/AC4).** Formato validado por dígito
 * verificador (`isCnpjValido`, `../../lib/cnpj.ts`) — 100% client-side, sem
 * chamada de rede (AC3; nada de BrasilAPI/Edge Function `validar-cnpj`,
 * retomada futura fora do caminho ativo do piloto). Duplicidade checada via
 * `client.store.checkCnpjDisponivel(...)` — em modo mock e em modo
 * Supabase (hoje, sem `estabelecimentos` real ainda — Stories 3.4/3.5),
 * sempre resolve "disponível"; isso é o comportamento correto e esperado
 * nesta fase (AC4), não um bug. Situação cadastral na Receita
 * (ativo/inativo) não é verificada aqui — fica para a conferência humana do
 * Admin (AC5, Stories 3.6-3.9).
 */
export default function CadastroPasso1({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Story 3.3 (AC1). Validação de FORMATO do CNPJ pelo algoritmo de dígito
   * verificador (`isCnpjValido`, `../../lib/cnpj.ts`) — substitui a checagem
   * anterior (só "14 dígitos preenchidos", Story 3.2) por uma validação
   * real. Mantém a mensagem de "CNPJ incompleto" para o caso mais comum (o
   * usuário ainda digitando) e só mostra `MSG_CNPJ_INVALIDO` quando os 14
   * dígitos estão completos mas o dígito verificador não bate — evita dizer
   * "inválido" para um campo simplesmente não preenchido ainda.
   */
  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!draft.nome_fantasia.trim()) nextErrors.nome_fantasia = 'Informe o nome da loja.';
    const cnpjDigits = draft.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) {
      nextErrors.cnpj = 'Informe um CNPJ completo (14 dígitos).';
    } else if (!isCnpjValido(draft.cnpj)) {
      nextErrors.cnpj = MSG_CNPJ_INVALIDO;
    }
    if (!isTelefoneBRValido(draft.telefone)) nextErrors.telefone = 'Informe um telefone válido (com DDD).';
    if (!draft.responsavel_nome.trim()) nextErrors.responsavel_nome = 'Informe o nome do responsável.';
    if (!EMAIL_REGEX.test(email.trim())) nextErrors.email = 'Informe um e-mail válido.';
    if (senha.length < 8) nextErrors.senha = 'A senha precisa ter pelo menos 8 caracteres.';
    if (!aceiteTermos) nextErrors.termos = 'É preciso aceitar os Termos e a Política de Privacidade.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleContinuar() {
    if (!validate()) return;

    setSubmitError(null);
    setLoading(true);
    try {
      const client = getDataClient();

      // Story 3.3 (AC2, AC3, AC4). Checagem antecipada de duplicidade —
      // client.store.checkCnpjDisponivel (sem chamada a BrasilAPI/rede
      // externa, AC3). Em modo mock e, hoje, em modo Supabase (tabela
      // `estabelecimentos` ainda não existe — Stories 3.4/3.5), resolve
      // sempre `true`; ver JSDoc de `StorePort.checkCnpjDisponivel`. Um erro
      // de rede real (quando a checagem passar a valer de fato) propaga
      // para o catch abaixo, sem simular sucesso.
      const cnpjDisponivel = await client.store.checkCnpjDisponivel(draft.cnpj);
      if (!cnpjDisponivel) {
        setErrors((previous) => ({ ...previous, cnpj: MSG_CNPJ_DUPLICADO }));
        return;
      }

      await client.lojistaAuth.signUp({
        nome_fantasia: draft.nome_fantasia.trim(),
        cnpj: draft.cnpj,
        telefone: draft.telefone,
        responsavel_nome: draft.responsavel_nome.trim(),
        email: email.trim(),
        senha,
      });
      // AC5 — navegação honesta: só "Passo 1 de 3" concluído, sem
      // representar cadastro concluído/em análise. Ver JSDoc do componente.
      navigation.navigate('CadastroPasso2');
    } catch (error) {
      if (error instanceof EmailJaExisteError) {
        setSubmitError(MSG_EMAIL_JA_CADASTRADO);
      } else {
        setSubmitError(MSG_ERRO_GENERICO);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CadastroHeader step={1} />

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Cadastre seu estabelecimento</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Em minutos sua loja já recebe pedidos no hub.
          </Text>
        </View>

        {!!submitError && <Text style={[styles.submitError, { color: darkColors.accent.warning }]}>{submitError}</Text>}

        <Pressable
          style={styles.logoUpload}
          /* Upload real de logo fora de escopo do Épico 0 — placeholder local (Task 8 da story 0.8). */
          onPress={() => updateDraft({ logoLocalUri: draft.logoLocalUri ? null : 'local-placeholder' })}
        >
          <View style={[styles.logoCircle, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="camera-outline" size={24} color={darkColors.text.secondary} />
          </View>
          <View>
            <Text style={[styles.logoLabel, { color: darkColors.text.primary }]}>Logo da loja</Text>
            <Text style={[styles.logoAction, { color: darkColors.accent.brand }]}>
              {draft.logoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <FormField
          label="Nome da loja"
          value={draft.nome_fantasia}
          onChangeText={(nome_fantasia) => updateDraft({ nome_fantasia })}
          placeholder="Farmácia Vida"
          error={errors.nome_fantasia}
        />

        <FormField
          label="CNPJ"
          value={draft.cnpj}
          onChangeText={(raw) => updateDraft({ cnpj: maskCnpj(raw) })}
          placeholder="00.000.000/0001-00"
          keyboardType="number-pad"
          error={errors.cnpj}
        />

        <FormField
          label="Telefone"
          value={draft.telefone}
          onChangeText={(raw) => updateDraft({ telefone: maskTelefoneBR(raw) })}
          placeholder="(11) 91234-5678"
          keyboardType="phone-pad"
          error={errors.telefone}
        />

        <FormField
          label="Nome do responsável"
          value={draft.responsavel_nome}
          onChangeText={(responsavel_nome) => updateDraft({ responsavel_nome })}
          placeholder="Nome completo"
          error={errors.responsavel_nome}
        />

        <SelectField
          label="Hub de operação"
          value={draft.hubPreferencialId}
          options={[...HUB_OPTIONS]}
          onChange={(hubPreferencialId) => updateDraft({ hubPreferencialId })}
        />

        <FormField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@suaLoja.com"
          keyboardType="email-address"
          error={errors.email}
        />

        <FormField
          label="Senha"
          value={senha}
          onChangeText={setSenha}
          placeholder="••••••••"
          secureTextEntry
          error={errors.senha}
        />

        <View style={styles.checkboxBlock}>
          <Checkbox checked={aceiteTermos} onToggle={() => setAceiteTermos((previous) => !previous)}>
            Li e aceito os <Text style={styles.bold}>Termos de Uso</Text> e a{' '}
            <Text style={styles.bold}>Política de Privacidade</Text>.
          </Checkbox>
          {!!errors.termos && <Text style={[styles.termsError, { color: darkColors.accent.warning }]}>{errors.termos}</Text>}
        </View>

        <View style={styles.spacer} />
        <PrimaryButton label="Continuar" onPress={handleContinuar} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[5],
  },
  titleBlock: {
    gap: spacing[1],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
  },
  submitError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  logoUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  logoAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  checkboxBlock: {
    gap: spacing[1],
  },
  bold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: darkColors.text.primary,
  },
  termsError: {
    marginLeft: spacing['5'] + spacing['3'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  spacer: {
    height: spacing[4],
  },
});
