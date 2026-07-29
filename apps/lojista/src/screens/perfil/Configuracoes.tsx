import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { SettingsListItem } from '../../components/SettingsListItem';
import type { MainTabParamList, PerfilStackParamList } from '../../navigation/types';
import { useLojaPerfil } from './LojaPerfilContext';
import { EQUIPE_FIXTURE } from './lojaPerfilDraft';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Configuracoes'>;

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
 */
export default function Configuracoes({ navigation }: Props) {
  const { perfil } = useLojaPerfil();

  function navigateToTab(tab: keyof MainTabParamList, screen: string) {
    const parent = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
    parent?.navigate(tab, { screen } as never);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Configurações</Text>

        <View style={[styles.summaryCard, { backgroundColor: darkColors.bg.surface }]}>
          <View style={[styles.avatar, { backgroundColor: darkColors.accent.brand }]}>
            <Text style={styles.avatarLetter}>{perfil.nome_fantasia.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.summaryText}>
            <Text style={[styles.summaryName, { color: darkColors.text.primary }]}>{perfil.nome_fantasia}</Text>
            <Text style={[styles.summarySubtitle, { color: darkColors.text.tertiary }]}>
              {perfil.categoria} · {perfil.hubNome}
            </Text>
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
