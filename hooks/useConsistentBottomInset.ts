import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * Android 네비게이션 바가 있을 때와 없을 때 하단 간격을 제공하는 훅
 *
 * - 네비게이션 바가 있을 때: 시스템이 제공하는 inset 사용
 * - 네비게이션 바가 없을 때: 실제 inset 값 사용 (탭바가 화면 하단으로 내려감)
 *
 * iOS는 항상 시스템 inset을 그대로 사용
 */

// Android에서 네비게이션 바가 "숨겨졌다"고 판단하는 임계값
// 제스처 네비게이션의 경우 작은 inset이 있을 수 있음 (보통 0-20dp)
const NAV_BAR_HIDDEN_THRESHOLD = 24;

export function useConsistentBottomInset() {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'android') {
    // Android에서 네비게이션 바가 숨겨진 경우 (inset이 임계값보다 작음)
    // 실제 inset 값을 사용하여 탭바가 화면 하단으로 내려가도록 함
    if (insets.bottom < NAV_BAR_HIDDEN_THRESHOLD) {
      return {
        ...insets,
        // 네비게이션 바가 숨겨지면 실제 inset 값 사용 (탭바가 아래로 내려감)
        bottom: insets.bottom,
        originalBottom: insets.bottom,
        isNavBarHidden: true,
      };
    }

    return {
      ...insets,
      originalBottom: insets.bottom,
      isNavBarHidden: false,
    };
  }

  // iOS는 시스템 inset 그대로 사용
  return {
    ...insets,
    originalBottom: insets.bottom,
    isNavBarHidden: false,
  };
}

/**
 * 일관된 하단 패딩 값만 반환하는 간단한 버전
 */
export function useConsistentBottomPadding(): number {
  const { bottom } = useConsistentBottomInset();
  return bottom;
}

/**
 * Android 배너 광고 및 탭바 위치 계산 훅
 *
 * 레이아웃 순서 (아래에서 위로):
 * 1. 시스템 네비바 (있으면)
 * 2. 배너 광고 (네비바 바로 위)
 * 3. 탭바 (배너 광고 바로 위)
 */

// 배너와 탭바 사이 간격
const BANNER_TAB_GAP = 0;

export function useBannerAdBottom(): number {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'android') {
    // 배너 광고는 네비바 바로 위에 위치
    return insets.bottom;
  }

  // iOS: 기존 탭바 위에 배너 위치 (기존 로직 유지)
  const TAB_BAR_TOP = 90;
  return TAB_BAR_TOP;
}

export function useTabBarBottom(): number {
  const insets = useSafeAreaInsets();
  // 구독 상태를 직접 참조하여 상태 변경 시 리렌더링 발생하도록 함
  const isPremium = useSubscriptionStore((state) => state.isPremium);
  const partnerIsPremium = useSubscriptionStore((state) => state.partnerIsPremium);
  const showAds = !isPremium && !partnerIsPremium;
  // 실제 로드된 배너 광고 높이를 사용하여 반응형 포지셔닝
  const bannerAdHeight = useUIStore((state) => state.bannerAdHeight);

  if (Platform.OS === 'android') {
    if (showAds) {
      // 무료 사용자: 탭바는 배너 광고 위에 위치
      // 탭바 bottom = 네비바 높이 + 실제 배너 높이 + 간격
      return insets.bottom + bannerAdHeight + BANNER_TAB_GAP;
    } else {
      // 프리미엄 사용자: 광고 없음, iOS와 동일한 위치
      // 네비바가 있으면 네비바 위에, 없으면 화면 하단에 scale(24) 간격
      return insets.bottom + scale(24);
    }
  }

  // iOS: 기존 로직 유지
  return scale(24);
}

export default useConsistentBottomInset;
