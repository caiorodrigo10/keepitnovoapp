import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import type { Cliente } from '@keepit/core-data';
import { getDataClient } from '@keepit/core-data';
import { useOrders } from '@keepit/core-data/hooks';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useCurrentEmail } from '../../hooks/useCurrentEmail';
import { isTelefoneBRValido, maskTelefoneBR } from '../../lib/telefoneMask';
import type { MainTabParamList, PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Perfil'>;

interface MenuItem {
  label: string;
  onPress: () => void;
}

/** Mesmo padrão local de `CriarConta.tsx` — não existe validador de e-mail compartilhado em `apps/cliente/src/lib`. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MSG_ERRO_PERFIL = 'Não foi possível carregar seu perfil agora. Tente novamente em instantes.';
const MSG_SEM_SESSAO = 'Sessão não encontrada. Entre novamente para ver seu perfil.';
const MSG_ERRO_SALVAR = 'Não foi possível salvar agora. Tente novamente em instantes.';
const MSG_NOME_OBRIGATORIO = 'Informe seu nome.';
const MSG_TELEFONE_INVALIDO = 'Informe um telefone válido (com DDD).';
const MSG_EMAIL_INVALIDO = 'Informe um e-mail válido.';
/**
 * Story 2.8 (AC5): texto honesto sobre o double opt-in do Supabase Auth —
 * a troca só vale depois que o provedor confirmar, nunca antes.
 */
const MSG_EMAIL_CONFIRMACAO_PENDENTE =
  'Enviamos um link de confirmação. O novo e-mail só passa a valer depois que você confirmar.';
const MSG_EMAIL_ATUALIZADO = 'E-mail atualizado.';
/**
 * Story 2.8 (AC9, decisão 10.8): texto único para todo item de menu cujo
 * destino pertence a outra Story — nunca simula uma tela/fluxo que ainda
 * não existe.
 */
const MSG_EM_BREVE = 'Ainda não disponível nesta versão. Em breve.';
const MSG_ERRO_SAIR = 'Não foi possível sair agora. Tente novamente em instantes.';

/**
 * Perfil (Story 2.8 — reconciliação à decisão 10.8, AC1-AC9).
 *
 * Fiel a `docs/design-refs/cliente-08-perfil.png`: avatar com inicial, nome,
 * e-mail, ação `Editar`, cards de estatística, lista de atalhos com chevron.
 *
 * **Superfície única de conta (decisão 10.8, 2026-08-02):** não existe mais
 * `Configuracoes.tsx`/rota `Configuracoes` — toda a estrutura de menu do
 * frame 08 é materializada aqui. Itens cujo destino pertence a outra Story
 * (Hubs favoritos, Formas de pagamento, Notificações, Ajuda & suporte,
 * Termos, Política) navegam honestamente para um aviso "em breve"
 * (`Alert.alert`, sem tela/rota nova — nenhum destino fictício). "Excluir
 * minha conta" navega para `ExcluirConta` (rota já existente, inalterada
 * por esta story) — existe por compliance Apple 5.1.1(v); o fluxo de
 * exclusão em si é da Story 2.9.
 *
 * **Leitura real (AC1, AC2):** `useCurrentCliente`/`useCurrentEmail` chamam
 * `AuthPort.currentUser`/`currentEmail` — em `DATA_SOURCE=supabase`, lê a
 * própria linha em `clientes` (RLS) e a sessão de Auth; em `mock`, lê as
 * fixtures. Loading/erro/sem sessão têm estado explícito — nunca cai para
 * fixture como se fosse dado real.
 *
 * **Edição real (AC3, AC4, AC5, AC7):** nome/telefone usam
 * `AuthPort.updateProfile` (mesmo adapter em ambos os modos — `updateCpf`
 * já seguia esse padrão de persistir de verdade até no mock); e-mail usa
 * `AuthPort.updateEmail`, que nunca toca `clientes` e informa o estado de
 * confirmação exigido pelo provedor. Cancelar/erro nunca descartam o valor
 * ainda não salvo — só sucesso ou cancelamento explícito saem do modo de
 * edição.
 *
 * **Cards de pedidos/hubs (AC1):** o card "Pedidos" mostra `pedidos.length`
 * quando `useOrders` resolve sem erro (mock, ou Supabase quando a Story de
 * pedidos existir) e um traço neutro (`—`) quando `useOrders` erra — hoje
 * sempre o caso em `DATA_SOURCE=supabase`, porque `order.supabase.ts#listMine`
 * ainda não está implementado (fora do escopo desta story). Essa checagem é
 * por estado de erro, não por `DATA_SOURCE` — a tela não teria como saber a
 * fonte de dados sem violar "Modo híbrido proibido sem port" (Dev Notes,
 * Data Mode). "Hubs favoritos" nunca teve query real em nenhum modo (não é
 * uma fixture, é um placeholder herdado do Épico 0) — fica sempre em `—`.
 *
 * **`Sair` (AC8):** chama `AuthPort.signOut()` (implementado nesta story no
 * adapter Supabase, antes um stub). `RootNavigator` observa
 * `onAuthStateChange` e troca para `Auth` sozinho — esta tela não navega
 * explicitamente.
 */
export default function Perfil({ navigation }: Props) {
  const { data: cliente, loading: clienteLoading, error: clienteError } = useCurrentCliente();
  const { data: email, loading: emailLoading, error: emailError } = useCurrentEmail();
  const { data: pedidos, error: pedidosError } = useOrders(cliente?.id ?? '');

  const loading = clienteLoading || emailLoading;
  const loadError = clienteError ?? emailError;

  // Story 2.8 (AC3, AC7): sobrepõe o valor retornado pela última edição
  // bem-sucedida, sem depender de refetch (os hooks de `@keepit/core-data`
  // não expõem um — mesmo padrão simples do resto do Épico 0/2).
  const [clienteOverride, setClienteOverride] = useState<Cliente | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const clienteAtual = clienteOverride ?? cliente;
  const emailAtual = emailOverride ?? email;

  const [editingProfile, setEditingProfile] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nomeError, setNomeError] = useState<string | undefined>();
  const [telefoneError, setTelefoneError] = useState<string | undefined>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  const [editingEmail, setEditingEmail] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [emailFieldError, setEmailFieldError] = useState<string | undefined>();
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  function startEditingProfile() {
    if (!clienteAtual) return;
    setNome(clienteAtual.nome);
    setTelefone(clienteAtual.telefone ?? '');
    setNomeError(undefined);
    setTelefoneError(undefined);
    setProfileSaveError(null);
    setEditingEmail(false);
    setEditingProfile(true);
  }

  function handleCancelarPerfil() {
    setEditingProfile(false);
    setProfileSaveError(null);
  }

  async function handleSalvarPerfil() {
    if (!clienteAtual) return;

    const nomeTrim = nome.trim();
    const telefoneTrim = telefone.trim();
    const nextNomeError = nomeTrim ? undefined : MSG_NOME_OBRIGATORIO;
    const nextTelefoneError = telefoneTrim && !isTelefoneBRValido(telefoneTrim) ? MSG_TELEFONE_INVALIDO : undefined;
    setNomeError(nextNomeError);
    setTelefoneError(nextTelefoneError);
    if (nextNomeError || nextTelefoneError) return;

    setProfileSaveError(null);
    setSavingProfile(true);
    try {
      const atualizado = await getDataClient().auth.updateProfile(clienteAtual.id, {
        nome: nomeTrim,
        telefone: telefoneTrim || null,
      });
      setClienteOverride(atualizado);
      setEditingProfile(false);
    } catch {
      setProfileSaveError(MSG_ERRO_SALVAR);
    } finally {
      setSavingProfile(false);
    }
  }

  function startEditingEmail() {
    setNovoEmail(emailAtual ?? '');
    setEmailFieldError(undefined);
    setEmailNotice(null);
    setEditingProfile(false);
    setEditingEmail(true);
  }

  function handleCancelarEmail() {
    setEditingEmail(false);
    setEmailFieldError(undefined);
  }

  async function handleSalvarEmail() {
    const trimmed = novoEmail.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailFieldError(MSG_EMAIL_INVALIDO);
      return;
    }

    setEmailFieldError(undefined);
    setSavingEmail(true);
    try {
      const resultado = await getDataClient().auth.updateEmail(trimmed);
      if (resultado.status === 'confirmation_required') {
        setEmailNotice(MSG_EMAIL_CONFIRMACAO_PENDENTE);
      } else {
        setEmailOverride(trimmed);
        setEmailNotice(MSG_EMAIL_ATUALIZADO);
      }
      setEditingEmail(false);
    } catch {
      setEmailFieldError(MSG_ERRO_SALVAR);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSair() {
    setSigningOut(true);
    try {
      await getDataClient().auth.signOut();
      // Sem navegação explícita — `RootNavigator` observa `onAuthStateChange`
      // e troca para `Auth` sozinho (mesmo padrão de `CriarConta`/`Login`).
    } catch {
      setSigningOut(false);
      Alert.alert('Não foi possível sair', MSG_ERRO_SAIR);
    }
  }

  function showEmBreve(label: string) {
    Alert.alert(label, MSG_EM_BREVE);
  }

  const menuItems: MenuItem[] = [
    {
      label: 'Meus pedidos',
      onPress: () =>
        navigation
          .getParent<BottomTabNavigationProp<MainTabParamList>>()
          ?.navigate('PedidosTab', { screen: 'MeusPedidos' }),
    },
    { label: 'Hubs favoritos', onPress: () => showEmBreve('Hubs favoritos') },
    { label: 'Formas de pagamento', onPress: () => showEmBreve('Formas de pagamento') },
    { label: 'Notificações', onPress: () => showEmBreve('Notificações') },
    { label: 'Ajuda & suporte', onPress: () => showEmBreve('Ajuda & suporte') },
    { label: 'Termos', onPress: () => showEmBreve('Termos de uso') },
    { label: 'Política', onPress: () => showEmBreve('Política de privacidade') },
    { label: 'Excluir minha conta', onPress: () => navigation.navigate('ExcluirConta') },
  ];

  if (loading) {
    return (
      <Screen>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.stateText}>Carregando seu perfil…</Text>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.stateText}>{MSG_ERRO_PERFIL}</Text>
      </Screen>
    );
  }

  if (!clienteAtual) {
    return (
      <Screen>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.stateText}>{MSG_SEM_SESSAO}</Text>
      </Screen>
    );
  }

  const inicial = clienteAtual.nome.trim().charAt(0).toUpperCase() || '?';
  const showSummary = !editingProfile && !editingEmail;

  return (
    <Screen>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{clienteAtual.nome}</Text>
          <Text style={styles.profileSubtitle}>{emailAtual ?? '—'}</Text>
        </View>
        {showSummary && (
          <Pressable onPress={startEditingProfile} hitSlop={8}>
            <Text style={styles.editLink}>Editar</Text>
          </Pressable>
        )}
      </View>

      {editingProfile && (
        <View style={styles.editBlock}>
          <TextField label="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" error={nomeError} />
          <TextField
            label="Telefone (opcional)"
            value={telefone}
            onChangeText={(value) => setTelefone(maskTelefoneBR(value))}
            placeholder="(11) 91234-5678"
            keyboardType="phone-pad"
            autoCapitalize="none"
            error={telefoneError}
          />
          {!!profileSaveError && <Text style={styles.saveError}>{profileSaveError}</Text>}
          <View style={styles.editActions}>
            <Button title="Salvar" onPress={handleSalvarPerfil} loading={savingProfile} />
            <Button title="Cancelar" variant="ghost" onPress={handleCancelarPerfil} disabled={savingProfile} />
          </View>
        </View>
      )}

      {showSummary && (
        <Pressable onPress={startEditingEmail} hitSlop={8} style={styles.editEmailRow}>
          <Text style={styles.editEmailLink}>Editar e-mail</Text>
        </Pressable>
      )}

      {editingEmail && (
        <View style={styles.editBlock}>
          <TextField
            label="Novo e-mail"
            value={novoEmail}
            onChangeText={setNovoEmail}
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={emailFieldError}
          />
          <View style={styles.editActions}>
            <Button title="Salvar e-mail" onPress={handleSalvarEmail} loading={savingEmail} />
            <Button title="Cancelar" variant="ghost" onPress={handleCancelarEmail} disabled={savingEmail} />
          </View>
        </View>
      )}

      {!!emailNotice && showSummary && <Text style={styles.notice}>{emailNotice}</Text>}

      {showSummary && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{pedidosError ? '—' : pedidos.length}</Text>
              <Text style={styles.statLabel}>Pedidos</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>—</Text>
              <Text style={styles.statLabel}>Hubs favoritos</Text>
            </View>
          </View>

          <View style={styles.menu}>
            {menuItems.map((item) => (
              <Pressable key={item.label} style={styles.menuRow} onPress={item.onPress}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuChevron}>{'>'}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.signOutBlock}>
            <Button title="Sair" variant="ghost" onPress={handleSair} loading={signingOut} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    color: lightColors.text.primary,
    marginBottom: spacing['6'],
  },
  stateText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['2'],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing['4'],
  },
  avatarText: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  profileSubtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  editLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
  editEmailRow: {
    marginBottom: spacing['6'],
  },
  editEmailLink: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  editBlock: {
    marginBottom: spacing['6'],
  },
  editActions: {
    gap: spacing['3'],
  },
  saveError: {
    marginBottom: spacing['4'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
  },
  notice: {
    marginBottom: spacing['6'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing['3'],
    marginBottom: spacing['6'],
  },
  statCard: {
    flex: 1,
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  statValue: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes['2xl'].fontSize,
    color: lightColors.text.primary,
  },
  statLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  menu: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    marginBottom: spacing['5'],
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing['4'],
    paddingHorizontal: spacing['4'],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border.subtle,
  },
  menuLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  menuChevron: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.tertiary,
  },
  signOutBlock: {
    alignItems: 'center',
  },
});
