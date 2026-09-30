import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDataClient, type CardInput, type HolderInput } from '@keepit/core-data';
import { isSupabaseDataSource } from '../../lib/dataSource';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AppHeader, Button, FormScreen, TextField } from '../../components/ui';
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
    if (isSupabaseDataSource()) return;
    cart.addCard({ ultimo4, bandeira: 'Visa', nomeNoCartao: nome.trim() });
    navigation.goBack();
  };

  return (
    <FormScreen
      footer={<Button title="Cartão de demonstração" onPress={handleAdicionar} disabled={!podeAdicionar} />}
    >
      <AppHeader title="Cartão de demonstração" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

      <Text>Cartão de demonstração. Não pode ser reutilizado para cobranças reais.</Text>
      <View style={styles.cardPreview}>
        <View style={styles.cardChip} />
        <Text style={styles.cardPreviewTag}>CRÉDITO</Text>
        <Text style={styles.cardPreviewNumero}>{'•••• •••• •••• ' + ultimo4}</Text>
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

    </FormScreen>
  );
}

const styles = StyleSheet.create({
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


const EMPTY_CARD = { number: '', holderName: '', expiry: '', ccv: '', name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' };

/** Formulário de uso único: somente memória local desta montagem, sem CartContext. */
export function CardPaymentForm({ onSubmit, disabled }: {
  onSubmit(cartao: CardInput, titular: HolderInput): Promise<void>; disabled: boolean;
}) {
  const [fields, setFields] = useState({ ...EMPTY_CARD });
  const clear = useCallback(() => setFields({ ...EMPTY_CARD }), []);
  useFocusEffect(useCallback(() => () => clear(), [clear]));
  useEffect(() => {
    const unsubscribe = getDataClient().auth.onAuthStateChange((cliente) => { if (!cliente) clear(); });
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') clear(); });
    return () => { unsubscribe(); subscription.remove(); };
  }, [clear]);
  const update = (key: keyof typeof EMPTY_CARD, value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  const [month, year] = fields.expiry.split('/');
  const valid = /^\d{13,19}$/.test(fields.number) && fields.holderName.trim().length > 1
    && /^(0[1-9]|1[0-2])$/.test(month ?? '') && /^\d{2}$/.test(year ?? '')
    && new Date(Number(`20${year}`), Number(month), 1).getTime() > Date.now()
    && /^\d{3,4}$/.test(fields.ccv) && fields.name.trim().length > 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)
    && /^(\d{11}|\d{14})$/.test(fields.cpfCnpj) && /^\d{8}$/.test(fields.postalCode)
    && fields.addressNumber.trim().length > 0 && /^\d{10,13}$/.test(fields.phone);
  const submit = () => {
    if (!valid || disabled) return;
    const cartao = { holderName: fields.holderName.trim(), number: fields.number, expiryMonth: month!, expiryYear: `20${year}`, ccv: fields.ccv };
    const titular = { name: fields.name.trim(), email: fields.email.trim(), cpfCnpj: fields.cpfCnpj, postalCode: fields.postalCode, addressNumber: fields.addressNumber.trim(), phone: fields.phone };
    clear();
    // O hook devolve somente erro sanitizado. Nenhum dado do formulário vai a navegação/storage.
    void onSubmit(cartao, titular);
  };
  return <View>
    <Text>Crédito à vista. Os dados deste cartão não serão salvos.</Text>
    <TextField label="Número do cartão" value={fields.number} onChangeText={(v) => update('number', v.replace(/\D/g, '').slice(0, 19))} keyboardType="number-pad" secureTextEntry editable={!disabled} />
    <TextField label="Nome no cartão" value={fields.holderName} onChangeText={(v) => update('holderName', v)} editable={!disabled} />
    <TextField label="Validade (MM/AA)" value={fields.expiry} onChangeText={(v) => update('expiry', maskValidade(v))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="CVV" value={fields.ccv} onChangeText={(v) => update('ccv', v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry editable={!disabled} />
    <TextField label="Nome completo do titular" value={fields.name} onChangeText={(v) => update('name', v)} editable={!disabled} />
    <TextField label="E-mail do titular" value={fields.email} onChangeText={(v) => update('email', v)} keyboardType="email-address" autoCapitalize="none" editable={!disabled} />
    <TextField label="CPF/CNPJ do titular" value={fields.cpfCnpj} onChangeText={(v) => update('cpfCnpj', v.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="CEP de cobrança" value={fields.postalCode} onChangeText={(v) => update('postalCode', v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="Número do endereço" value={fields.addressNumber} onChangeText={(v) => update('addressNumber', v)} editable={!disabled} />
    <TextField label="Telefone do titular" value={fields.phone} onChangeText={(v) => update('phone', v.replace(/\D/g, '').slice(0, 13))} keyboardType="phone-pad" editable={!disabled} />
    <Button title="Pagar à vista" disabled={!valid || disabled} onPress={submit} />
  </View>;
}
