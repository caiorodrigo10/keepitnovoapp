import { Ionicons } from '@expo/vector-icons';

interface BellIconProps {
  color: string;
  size?: number;
}

/**
 * [IDS] ADAPT — ícone de "sino" (modal de permissão push) via
 * `@expo/vector-icons` (Story 0.5, débito de fidelidade visual). Substitui a
 * versão anterior desenhada com Views puras, de quando a lib de ícones ainda
 * não estava instalada em `apps/cliente`. Mantém a mesma assinatura de props
 * (`color`/`size`) para não quebrar `ModalPermissaoPush.tsx`.
 */
export function BellIcon({ color, size = 24 }: BellIconProps) {
  return <Ionicons name="notifications" size={size} color={color} />;
}
