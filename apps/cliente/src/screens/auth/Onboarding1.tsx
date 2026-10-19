import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OnboardingPager } from '../../components/onboarding/OnboardingPager';
import {
  getOnboardingDestination,
  type OnboardingCompletionAction,
} from '../../lib/onboardingFlow';
import { setOnboardingVisto } from '../../lib/onboardingFlag';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding1'>;

export default function Onboarding1({ navigation }: Props) {
  const handleComplete = async (action: OnboardingCompletionAction) => {
    await setOnboardingVisto();
    navigation.replace(getOnboardingDestination(action));
  };

  return <OnboardingPager onComplete={(action) => void handleComplete(action)} />;
}
