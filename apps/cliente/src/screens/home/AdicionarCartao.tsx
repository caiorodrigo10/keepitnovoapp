import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AdicionarCartao'>;

function maskNumero(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function maskValidade(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/**
 * Adicionar cartão (Task 6, AC1/AC3/AC4). Fiel a `cliente-13-pagamento.png`
 * (seção "ADICIONAR CARTÃO"): preview do cartão + campos Número/Nome/
 * Validade/CVV.
 *
 * AC3: nenhuma tokenização real — submit só adiciona
 * `{ultimo4, bandeira, nome_no_cartao}` ao estado mock local
 * (`CartContext.addCard`, espelhando `clientes_cartoes`; ver Dev Agent
 * Record da Story 0.6 — não existe `clientes_cartoes` port em
 * `packages/core-data`). Nenhum dado sensível de cartão (número completo/
 * CVV) é persistido além do estado local do formulário desta tela.
 */
export default function AdicionarCartao({ navigation }: Props) {
  const cart = useCart();
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');

  const digitsNumero = numero.replace(/\D/g, '');
  const ultimo4 = digitsNumero.slice(-4).padStart(4, '0');
  const podeAdicionar = digitsNumero.length >= 4 && nome.trim().length > 0 && validade.length === 5 && cvv.length >= 3;

  const handleAdicionar = () => {
    cart.addCard({ ultimo4, bandeira: 'Visa', nomeNoCartao: nome.trim() });
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Adicionar cartão</Text>
        <View style={styles.roundButton} />
      </View>

      <View style={styles.cardPreview}>
        <View style={styles.cardChip} />
        <Text style={styles.cardPreviewTag}>CRÉDITO</Text>
        <Text style={styles.cardPreviewNumero}>{numero || '•••• •••• •••• ' + ultimo4}</Text>
        <View style={styles.cardPreviewFooter}>
          <Text style={styles.cardPreviewLabel}>{nome.trim() || 'SEU NOME'}</Text>
          <Text style={styles.cardPreviewLabel}>{validade || 'MM/AA'}</Text>
        </View>
      </View>

      <TextField
        label="Número do cartão"
        value={numero}
        onChangeText={(value) => setNumero(maskNumero(value))}
        placeholder="0000 0000 0000 0000"
        keyboardType="number-pad"
      />
      <TextField label="Nome no cartão" value={nome} onChangeText={setNome} placeholder="Como está no cartão" autoCapitalize="words" />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <TextField label="Validade" value={validade} onChangeText={(value) => setValidade(maskValidade(value))} placeholder="MM/AA" keyboardType="number-pad" />
        </View>
        <View style={styles.rowItem}>
          <TextField
            label="CVV"
            value={cvv}
            onChangeText={(value) => setCvv(value.replace(/\D/g, '').slice(0, 4))}
            placeholder="123"
            keyboardType="number-pad"
          />
        </View>
      </View>

      <Button title="Adicionar cartão" onPress={handleAdicionar} disabled={!podeAdicionar} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['5'],
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  cardPreview: {
    backgroundColor: lightColors.text.primary,
    borderRadius: radii.card,
    padding: spacing['5'],
    marginBottom: spacing['5'],
    minHeight: 160,
    justifyContent: 'space-between',
  },
  cardChip: {
    width: 32,
    height: 22,
    borderRadius: radii.xs,
    backgroundColor: lightColors.accent.brand,
  },
  cardPreviewTag: {
    position: 'absolute',
    top: spacing['5'],
    right: spacing['5'],
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.bg.surface,
    letterSpacing: 0.5,
  },
  cardPreviewNumero: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.bg.primary,
    letterSpacing: 2,
    marginTop: spacing['4'],
  },
  cardPreviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing['4'],
  },
  cardPreviewLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.bg.surface,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: spacing['3'],
  },
  rowItem: {
    flex: 1,
  },
});
