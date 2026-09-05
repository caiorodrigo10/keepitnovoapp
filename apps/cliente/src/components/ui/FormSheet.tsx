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

import { lightColors, radii, spacing } from '@keepit/ui-tokens';

import { FORM_SCROLL_PROPS, getKeyboardAvoidingBehavior } from './formContracts';

export interface FormSheetProps {
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function FormSheet({
  children,
  footer,
  contentContainerStyle,
  footerStyle,
  keyboardVerticalOffset = 0,
}: FormSheetProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={getKeyboardAvoidingBehavior(Platform.OS)}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={styles.sheet}>
          <ScrollView
            {...FORM_SCROLL_PROPS}
            contentContainerStyle={[styles.content, contentContainerStyle]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '100%',
    overflow: 'hidden',
    backgroundColor: lightColors.bg.primary,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['6'],
    paddingBottom: spacing['3'],
  },
  footer: {
    backgroundColor: lightColors.bg.primary,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['4'],
  },
});
