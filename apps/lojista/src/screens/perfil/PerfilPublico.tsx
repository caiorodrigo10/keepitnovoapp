import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { getDataClient, type EstabelecimentoHorario, type MeuPerfilLojista } from '@keepit/core-data';
import { useAsyncResource } from '@keepit/core-data/hooks';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import type { PerfilStackParamList } from '../../navigation/types';
import { isSupabaseDataSource } from '../../lib/dataSource';
import { useLojaPerfil } from './LojaPerfilContext';
import { CATEGORIA_OPTIONS } from '../auth/cadastroDraft';

type Props = NativeStackScreenProps<PerfilStackParamList, 'PerfilPublico'>;

/** Mapa reverso rótulo->valor de categoria — usado só pela variante mock (Context guarda o rótulo em PT). */
function categoriaValueFromLabel(label: string): string | null {
  return CATEGORIA_OPTIONS.find((option) => option.label === label)?.value ?? null;
}

const DIA_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Story 3.11 (AC1) — linha honesta de um dia: "fechado" quando `aberto=false` OU falta horário, nunca um horário fabricado. */
function formatHorarioLinha(horario: EstabelecimentoHorario): string {
  const dia = DIA_SEMANA_LABEL[horario.dia_semana] ?? `Dia ${horario.dia_semana}`;
  if (!horario.aberto || !horario.hora_abre || !horario.hora_fecha) {
    return `${dia}: fechado`;
  }
  return `${dia}: ${horario.hora_abre} às ${horario.hora_fecha}`;
}

const MSG_ERRO_PERFIL = 'Não foi possível carregar seu perfil agora. Tente novamente em instantes.';
const MSG_SEM_SESSAO = 'Sessão não encontrada. Entre novamente para ver seu perfil.';
const MSG_ERRO_SALVAR = 'Não foi possível salvar agora. Tente novamente em instantes.';
const MSG_HORARIOS_VAZIO = 'Horários não definidos.';

/**
 * Perfil público (editar) — Story 0.8 (Task 9), religada a dados/mutação
 * reais pela Story 3.11 (AC1-AC6).
 *
 * Ancorada no item "Perfil público" de Configurações (P11 — ver Dev Notes).
 * "Nome da loja" deixou de ser editável (AC2) — divergência corrigida do
 * mock original da Story 0.8 a favor do AC3 sourced do Épico 3 (CNPJ/nome
 * fantasia/telefone/endereço só mudam via atendimento/admin). "Logo da
 * loja" (`logoLocalUri`) permanece demonstrativo/local em AMBOS os modos —
 * sem coluna correspondente em `estabelecimentos` (AC5).
 *
 * [AUTO-DECISION] Duas variantes internas (`PerfilPublicoMock`/
 * `PerfilPublicoSupabase`), escolhidas por `isSupabaseDataSource()` — não o
 * padrão "porta uniforme" (`getDataClient()` sem checar a env var) já usado
 * por `Login.tsx`/`CadastroPasso1.tsx` → (reason: ver JSDoc de
 * `../../lib/dataSource.ts` — `LojaPerfilContext` não é uma port com dois
 * adapters, é estado 100% local ao app; a Story 3.11 (Data Mode) exige que
 * `DATA_SOURCE=mock` preserve esse Context tal como está, "sem tocar rede").
 */
export default function PerfilPublico(props: Props) {
  return isSupabaseDataSource() ? <PerfilPublicoSupabase {...props} /> : <PerfilPublicoMock {...props} />;
}

