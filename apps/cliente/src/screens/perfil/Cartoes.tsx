import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AppHeader, Button, FormScreen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useSavedCards } from '../../hooks/useSavedCards';
import { CARD_TOKENIZATION_ENABLED } from '../../config/featureFlags';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Cartoes'>;

export default function Cartoes(props: Props) {
  const { navigation } = props;
  if (!CARD_TOKENIZATION_ENABLED) return <FormScreen>
    <AppHeader title="Formas de pagamento" back={{ navigation, fallback: () => navigation.goBack() }} />
    <Text style={styles.state}>Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.</Text>
  </FormScreen>;
  return <CartoesContent {...props} />;
}

function CartoesContent({ navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { cards, loading, error, refresh, definirPrincipal, remover } = useSavedCards(cliente?.id ?? null);

  function confirmarRemocao(cartao: typeof cards[number]) {
    Alert.alert(
      'Remover cartão',
      `Remover ${cartao.bandeira} final ${cartao.ultimo4}? Isso não cancela pedidos já pagos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => { void remover(cartao.id); } },
      ],
    );
  }

  return (
    <FormScreen footer={<Button title="Adicionar cartão" onPress={() => navigation.navigate('AdicionarCartao')} />}>
      <AppHeader title="Formas de pagamento" back={{ navigation, fallback: () => navigation.goBack() }} />
      {loading && <Text style={styles.state}>Carregando cartões…</Text>}
      {!!error && <View style={styles.error}><Text accessibilityRole="alert">{error}</Text><Button title="Tentar novamente" variant="ghost" onPress={() => { void refresh(); }} /></View>}
      {!loading && !error && cards.length === 0 && <Text style={styles.state}>Você ainda não tem cartões salvos.</Text>}
      {cards.map((card) => (
        <View key={card.id} style={styles.card}>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>{card.bandeira} final {card.ultimo4}</Text>
            {card.principal && <Text style={styles.principal}>Principal</Text>}
          </View>
          {!card.principal && <Button title="Definir como principal" variant="ghost" onPress={() => { void definirPrincipal(card.id); }} />}
          <Button title="Remover cartão" variant="ghost" onPress={() => confirmarRemocao(card)} />
        </View>
      ))}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  state: { color: lightColors.text.secondary, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.md.fontSize },
  error: { gap: spacing['3'] },
  card: { gap: spacing['3'], backgroundColor: lightColors.bg.surface, borderRadius: radii.card, padding: spacing['4'], marginBottom: spacing['3'] },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing['2'] },
  cardTitle: { color: lightColors.text.primary, fontFamily: 'HankenGrotesk-SemiBold', fontSize: typography.sizes.lg.fontSize },
  principal: { color: lightColors.accent.successFg, fontFamily: 'HankenGrotesk-SemiBold', fontSize: typography.sizes.sm.fontSize },
});
