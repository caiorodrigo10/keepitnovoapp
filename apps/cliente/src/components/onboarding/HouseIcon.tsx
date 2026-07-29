import { Ionicons } from '@expo/vector-icons';

interface HouseIconProps {
  color: string;
  size?: number;
}

/**
 * [IDS] ADAPT — ícone de "casa" (símbolo central do onboarding, dentro do
 * círculo verde — ver `cliente-01-onboarding.png`) via `@expo/vector-icons`
 * (Story 0.5, débito de fidelidade visual). Substitui a versão anterior
 * desenhada com Views puras (triângulo via borda + retângulo), de quando a
 * lib de ícones ainda não estava instalada em `apps/cliente`. Mantém a mesma
 * assinatura de props (`color`/`size`) para não quebrar
 * `OnboardingIllustration.tsx`.
 */
export function HouseIcon({ color, size = 28 }: HouseIconProps) {
  return <Ionicons name="home-outline" size={size} color={color} />;
}
