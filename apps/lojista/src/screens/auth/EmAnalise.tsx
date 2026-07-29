import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmAnalise'>;

/**
 * Tela "Em análise" — Story 0.8 (Task 7).
 *
 * Sem tela literal no protótipo (ver Dev Notes). Comunica a regra já
 * decidida: aprovação é MANUAL pela Keepit (status inicial `em_analise` em
 * `estabelecimentos.status`) — sem prazo automático, sem menção a BrasilAPI.
 * CTA único "Entendi" navega para Login (ver Task 8/AUTO-DECISION).
 */
export default function EmAnalise({ navigation }: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.body}>
          <View style={[styles.iconCircle, { backgroundColor: darkColors.bg.surface }]}>
            <Ionicons name="hourglass-outline" size={40} color={darkColors.accent.brand} />
          </View>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>
            Seu cadastro está em análise
          </Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            A equipe Keepit vai revisar as informações da sua loja manualmente. Assim que o
            cadastro for aprovado, você recebe um aviso e já pode começar a vender.
          </Text>
        </View>

        <PrimaryButton label="Entendi" onPress={() => navigation.navigate('Login')} />
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    textAlign: 'center',
  },
});
