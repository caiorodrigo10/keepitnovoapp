import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createSupportOperationId, getDataClient, type CardInput, type CardRegistration, type HolderInput } from '@keepit/core-data';
import { isSupabaseDataSource } from '../../lib/dataSource';
import { CARD_TOKENIZATION_ENABLED } from '../../config/featureFlags';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AppHeader, Button, FormScreen, TextField } from '../../components/ui';
import { CardPaymentForm } from '../../components/checkout/CardPaymentForm';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useCurrentEmail } from '../../hooks/useCurrentEmail';
import type { HeaderNavigation } from '../../components/ui/appHeaderContracts';

type CardRegistrationRoute = { params?: { operacaoId?: string } };
type Props = { navigation: HeaderNavigation; route: CardRegistrationRoute };
type NavigationProps = Pick<Props, 'navigation'>;

/** Memória de sessão, apenas para a operação pública em curso; nunca persiste dados de cartão. */
const activeOperationsByCliente = new Map<string, string>();

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
export default function AdicionarCartao({ navigation, route }: Props) {
  if (!CARD_TOKENIZATION_ENABLED) return <FormScreen>
    <AppHeader title="Formas de pagamento" back={{ navigation, fallback: () => navigation.goBack() }} />
    <Text>Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.</Text>
  </FormScreen>;
  if (isSupabaseDataSource()) return <AdicionarCartaoReal navigation={navigation} route={route} />;
  return <AdicionarCartaoDemonstracao navigation={navigation} />;
}

function AdicionarCartaoDemonstracao({ navigation }: NavigationProps) {
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');

  const digitsNumero = numero.replace(/\D/g, '');
  const ultimo4 = digitsNumero.slice(-4).padStart(4, '0');
  const podeAdicionar = digitsNumero.length >= 4 && nome.trim().length > 0 && validade.length === 5 && cvv.length >= 3;

  const handleAdicionar = async () => {
    const [expiryMonth, shortYear] = validade.split('/');
    await getDataClient().savedCards.cadastrar({
      operacaoId: createSupportOperationId(),
      cartao: { holderName: nome.trim(), number: digitsNumero, expiryMonth: expiryMonth!, expiryYear: `20${shortYear}`, ccv: cvv },
      titular: { name: nome.trim(), email: 'demo@keepit.invalid', cpfCnpj: '00000000000', postalCode: '00000000', addressNumber: '0', phone: '0000000000' },
    });
    navigation.goBack();
  };

  return (
    <FormScreen
      footer={<Button title="Cartão de demonstração" onPress={handleAdicionar} disabled={!podeAdicionar} />}
    >
      <AppHeader title="Cartão de demonstração" back={{ navigation, fallback: () => navigation.goBack() }} />

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

function AdicionarCartaoReal({ navigation, route }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: email } = useCurrentEmail();
  const operationId = useRef<string | null>(route.params?.operacaoId ?? null);
  const [valorValidacaoCentavos, setValorValidacaoCentavos] = useState<number | null>(null);
  const [carregandoConfiguracao, setCarregandoConfiguracao] = useState(true);
  const [cadastro, setCadastro] = useState<CardRegistration | null>(null);
  const [carregandoCadastro, setCarregandoCadastro] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getDataClient().savedCards.consultarConfiguracao().then((configuration) => {
      if (!active) return;
      setValorValidacaoCentavos(configuration.disponivel ? configuration.valorCentavos : null);
    }).catch(() => {
      if (active) setValorValidacaoCentavos(null);
    }).finally(() => {
      if (active) setCarregandoConfiguracao(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const clienteId = cliente?.id;
    if (!clienteId) {
      setCadastro(null); setCarregandoCadastro(false);
      return;
    }
    const restored = route.params?.operacaoId ?? activeOperationsByCliente.get(clienteId) ?? createSupportOperationId();
    operationId.current = restored;
    activeOperationsByCliente.set(clienteId, restored);
    let active = true;
    setCarregandoCadastro(true);
    void getDataClient().savedCards.consultarCadastro(restored).then((current) => {
      if (!active) return;
      setCadastro(current);
      if (current) {
        operationId.current = current.id;
        activeOperationsByCliente.set(clienteId, current.id);
      }
      if (current?.estado === 'concluida') activeOperationsByCliente.delete(clienteId);
      if (current?.estado === 'recusada') {
        const next = createSupportOperationId();
        operationId.current = next;
        activeOperationsByCliente.set(clienteId, next);
      }
    }).catch(() => {
      if (active) setError('Não foi possível consultar a validação do cartão. Tente novamente.');
    }).finally(() => {
      if (active) setCarregandoCadastro(false);
    });
    return () => { active = false; };
  }, [cliente?.id, route.params?.operacaoId]);

  const submit = async ({ cartao, titular }: { cartao: CardInput; titular: HolderInput; salvarCartao: boolean }) => {
    setSubmitting(true); setError(null);
    try {
      const currentOperationId = operationId.current;
      if (!currentOperationId) return;
      const next = await getDataClient().savedCards.cadastrar({ operacaoId: currentOperationId, cartao, titular });
      operationId.current = next.id;
      if (cliente) activeOperationsByCliente.set(cliente.id, next.id);
      setCadastro(next);
      if (next.estado === 'concluida') {
        if (cliente) activeOperationsByCliente.delete(cliente.id);
        navigation.goBack();
      } else if (next.estado === 'recusada') {
        const retryOperationId = createSupportOperationId();
        operationId.current = retryOperationId;
        if (cliente) activeOperationsByCliente.set(cliente.id, retryOperationId);
      }
    } catch {
      setError('Não foi possível salvar e validar o cartão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const stateMessage = cadastro ? registrationMessage(cadastro.estado) : null;
  const pending = cadastro && !['concluida', 'recusada'].includes(cadastro.estado);
  const showForm = !cadastro || cadastro.estado === 'recusada';

  return <FormScreen>
    <AppHeader title="Adicionar cartão" back={{ navigation, fallback: () => navigation.goBack() }} />
    {error && <Text accessibilityRole="alert">{error}</Text>}
    {carregandoCadastro && <Text>Consultando validação do cartão…</Text>}
    {!carregandoCadastro && stateMessage && <Text>{stateMessage}</Text>}
    {!carregandoCadastro && !pending && showForm && <CardPaymentForm
      mode="perfil"
      initialHolder={{ name: cliente?.nome, email: email ?? undefined, cpfCnpj: cliente?.cpf ?? undefined, phone: cliente?.telefone ?? undefined }}
      valorValidacaoCentavos={valorValidacaoCentavos}
      disabled={carregandoConfiguracao || submitting}
      onSubmit={submit}
    />}
  </FormScreen>;
}

function registrationMessage(estado: CardRegistration['estado']): string {
  switch (estado) {
    case 'criando': return 'Preparando a validação do cartão.';
    case 'tokenizado': return 'Validando o cartão.';
    case 'validando': return 'Validação pendente.';
    case 'estorno_pendente': return 'Estorno pendente. Seu cartão ficará disponível após a confirmação.';
    case 'concluida': return 'Cartão salvo e validação concluída.';
    case 'recusada': return 'O cadastro foi recusado. Confira os dados ou use outro cartão.';
    case 'reconciliacao': return 'A validação está em reconciliação. Atualize mais tarde.';
  }
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
