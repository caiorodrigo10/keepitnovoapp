import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lightColors, spacing } from '@keepit/ui-tokens';

import { FORM_SCROLL_PROPS, getKeyboardAvoidingBehavior } from './formContracts';

export interface FormScreenProps {
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function FormScreen({
  children,
  footer,
  contentContainerStyle,
  footerStyle,
  keyboardVerticalOffset = 0,
}: FormScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={getKeyboardAvoidingBehavior(Platform.OS)}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          {...FORM_SCROLL_PROPS}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.bg.primary },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['6'],
    paddingBottom: spacing['5'],
  },
  footer: {
    backgroundColor: lightColors.bg.primary,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['4'],
  },
});
