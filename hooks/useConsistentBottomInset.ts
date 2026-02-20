import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { scale } from '@/constants/design';

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

export function useTabBarBottom(): number {
  // iOS 전용: 레거시 플로팅 필 탭바 위치
  // Android는 _layout.tsx에서 직접 렌더링하므로 이 훅 사용 안함
  return scale(24);
}

export default useConsistentBottomInset;
