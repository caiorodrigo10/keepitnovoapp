import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { getDataClient, type MeuPerfilLojista } from '@keepit/core-data';
import { useAsyncResource } from '@keepit/core-data/hooks';
import { SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO } from '@keepit/config';

import { SettingsListItem } from '../../components/SettingsListItem';
import type { MainTabParamList, PerfilStackParamList } from '../../navigation/types';
import { isSupabaseDataSource } from '../../lib/dataSource';
import { signOutLojista } from '../../navigation/lojistaSession';
import { useLojaPerfil } from './LojaPerfilContext';
import { EQUIPE_FIXTURE } from './lojaPerfilDraft';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Configuracoes'>;

/**
 * Story 3.12 (AC2): mesmo texto/padrão já estabelecido na Story 2.8 do App
 * Cliente (`Perfil.tsx#MSG_EM_BREVE`) — REUSE, sem inventar um texto novo.
 */
const MSG_EM_BREVE = 'Ainda não disponível nesta versão. Em breve.';

/**
 * Story 3.12 (AC3): honestidade sobre o canal de WhatsApp enquanto WA-001
 * está pendente (`SUPORTE_WHATSAPP_DISPONIVEL = false`) — mesmo texto de
 * intenção já usado em `EmAnalise.tsx`/`ContaIndisponivel.tsx`, adaptado ao
 * formato de `Alert` (item de lista, não botão com estado `disabled`).
 */
const MSG_AJUDA_INDISPONIVEL = 'Canal de atendimento via WhatsApp em breve.';

function handleAjudaSuporte(): void {
  if (SUPORTE_WHATSAPP_DISPONIVEL && SUPORTE_WHATSAPP_NUMERO) {
    void Linking.openURL(`https://wa.me/${SUPORTE_WHATSAPP_NUMERO}`);
    return;
  }
  Alert.alert('Ajuda & suporte', MSG_AJUDA_INDISPONIVEL);
}

/**
 * Story 3.10 (Dependencies, item (c) — "signOut real"). Encerra a sessão
 * REAL (`lojistaAuth.signOut()`, Supabase Auth em `DATA_SOURCE=supabase`)
 * antes de limpar o flag local (`signOutLojista()`, que é o que
 * `RootNavigator` observa para trocar para `Auth` — ver JSDoc de
 * `lojistaSession.ts`). `signOutLojista()` roda mesmo se o `signOut` real
 * falhar (best-effort, `catch` silencioso) — o lojista nunca deve ficar
 * preso em `Main` só porque a chamada de rede de logout falhou; é o mesmo
 * raciocínio de resiliência de "Sair" já aplicado noutros apps deste
 * monorepo.
 */
async function handleSair(): Promise<void> {
  try {
    await getDataClient().lojistaAuth.signOut();
  } catch {
    // Best-effort — ver JSDoc acima.
  } finally {
    signOutLojista();
  }
}

