import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useOrders } from '@keepit/core-data/hooks';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import type { MainTabParamList, PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Perfil'>;

interface MenuItem {
  label: string;
  onPress?: () => void;
}

/**
 * Perfil (Task 6, AC1, AC2).
 *
 * Fiel a `docs/design-refs/cliente-08-perfil.png`: avatar com inicial, nome,
 * cards de estatísticas, lista de atalhos. Duas diferenças documentadas no
 * Dev Agent Record: (1) subtítulo mostra **telefone**, não e-mail — `Cliente`
 * (Story 0.2) não tem campo e-mail; (2) card "Hubs favoritos" fica em 0 —
 * não existe port de favoritos no Épico 0.
 */
export default function Perfil({ navigation }: Props) {
  const { data: cliente, loading } = useCurrentCliente();
  const { data: pedidos } = useOrders(cliente?.id ?? '');

  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const displayNome = editing ? nome : (cliente?.nome ?? '');
  const displayTelefone = editing ? telefone : (cliente?.telefone ?? '');
  const inicial = (cliente?.nome ?? '?').trim().charAt(0).toUpperCase() || '?';

  function startEditing() {
    setNome(cliente?.nome ?? '');
    setTelefone(cliente?.telefone ?? '');
    setEditing(true);
  }

  function handleSalvar() {
    // Edição apenas visual — Task 6: "Salvar" navega/volta sem persistir.
    setEditing(false);
  }

  const menuItems: MenuItem[] = [
    {
      label: 'Meus pedidos',
      onPress: () =>
        navigation
          .getParent<BottomTabNavigationProp<MainTabParamList>>()
          ?.navigate('PedidosTab', { screen: 'MeusPedidos' }),
    },
    { label: 'Hubs favoritos' },
    { label: 'Formas de pagamento' },
    { label: 'Notificações', onPress: () => navigation.navigate('Configuracoes') },
    { label: 'Ajuda & suporte' },
  ];

  return (
    <Screen>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        {editing ? (
          <View style={styles.editFields}>
            <TextField label="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" />
            <TextField label="Telefone" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
          </View>
        ) : (
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{loading ? 'Carregando…' : displayNome}</Text>
            <Text style={styles.profileSubtitle}>{displayTelefone}</Text>
          </View>
        )}
        {!editing && (
          <Pressable onPress={startEditing} hitSlop={8}>
            <Text style={styles.editLink}>Editar</Text>
          </Pressable>
        )}
      </View>

      {editing && <Button title="Salvar" onPress={handleSalvar} />}

      {!editing && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{pedidos.length}</Text>
              <Text style={styles.statLabel}>Pedidos</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Hubs favoritos</Text>
            </View>
          </View>

          <View style={styles.menu}>
            {menuItems.map((item) => (
              <Pressable
                key={item.label}
                style={styles.menuRow}
                onPress={item.onPress}
                disabled={!item.onPress}
              >
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuChevron}>{'>'}</Text>
              </Pressable>
            ))}
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
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['6'],
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
  editFields: {
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
});