/** Variante `DATA_SOURCE=mock` (AC6) — mesma edição demonstrativa da Story 0.8, sem tocar rede. */
function PerfilPublicoMock({ navigation }: Props) {
  const { perfil, updatePerfil } = useLojaPerfil();

  const [categoriaValue, setCategoriaValue] = useState<string | null>(categoriaValueFromLabel(perfil.categoria));
  const [descricao, setDescricao] = useState(perfil.descricao);
  const [logoLocalUri, setLogoLocalUri] = useState(perfil.logoLocalUri);
  const [fotoFachadaUrl, setFotoFachadaUrl] = useState(perfil.foto_fachada_url);

  function handleSalvar() {
    const categoriaLabel = CATEGORIA_OPTIONS.find((option) => option.value === categoriaValue)?.label ?? perfil.categoria;
    // AC2 — "Salvar" nunca envia nome_fantasia, nem no modo mock (Context).
    updatePerfil({
      categoria: categoriaLabel,
      descricao,
      logoLocalUri,
      foto_fachada_url: fotoFachadaUrl,
    });
    navigation.navigate('Configuracoes');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Perfil público</Text>

        <Pressable
          style={styles.logoUpload}
          onPress={() => setLogoLocalUri((current) => (current ? null : 'local-placeholder'))}
        >
          <View style={[styles.logoCircle, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="camera-outline" size={24} color={darkColors.text.secondary} />
          </View>
          <View>
            <Text style={[styles.logoLabel, { color: darkColors.text.primary }]}>Logo da loja</Text>
            <Text style={[styles.logoAction, { color: darkColors.accent.brand }]}>
              {logoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <FormField label="Nome da loja" value={perfil.nome_fantasia} onChangeText={() => {}} editable={false} />

        <SelectField
          label="Categoria"
          value={categoriaValue}
          options={[...CATEGORIA_OPTIONS]}
          onChange={setCategoriaValue}
        />

        <FormField
          label="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Conte para os clientes o que sua loja oferece"
          multiline
        />

        <Pressable
          style={styles.fachadaUpload}
          onPress={() => setFotoFachadaUrl((current) => (current ? null : 'local-placeholder'))}
        >
          <View style={[styles.fachadaBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="storefront-outline" size={28} color={darkColors.text.secondary} />
            <Text style={[styles.fachadaLabel, { color: darkColors.text.primary }]}>Foto da fachada</Text>
            <Text style={[styles.fachadaAction, { color: darkColors.accent.brand }]}>
              {fotoFachadaUrl ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.horariosBlock}>
          <Text style={[styles.horariosTitle, { color: darkColors.text.secondary }]}>Horários</Text>
          <Text style={[styles.horariosEmpty, { color: darkColors.text.tertiary }]}>{MSG_HORARIOS_VAZIO}</Text>
        </View>

        <View style={styles.spacer} />
        <PrimaryButton label="Salvar" onPress={handleSalvar} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Variante `DATA_SOURCE=supabase` (AC1-AC5) — leitura/escrita reais do PRÓPRIO estabelecimento. */
function PerfilPublicoSupabase({ navigation }: Props) {
  const client = getDataClient();
  const { data: perfil, loading, error } = useAsyncResource<MeuPerfilLojista | null>(
    () => client.estabelecimentoCadastro.getMeuPerfil(),
    null,
    [],
  );

  // "Logo da loja" (AC5) — sem coluna correspondente em `estabelecimentos`,
  // permanece demonstrativo/local também neste modo (nunca lido/persistido
  // de nenhuma fonte real).
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [categoriaValue, setCategoriaValue] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Prefill único, na primeira vez que `perfil` chega — sem sobrescrever
  // edições em andamento do lojista a cada re-render.
  if (!initialized && perfil) {
    setCategoriaValue(perfil.categoria);
    setDescricao(perfil.descricao ?? '');
    setInitialized(true);
  }

  async function handleSalvar() {
    setSaveError(null);
    setSaving(true);
    try {
      // AC2 — payload restrito a categoria/descricao, nunca nome_fantasia.
      await client.estabelecimentoCadastro.atualizarMeuPerfil({
        categoria: categoriaValue ?? perfil?.categoria ?? '',
        descricao: descricao.trim() || null,
      });
      navigation.navigate('Configuracoes');
    } catch {
      // AC3 — falha honesta, sem navegar, dados preservados no formulário.
      setSaveError(MSG_ERRO_SALVAR);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
        <View style={styles.stateContainer}>
          <ActivityIndicator color={darkColors.accent.brand} />
          <Text style={[styles.stateText, { color: darkColors.text.secondary }]}>Carregando perfil…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, { color: darkColors.text.secondary }]}>{MSG_ERRO_PERFIL}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!perfil) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, { color: darkColors.text.secondary }]}>{MSG_SEM_SESSAO}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Perfil público</Text>

        <Pressable
          style={styles.logoUpload}
          onPress={() => setLogoLocalUri((current) => (current ? null : 'local-placeholder'))}
        >
          <View style={[styles.logoCircle, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="camera-outline" size={24} color={darkColors.text.secondary} />
          </View>
          <View>
            <Text style={[styles.logoLabel, { color: darkColors.text.primary }]}>Logo da loja</Text>
            <Text style={[styles.logoAction, { color: darkColors.accent.brand }]}>
              {logoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <FormField label="Nome da loja" value={perfil.nome_fantasia} onChangeText={() => {}} editable={false} />

        <SelectField
          label="Categoria"
          value={categoriaValue}
          options={[...CATEGORIA_OPTIONS]}
          onChange={setCategoriaValue}
        />

        <FormField
          label="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Conte para os clientes o que sua loja oferece"
          multiline
        />

        {/*
          AC4 — foto real via URL assinada (curta expiração), sem upload real
          (sem expo-image-picker, Scope "Excluído"): sem placeholder de
          "Adicionar imagem" enganoso neste modo — só a foto real (quando
          existe) ou um estado vazio honesto.
        */}
        <View style={[styles.fachadaBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
          {perfil.foto_fachada_url_assinada ? (
            <Image
              source={{ uri: perfil.foto_fachada_url_assinada }}
              style={styles.fachadaImage}
              resizeMode="cover"
            />
          ) : (
            <>
              <Ionicons name="storefront-outline" size={28} color={darkColors.text.secondary} />
              <Text style={[styles.fachadaLabel, { color: darkColors.text.primary }]}>Foto da fachada</Text>
              <Text style={[styles.fachadaAction, { color: darkColors.text.tertiary }]}>Nenhuma foto cadastrada</Text>
            </>
          )}
        </View>

        <View style={styles.horariosBlock}>
          <Text style={[styles.horariosTitle, { color: darkColors.text.secondary }]}>Horários</Text>
          {perfil.horarios.length === 0 ? (
            <Text style={[styles.horariosEmpty, { color: darkColors.text.tertiary }]}>{MSG_HORARIOS_VAZIO}</Text>
          ) : (
            [...perfil.horarios]
              .sort((a, b) => a.dia_semana - b.dia_semana)
              .map((horario) => (
                <Text
                  key={horario.dia_semana}
                  style={[styles.horariosLinha, { color: darkColors.text.primary }]}
                >
                  {formatHorarioLinha(horario)}
                </Text>
              ))
          )}
        </View>

        {!!saveError && <Text style={[styles.submitError, { color: darkColors.accent.warning }]}>{saveError}</Text>}

        <View style={styles.spacer} />
        <PrimaryButton label="Salvar" onPress={handleSalvar} loading={saving} />
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
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
  },
  stateText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  logoUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  logoAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  fachadaUpload: {
    alignSelf: 'stretch',
  },
  fachadaBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    gap: spacing[1],
    overflow: 'hidden',
  },
  fachadaImage: {
    width: '100%',
    height: 160,
    borderRadius: radii.md,
  },
  fachadaLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  fachadaAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  horariosBlock: {
    gap: spacing[1],
  },
  horariosTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
  },
  horariosEmpty: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  horariosLinha: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  submitError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  spacer: {
    height: spacing[4],
  },
});
