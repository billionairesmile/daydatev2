import { create } from 'zustand';

// Default banner height when no ad is loaded or for fallback
const DEFAULT_BANNER_HEIGHT = 55;

interface UIState {
  isTabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
  // Banner ad height tracking for responsive positioning
  bannerAdHeight: number;
  setBannerAdHeight: (height: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isTabBarHidden: false,
  setTabBarHidden: (hidden: boolean) => set({ isTabBarHidden: hidden }),
  // Banner ad height - defaults to expected max height
  bannerAdHeight: DEFAULT_BANNER_HEIGHT,
  setBannerAdHeight: (height: number) => set({ bannerAdHeight: height }),
}));

export default useUIStore;
