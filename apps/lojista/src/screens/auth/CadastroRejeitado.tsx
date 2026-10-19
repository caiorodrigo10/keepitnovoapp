import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroRejeitado'>;

/**
 * Tela "Cadastro não aprovado" — Story 3.10 (AC3). [IDS] CREATE (nenhuma
 * tela equivalente existia — `EmAnalise.tsx`, Story 0.8/3.6, é o estado
 * "aguardando", este é o estado "recusado").
 *
 * Sem tela literal no protótipo (mesma situação de `EmAnalise.tsx`) — segue
 * a MESMA estrutura visual (ícone circular, título, subtítulo, footer com
 * botão) por `[IDS] REUSE` de padrão, trocando só o ícone/cor (`warning` em
 * vez de `brand`) e o texto.
 *
 * `route.params.motivoRejeicao` vem direto da leitura real de
 * `estabelecimentos.motivo_rejeicao` feita pelo `Login.tsx` — exibido na
 * ÍNTEGRA quando existe (AC3: "sem truncar, sem inventar um motivo genérico
 * quando o real existe"). `null`/vazio (a Story 3.9 sempre persiste um
 * motivo real ao rejeitar, mas o tipo permite `null`) cai num texto honesto
 * de "motivo não informado" — nunca um motivo fabricado no lugar do real.
 *
 * "Cadastrar novamente" (AC3) chama `resetDraft()` (`CadastroDraftContext`,
 * já existente desde a Story 0.8) e navega para `CadastroPasso1` — sem
 * persistir nada aqui; é a Story 3.5 (RPC `criar_estabelecimento_completo`,
 * upsert idempotente por `dono_user_id`) quem trata o reenvio.
 */
export default function CadastroRejeitado({ navigation, route }: Props) {
  const { resetDraft } = useCadastroDraft();
  const motivo = route.params.motivoRejeicao?.trim();

  function handleCadastrarNovamente() {
    resetDraft();
    navigation.navigate('CadastroPasso1');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.body}>
          <View style={[styles.iconCircle, { backgroundColor: darkColors.bg.surface }]}>
            <Ionicons name="close-circle-outline" size={40} color={darkColors.accent.warning} />
          </View>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Cadastro não aprovado</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            A Keepit não aprovou o cadastro da sua loja desta vez.
          </Text>
          <Text style={[styles.motivo, { color: darkColors.text.primary, backgroundColor: darkColors.bg.surface }]}>
            {motivo ? motivo : 'Motivo não informado — fale com a Keepit para mais detalhes.'}
          </Text>
        </View>

        <View style={styles.footer}>
          <PrimaryButton label="Cadastrar novamente" onPress={handleCadastrarNovamente} />
        </View>
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
  motivo: {
    width: '100%',
    borderRadius: radii.md,
    padding: spacing[4],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    lineHeight: typography.sizes.base.lineHeight,
  },
  footer: {
    gap: spacing[3],
  },
});
