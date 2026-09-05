import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import {
  getOnboardingPageFromOffset,
  ONBOARDING_PAGE_COUNT,
  resolveOnboardingBack,
  type OnboardingCompletionAction,
  type OnboardingPageIndex,
} from '../../lib/onboardingFlow';
import { Button, Dots, Screen } from '../ui';
import { OnboardingIllustration } from './OnboardingIllustration';

const PAGES = [
  { heading: 'Escolhe lojas locais na plataforma' },
  { heading: 'Pedido fica pronto no hub Keepit' },
  {
    heading: 'Tudo perto de você, retirado no hub.',
    subtext:
      'Compre de farmácias, lojas e conveniências locais e retire tudo em um ponto de encontro Keepit.',
  },
] as const;

type Page = (typeof PAGES)[number];

export interface OnboardingPagerProps {
  onComplete(action: OnboardingCompletionAction): void;
}

export function OnboardingPager({ onComplete }: OnboardingPagerProps) {
  const listRef = useRef<FlatList<Page>>(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<OnboardingPageIndex>(0);

  const goTo = useCallback(
    (index: OnboardingPageIndex) => {
      if (width <= 0) return;
      listRef.current?.scrollToOffset({ offset: index * width, animated: true });
      setActiveIndex(index);
    },
    [width],
  );

  const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => setWidth(nativeEvent.layout.width);
  const handleMomentumScrollEnd = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(getOnboardingPageFromOffset(nativeEvent.contentOffset.x, width));
  };
  const renderPage = ({ item }: ListRenderItemInfo<Page>) => (
    <View style={[styles.page, { width }]}>
      <Text style={styles.heading}>{item.heading}</Text>
      {'subtext' in item ? <Text style={styles.subtext}>{item.subtext}</Text> : null}
    </View>
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const result = resolveOnboardingBack(activeIndex);
      if (result.kind === 'previous') {
        goTo(result.index);
        return true;
      }
      Alert.alert('Sair do onboarding?', 'Seu progresso ainda não foi concluído.', [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => subscription.remove();
  }, [activeIndex, goTo]);

  const footer = (
    <View>
      {activeIndex > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar etapa"
          onPress={() => goTo((activeIndex - 1) as OnboardingPageIndex)}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
      ) : null}
      <View style={styles.dotsRow}>
        <Dots total={ONBOARDING_PAGE_COUNT} activeIndex={activeIndex} theme="dark" />
      </View>
      {activeIndex < 2 ? (
        <>
          <Button title="Avançar" onPress={() => goTo((activeIndex + 1) as OnboardingPageIndex)} />
          <Pressable onPress={() => onComplete('skip')} hitSlop={8} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>Pular</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Button title="Criar conta" onPress={() => onComplete('create-account')} />
          <Pressable onPress={() => onComplete('login')} hitSlop={8} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>
              Já tenho conta · <Text style={styles.secondaryTextBold}>Entrar</Text>
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );

  return (
    <Screen contentStyle={styles.content} backgroundColor={darkColors.bg.primary}>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <OnboardingIllustration />
      <View style={styles.pageHost} onLayout={handleLayout}>
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          data={PAGES}
          keyExtractor={(_, index) => String(index)}
          showsHorizontalScrollIndicator={false}
          renderItem={renderPage}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      </View>
      <View style={styles.footer}>{footer}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  brand: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    letterSpacing: typography.letterSpacing.wide,
    color: darkColors.text.primary,
    marginBottom: spacing['6'],
  },
  pageHost: {
    marginBottom: spacing['8'],
  },
  page: {},
  heading: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
    lineHeight: typography.sizes['3xl'].lineHeight,
    color: darkColors.text.primary,
    marginBottom: spacing['3'],
  },
  subtext: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
    color: darkColors.text.secondary,
  },
  footer: {
    marginTop: 'auto',
  },
  back: {
    alignItems: 'center',
    marginBottom: spacing['4'],
  },
  backText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    color: darkColors.text.secondary,
  },
  dotsRow: {
    alignItems: 'center',
    marginBottom: spacing['5'],
  },
  secondaryAction: {
    alignItems: 'center',
    marginTop: spacing['4'],
  },
  secondaryText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    color: darkColors.text.secondary,
  },
  secondaryTextBold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: darkColors.text.primary,
  },
});
