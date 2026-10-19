import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDataClient, type CardInput, type HolderInput } from '@keepit/core-data';

import { Button, Checkbox, TextField } from '../ui';
import { formatReais } from '../../lib/format';
import { CARD_TOKENIZATION_ENABLED } from '../../config/featureFlags';

type Fields = {
  number: string;
  holderName: string;
  expiry: string;
  ccv: string;
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
};

const EMPTY_FIELDS: Fields = {
  number: '', holderName: '', expiry: '', ccv: '', name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '',
};

function maskValidade(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function fieldsFromHolder(holder: Partial<HolderInput>): Fields {
  return {
    ...EMPTY_FIELDS,
    holderName: holder.name ?? '',
    name: holder.name ?? '',
    email: holder.email ?? '',
    cpfCnpj: holder.cpfCnpj ?? '',
    postalCode: holder.postalCode ?? '',
    addressNumber: holder.addressNumber ?? '',
    phone: holder.phone ?? '',
  };
}

function isValid(fields: Fields): boolean {
  const [month, year] = fields.expiry.split('/');
  return /^\d{13,19}$/.test(fields.number) && fields.holderName.trim().length > 1
    && /^(0[1-9]|1[0-2])$/.test(month ?? '') && /^\d{2}$/.test(year ?? '')
    && new Date(Number(`20${year}`), Number(month), 1).getTime() > Date.now()
    && /^\d{3,4}$/.test(fields.ccv) && fields.name.trim().length > 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)
    && /^(\d{11}|\d{14})$/.test(fields.cpfCnpj) && /^\d{8}$/.test(fields.postalCode)
    && fields.addressNumber.trim().length > 0 && /^\d{10,13}$/.test(fields.phone);
}

export type CardPaymentFormProps = {
  mode: 'compra' | 'perfil';
  initialHolder: Partial<HolderInput>;
  disabled: boolean;
  valorValidacaoCentavos: number | null;
  onSubmit(input: { cartao: CardInput; titular: HolderInput; salvarCartao: boolean }): Promise<void>;
};

/** Dados de cartão vivem somente nesta montagem e são apagados antes da chamada assíncrona. */
export function CardPaymentForm({ mode, initialHolder, disabled, valorValidacaoCentavos, onSubmit }: CardPaymentFormProps) {
  const [fields, setFields] = useState<Fields>(() => fieldsFromHolder(initialHolder));
  const [salvarCartao, setSalvarCartao] = useState(CARD_TOKENIZATION_ENABLED && mode === 'compra');
  const [souTitular, setSouTitular] = useState(true);
  const clear = useCallback(() => setFields({ ...EMPTY_FIELDS }), []);

  useFocusEffect(useCallback(() => () => clear(), [clear]));
  useEffect(() => {
    const unsubscribe = getDataClient().auth.onAuthStateChange((cliente) => { if (!cliente) clear(); });
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') clear(); });
    return () => { unsubscribe(); subscription.remove(); };
  }, [clear]);
  useEffect(() => {
    if (!souTitular) return;
    setFields((previous) => ({
      ...previous,
      holderName: previous.holderName || initialHolder.name || '',
      name: previous.name || initialHolder.name || '',
      email: previous.email || initialHolder.email || '',
      cpfCnpj: previous.cpfCnpj || initialHolder.cpfCnpj || '',
      postalCode: previous.postalCode || initialHolder.postalCode || '',
      addressNumber: previous.addressNumber || initialHolder.addressNumber || '',
      phone: previous.phone || initialHolder.phone || '',
    }));
  }, [initialHolder.addressNumber, initialHolder.cpfCnpj, initialHolder.email, initialHolder.name, initialHolder.phone, initialHolder.postalCode, souTitular]);

  const update = (key: keyof Fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  const valid = isValid(fields) && !disabled && (mode === 'compra' || valorValidacaoCentavos !== null) && (mode === 'compra' || CARD_TOKENIZATION_ENABLED);
  const submit = () => {
    if (!valid) return;
    const [expiryMonth, shortYear] = fields.expiry.split('/');
    const cartao = { holderName: fields.holderName.trim(), number: fields.number, expiryMonth: expiryMonth!, expiryYear: `20${shortYear}`, ccv: fields.ccv };
    const titular = { name: fields.name.trim(), email: fields.email.trim(), cpfCnpj: fields.cpfCnpj, postalCode: fields.postalCode, addressNumber: fields.addressNumber.trim(), phone: fields.phone };
    clear();
    void onSubmit({ cartao, titular, salvarCartao: CARD_TOKENIZATION_ENABLED && (mode === 'perfil' || salvarCartao) });
  };
  const toggleTitular = () => {
    setSouTitular((current) => !current);
    if (souTitular) {
      setFields((previous) => ({ ...previous, holderName: '', name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' }));
    } else {
      setFields((previous) => ({ ...previous, ...fieldsFromHolder(initialHolder), number: previous.number, expiry: previous.expiry, ccv: previous.ccv }));
    }
  };

  return <View>
    {mode === 'compra' && <Text>Crédito à vista.</Text>}
    {mode === 'perfil' && <>
      {valorValidacaoCentavos === null
        ? <Text accessibilityRole="alert">O valor de validação está indisponível. Tente novamente mais tarde.</Text>
        : <Text>Será feita uma cobrança de validação de {formatReais(valorValidacaoCentavos / 100)}, estornada em seguida. O prazo de aparecer na fatura depende do emissor.</Text>}
    </>}
    <TextField label="Número do cartão" value={fields.number} onChangeText={(value) => update('number', value.replace(/\D/g, '').slice(0, 19))} keyboardType="number-pad" secureTextEntry editable={!disabled} />
    <TextField label="Nome no cartão" value={fields.holderName} onChangeText={(value) => update('holderName', value)} editable={!disabled} />
    <TextField label="Validade (MM/AA)" value={fields.expiry} onChangeText={(value) => update('expiry', maskValidade(value))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="CVV" value={fields.ccv} onChangeText={(value) => update('ccv', value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry editable={!disabled} />
    <Checkbox checked={souTitular} onToggle={toggleTitular} label="Sou o titular">Sou o titular</Checkbox>
    <TextField label="Nome completo do titular" value={fields.name} onChangeText={(value) => update('name', value)} editable={!disabled} />
    <TextField label="E-mail do titular" value={fields.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" editable={!disabled} />
    <TextField label="CPF/CNPJ do titular" value={fields.cpfCnpj} onChangeText={(value) => update('cpfCnpj', value.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="CEP de cobrança" value={fields.postalCode} onChangeText={(value) => update('postalCode', value.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" editable={!disabled} />
    <TextField label="Número do endereço" value={fields.addressNumber} onChangeText={(value) => update('addressNumber', value)} editable={!disabled} />
    <TextField label="Telefone do titular" value={fields.phone} onChangeText={(value) => update('phone', value.replace(/\D/g, '').slice(0, 13))} keyboardType="phone-pad" editable={!disabled} />
    {CARD_TOKENIZATION_ENABLED && mode === 'compra' && <Checkbox checked={salvarCartao} onToggle={() => setSalvarCartao((current) => !current)} label="Salvar este cartão">Salvar este cartão</Checkbox>}
    <Button title={mode === 'perfil' ? 'Salvar e validar cartão' : 'Pagar'} disabled={!valid} onPress={submit} />
  </View>;
}
