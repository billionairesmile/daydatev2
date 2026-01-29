import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { scale } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUIStore } from '@/stores/uiStore';

// iOS 26 Liquid Glass 탭바 사용 여부 (테스트를 위해 임시로 비활성화 가능)
// _layout.tsx의 TabLayout과 동일하게 설정해야 함
export const USE_IOS_26_TAB_BAR = true; // true: iOS 26 native tab bar, false: legacy floating pill

// iOS 26 네이티브 탭바 사용 여부 확인
const isUsingIOS26TabBar = Platform.OS === 'ios' && isLiquidGlassSupported && USE_IOS_26_TAB_BAR;

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
  // 실제 로드된 배너 광고 높이를 사용하여 반응형 포지셔닝
  const bannerAdHeight = useUIStore((state) => state.bannerAdHeight);

  if (Platform.OS === 'android') {
    // 배너 광고는 네비바 바로 위에 위치
    return insets.bottom;
  }

  // 배너 광고 높이에 따라 반응형 조정
  const SMALL_BANNER_THRESHOLD = 50;
  const heightAdjustment = bannerAdHeight > 0 && bannerAdHeight <= SMALL_BANNER_THRESHOLD ? -4 : 0;

  if (isUsingIOS26TabBar) {
    // iOS 26 Liquid Glass 네이티브 탭바: 화면 하단에 고정, safe area 포함
    // 탭바 높이 (콘텐츠 영역만): 44pt
    const IOS_26_TAB_BAR_CONTENT_HEIGHT = 44;
    return insets.bottom + IOS_26_TAB_BAR_CONTENT_HEIGHT + heightAdjustment;
  }

  // 레거시 플로팅 필 탭바: 화면에서 떠있는 형태
  // 탭바 위치: scale(24) from bottom
  // 탭바 높이: inner padding(6) + tab padding(12) + icon(24) + label(13) ≈ 55pt
  const LEGACY_TAB_BAR_BOTTOM_POSITION = scale(24);
  const LEGACY_TAB_BAR_HEIGHT = 55;
  return LEGACY_TAB_BAR_BOTTOM_POSITION + LEGACY_TAB_BAR_HEIGHT + heightAdjustment;
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
      // 프리미엄 사용자: 광고 없음, 풀와이드 탭바가 네비바 바로 위에 위치
      return insets.bottom;
    }
  }

  // iOS: 기존 로직 유지
  return scale(24);
}

/**
 * 프리미엄 사용자를 위한 컨텐츠 하단 패딩 훅
 *
 * - 무료 사용자: 0 반환 (배너 광고가 이미 공간을 차지함)
 * - 프리미엄 사용자: 배너 광고 높이 반환 (배너가 없으므로 동일한 공간 확보)
 *
 * 이 훅을 사용하면 프리미엄/무료 사용자 모두 컨텐츠 위치가 일관되게 유지됨
 */
export function usePremiumContentPadding(): number {
  const isPremium = useSubscriptionStore((state) => state.isPremium);
  const partnerIsPremium = useSubscriptionStore((state) => state.partnerIsPremium);
  const showAds = !isPremium && !partnerIsPremium;
  const bannerAdHeight = useUIStore((state) => state.bannerAdHeight);

  if (showAds) {
    // 무료 사용자: 배너 광고가 보이므로 추가 패딩 불필요
    return 0;
  }

  // 프리미엄 사용자: 배너 광고 높이만큼 추가 패딩 (컨텐츠 위치 일관성 유지)
  return bannerAdHeight;
}

export default useConsistentBottomInset;