/**
 * Configurações + Excluir conta — Story 0.8 (Task 10).
 *
 * Fiel a `docs/design-refs/lojista-11-configuracoes.png` (painel P11):
 * cabeçalho, card-resumo (avatar/inicial, nome, categoria · hub, "Editar"),
 * seção LOJA (Perfil público, Horários, Formas de recebimento) e seção
 * EQUIPE (membros com badge de papel + "Convidar membro").
 *
 * "Horários" e "Formas de recebimento" vivem em stacks/tabs diferentes
 * (`CatalogoStack`/`FinanceiroStack`, Story 0.3) — navegação cross-tab via
 * `navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()`, sem
 * adicionar rotas novas a `PerfilStackParamList` (fora de escopo tocar
 * `navigation/types.ts` além do necessário).
 *
 * **Story 9.0.4 (Task 5, AC3):** seção "CONTA" com o item "Sair" — a
 * transição para `AuthStack` é consequência exclusiva da mudança de sessão
 * observada por `RootNavigator`, sem navegação imperativa aqui.
 *
 * **Story 3.10:** "Sair" (`handleSair`, topo do arquivo) passou a encerrar
 * também a sessão REAL (`lojistaAuth.signOut()`), não só o flag local — ver
 * JSDoc de `handleSair`.
 *
 * **Story 3.12 (AC5).** Card-resumo religado a dado real (nome fantasia +
 * categoria) quando `DATA_SOURCE=supabase`, via
 * `estabelecimentoCadastro.getMeuPerfil()` (REUSE do MESMO método
 * introduzido pela Story 3.11, sem uma terceira leitura própria). Loading/
 * erro/leitura indisponível têm um estado honesto — nunca o fixture
 * `perfil` (`LojaPerfilContext`, Story 0.8) exibido como se fosse real.
 * `DATA_SOURCE=mock` preserva o fixture tal como estava.
 *
 * [AUTO-DECISION] O subtítulo do card em modo Supabase mostra só a
 * categoria (sem "· hub") → (reason: a associação estabelecimento↔hub NÃO
 * está no schema real do piloto — `perfil.hubNome`, Story 0.8, é fixture
 * puro sem contrapartida em `estabelecimentos`. Misturar "categoria real" +
 * "hub fabricado" na mesma linha violaria a regra de honestidade do
 * `docs/stories/README.md` — melhor omitir o hub do que fingir um dado que
 * não existe).
 *
 * **Story 3.12 (AC1-AC3).** "Termos"/"Política" navegam honestamente
 * (`Alert.alert`, REUSE do padrão da Story 2.8 do App Cliente,
 * `Perfil.tsx#MSG_EM_BREVE`) — sem tela/conteúdo novo. "Ajuda & suporte"
 * consome o MESMO seam de WhatsApp (`SUPORTE_WHATSAPP_NUMERO`/
 * `SUPORTE_WHATSAPP_DISPONIVEL`, Story 3.6) já usado por `handleAjudaSuporte`
 * (topo do arquivo) e pelo AC1 de `ExcluirConta.tsx`.
 */
