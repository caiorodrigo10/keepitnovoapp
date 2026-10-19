export interface ModalNavigation {
  goBack(): void;
}

/** O opt-in ainda não solicita a permissão nativa; ambas as escolhas fecham o aviso. */
export function acceptPushPermission(navigation: ModalNavigation) {
  navigation.goBack();
}

export function declinePushPermission(navigation: ModalNavigation) {
  navigation.goBack();
}