export default function Configuracoes({ navigation }: Props) {
  const { perfil } = useLojaPerfil();
  const supabaseMode = isSupabaseDataSource();
  const client = getDataClient();
  const {
    data: meuPerfil,
    loading: meuPerfilLoading,
    error: meuPerfilError,
  } = useAsyncResource<MeuPerfilLojista | null>(
    () => (supabaseMode ? client.estabelecimentoCadastro.getMeuPerfil() : Promise.resolve(null)),
    null,
    [supabaseMode],
  );

  function navigateToTab(tab: keyof MainTabParamList, screen: string) {
    const parent = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
    parent?.navigate(tab, { screen } as never);
  }

  function showEmBreve(label: string) {
    Alert.alert(label, MSG_EM_BREVE);
  }

  // AC5 — card-resumo: fixture em modo mock; dado real (ou estado honesto de
  // loading/erro) em modo Supabase, nunca o fixture disfarçado de real.
  const resumoNome = !supabaseMode
    ? perfil.nome_fantasia
    : meuPerfilLoading
      ? 'Carregando…'
      : (meuPerfil?.nome_fantasia ?? 'Não foi possível carregar');
  const resumoSubtitulo = !supabaseMode
    ? `${perfil.categoria} · ${perfil.hubNome}`
    : meuPerfilLoading
      ? '—'
      : (meuPerfil?.categoria ?? (meuPerfilError ? 'Tente novamente em instantes.' : '—'));
  const resumoInicial = resumoNome.trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Configurações</Text>

        <View style={[styles.summaryCard, { backgroundColor: darkColors.bg.surface }]}>
          <View style={[styles.avatar, { backgroundColor: darkColors.accent.brand }]}>
            <Text style={styles.avatarLetter}>{resumoInicial}</Text>
          </View>
          <View style={styles.summaryText}>
            <Text style={[styles.summaryName, { color: darkColors.text.primary }]}>{resumoNome}</Text>
            <Text style={[styles.summarySubtitle, { color: darkColors.text.tertiary }]}>{resumoSubtitulo}</Text>
          </View>
          <Text
            style={[styles.editLink, { color: darkColors.accent.brand }]}
            onPress={() => navigation.navigate('PerfilPublico')}
          >
            Editar
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: darkColors.text.tertiary }]}>LOJA</Text>
          <SettingsListItem
            icon="person-outline"
            label="Perfil público"
            onPress={() => navigation.navigate('PerfilPublico')}
          />
          <SettingsListItem
            icon="time-outline"
            label="Horários"
            onPress={() => navigateToTab('CatalogoTab', 'HorariosDisponibilidade')}
          />
          <SettingsListItem
            icon="card-outline"
            label="Formas de recebimento"
            onPress={() => navigateToTab('FinanceiroTab', 'FormasRecebimento')}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: darkColors.text.tertiary }]}>EQUIPE</Text>
          {EQUIPE_FIXTURE.map((membro) => (
            <View key={membro.id} style={styles.membroRow}>
              <View style={[styles.membroAvatar, { backgroundColor: darkColors.bg.muted }]}>
                <Text style={[styles.membroAvatarLetter, { color: darkColors.text.primary }]}>
                  {membro.nome
                    .split(' ')
                    .map((parte) => parte.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.membroText}>
                <Text style={[styles.membroNome, { color: darkColors.text.primary }]}>{membro.nome}</Text>
                <Text style={[styles.membroContato, { color: darkColors.text.tertiary }]}>{membro.contato}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: membro.papel === 'admin' ? darkColors.accent.brand : darkColors.bg.muted },
                ]}
              >
                <Text
                  style={[
                    styles.badgeLabel,
                    { color: membro.papel === 'admin' ? darkColors.bg.primary : darkColors.text.primary },
                  ]}
                >
                  {membro.papel === 'admin' ? 'Admin' : 'Equipe'}
                </Text>
              </View>
            </View>
          ))}
          {/*
            [AUTO-DECISION] "Convidar membro" e as linhas de EQUIPE ficam
            estáticas (sem `onPress`) nesta story → não existe uma tela de
            "convidar/gerenciar membro" no inventário de 8 telas do AC1, e
            inventar uma rota nova aqui extrapolaria o escopo de
            Onboarding/Cadastro/Auth desta story (reason: Task 10 permite
            "sem CRUD real de equipe", mas não pede uma tela nova — só o
            item "Excluir conta", que já é AC1). Mantido visualmente fiel
            ao painel P11 (texto + ícone "+"), sem navegação.
          */}
          <Text style={[styles.inviteLink, { color: darkColors.accent.brand }]}>+ Convidar membro</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: darkColors.text.tertiary }]}>SUPORTE</Text>
          <SettingsListItem icon="help-circle-outline" label="Ajuda & suporte" onPress={handleAjudaSuporte} />
          <SettingsListItem icon="document-text-outline" label="Termos" onPress={() => showEmBreve('Termos de uso')} />
          <SettingsListItem
            icon="shield-checkmark-outline"
            label="Política"
            onPress={() => showEmBreve('Política de privacidade')}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: darkColors.text.tertiary }]}>CONTA</Text>
          <SettingsListItem icon="log-out-outline" label="Sair" onPress={() => void handleSair()} />
        </View>

        <View style={styles.section}>
          <SettingsListItem
            icon="trash-outline"
            label="Excluir conta"
            destructive
            onPress={() => navigation.navigate('ExcluirConta')}
          />
        </View>
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
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radii.card,
    padding: spacing[4],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: darkColors.bg.primary,
  },
  summaryText: {
    flex: 1,
  },
  summaryName: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  summarySubtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  editLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  section: {
    gap: spacing[1],
  },
  sectionLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
    marginBottom: spacing[1],
  },
  membroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  membroAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membroAvatarLetter: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  membroText: {
    flex: 1,
  },
  membroNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  membroContato: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.badge,
  },
  badgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    letterSpacing: typography.letterSpacing.badge,
  },
  inviteLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    paddingVertical: spacing[3],
  },
});
