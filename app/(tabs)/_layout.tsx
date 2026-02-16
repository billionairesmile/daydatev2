import React, { useRef, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import {
  StyleSheet,
  View,
  Pressable,
  Text,
  Animated,
  LayoutChangeEvent,
  Platform,
  Dimensions,
  // eslint-disable-next-line react-native/split-platform-components
  DynamicColorIOS,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Compass, BookHeart, Home, Calendar, Menu } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { useTabBarBottom, USE_IOS_26_TAB_BAR } from '@/hooks/useConsistentBottomInset';
import { useUIStore } from '@/stores/uiStore';

// Conditionally import NativeTabs (may not be available in all Expo versions)
let NativeTabs: any = null;
let NativeIcon: any = null;
let NativeLabel: any = null;
try {
  const nativeTabsModule = require('expo-router/unstable-native-tabs');
  NativeTabs = nativeTabsModule.NativeTabs;
  NativeIcon = nativeTabsModule.Icon;
  NativeLabel = nativeTabsModule.Label;
} catch {
  // NativeTabs not available, will use fallback
}

// ============================================
// Platform Detection
// ============================================
const IS_IOS_26 = Platform.OS === 'ios' && isLiquidGlassSupported;
const HAS_NATIVE_TABS = NativeTabs !== null;

if (__DEV__) {
  console.log('[TabBar] iOS 26 Liquid Glass:', IS_IOS_26);
}

// ============================================
// Android Scaling & Layout
// ============================================
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_COMPACT_ANDROID = Platform.OS === 'android' && SCREEN_HEIGHT < 700;
const ANDROID_SCALE = Platform.OS === 'android'
  ? Math.min(Math.min(SCREEN_WIDTH / 360, 1.1), Math.max(Math.min(SCREEN_HEIGHT / 844, 1), 0.7))
  : 1;
const androidScale = (size: number) => Platform.OS === 'android' ? Math.round(size * ANDROID_SCALE) : size;

// Android Tab Bar Layout:
// - Banner ad positioned at: insets.bottom (directly above nav bar)
// - Tab bar positioned at: insets.bottom + bannerHeight (above banner ad)
// - With nav bar: banner → nav bar, tab bar → banner
// - Without nav bar: banner → screen bottom, tab bar → banner

// ============================================
// iOS 26 Theme Colors
// ============================================
const IOS26_TINT_COLOR = '#FF6B9D'; // App's pink accent color
const IOS26_INACTIVE_COLOR_LIGHT = '#00000090';
const IOS26_INACTIVE_COLOR_DARK = '#FFFFFF90';

// ============================================
// Tab Configuration
// ============================================
const TAB_KEYS: Record<string, string> = {
  feed: 'tabs.feed',
  memories: 'tabs.memories',
  index: 'tabs.home',
  calendar: 'tabs.calendar',
  more: 'tabs.more',
};

const TAB_ICONS: Record<string, React.ComponentType<{ color: string; size: number; strokeWidth: number }>> = {
  feed: Compass,
  memories: BookHeart,
  index: Home,
  calendar: Calendar,
  more: Menu,
};

// Android icon sizes
const ANDROID_ICON_SIZES: Record<string, number> = {
  feed: 25,
  memories: 25,
  index: 25,      // Home
  calendar: 24,
  more: 25,
};

// Android icon vertical offset adjustments
const ANDROID_ICON_OFFSETS: Record<string, number> = {
  feed: 0,
  memories: 0,
  index: 1,       // Home - slightly lower
  calendar: 0,
  more: 0,
};

// SF Symbol names for iOS native icons
const TAB_SF_SYMBOLS: Record<string, string> = {
  feed: 'safari',
  memories: 'heart.text.square',
  index: 'house',
  calendar: 'calendar',
  more: 'line.3.horizontal',
};

// ============================================
// iOS 26 Native Tab Bar (using NativeTabs)
// ============================================
function NativeTabLayout() {
  const { t } = useTranslation();

  // Dynamic colors for iOS (matches DynamicColorIOS behavior)
  const inactiveTintColor = Platform.OS === 'ios'
    ? DynamicColorIOS({ light: IOS26_INACTIVE_COLOR_LIGHT, dark: IOS26_INACTIVE_COLOR_DARK })
    : IOS26_INACTIVE_COLOR_DARK;

  // Use the dynamically imported components
  const Icon = NativeIcon;
  const Label = NativeLabel;

  return (
    <NativeTabs
      tintColor={
        Platform.OS === 'ios'
          ? DynamicColorIOS({ light: IOS26_TINT_COLOR, dark: IOS26_TINT_COLOR })
          : IOS26_TINT_COLOR
      }
      labelStyle={{
        color: Platform.OS === 'ios' && isLiquidGlassSupported
          ? DynamicColorIOS({ light: '#000000', dark: '#FFFFFF' })
          : inactiveTintColor,
      }}
      iconColor={
        Platform.OS === 'ios' && isLiquidGlassSupported
          ? DynamicColorIOS({ light: '#000000', dark: '#FFFFFF' })
          : inactiveTintColor
      }
      labelVisibilityMode="labeled"
      indicatorColor={IOS26_TINT_COLOR + '25'}
      disableTransparentOnScrollEdge={true}
    >
      <NativeTabs.Trigger name="feed">
        <Icon sf={TAB_SF_SYMBOLS.feed} />
        <Label>{t(TAB_KEYS.feed)}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="memories">
        <Icon sf={TAB_SF_SYMBOLS.memories} />
        <Label>{t(TAB_KEYS.memories)}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <Icon sf={TAB_SF_SYMBOLS.index} />
        <Label>{t(TAB_KEYS.index)}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendar">
        <Icon sf={TAB_SF_SYMBOLS.calendar} />
        <Label>{t(TAB_KEYS.calendar)}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="more">
        <Icon sf={TAB_SF_SYMBOLS.more} />
        <Label>{t(TAB_KEYS.more)}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ============================================
// Android / Legacy iOS Tab Bar
// ============================================
function ClassicTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tabWidth, setTabWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  // iOS legacy tab bar position
  const tabBarBottom = useTabBarBottom();

  // Android: Get banner ad height for tab bar positioning (tab bar sits above banner)
  const bannerAdHeight = useUIStore((s) => s.bannerAdHeight);

  // Android: Native style (icons only, full width)
  // iOS: Legacy floating pill style
  const ICON_SIZE = isAndroid
    ? (IS_COMPACT_ANDROID ? 22 : 26)
    : 24;
  const TAB_PADDING = isAndroid
    ? (IS_COMPACT_ANDROID ? 12 : 16)
    : 6;

  useEffect(() => {
    if (tabWidth > 0 && isIOS) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: state.index * tabWidth,
          useNativeDriver: true,
          tension: 68,
          friction: 12,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.index, tabWidth, slideAnim, fadeAnim, isIOS]);

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width / state.routes.length;
    setTabWidth(width);
    if (isIOS) {
      slideAnim.setValue(state.index * width);
    }
  };

  const onTabPress = (routeName: string, routeKey: string, index: number) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (state.index !== index && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  // Android: Full-width native style tab bar
  // Tab bar sits above banner ad (banner ad is directly above nav bar)
  // Responsive to navigation bar presence and banner ad height
  if (isAndroid) {
    // Default banner height if not yet loaded (standard AdMob banner is ~50dp)
    const bannerHeight = bannerAdHeight > 0 ? bannerAdHeight : 50;

    return (
      <View style={[androidStyles.container, { bottom: insets.bottom + bannerHeight }]}>
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={50}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={androidStyles.inner} />
        {/* Tab icons row */}
        <View style={androidStyles.tabsRow} onLayout={onLayout}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const IconComponent = TAB_ICONS[route.name] || Home;
            const iconSize = ANDROID_ICON_SIZES[route.name] || ICON_SIZE;
            const iconOffset = ANDROID_ICON_OFFSETS[route.name] || 0;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
                onPress={() => onTabPress(route.name, route.key, index)}
                style={[androidStyles.tabButton, { paddingVertical: TAB_PADDING }]}
              >
                <View style={iconOffset ? { transform: [{ translateY: iconOffset }] } : undefined}>
                  <IconComponent
                    color={COLORS.white}
                    size={iconSize}
                    strokeWidth={focused ? 2.2 : 1.5}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // iOS: Legacy floating pill style
  return (
    <View style={[classicStyles.container, { bottom: tabBarBottom }]}>
      <View style={classicStyles.wrapper}>
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={50}
          tint="dark"
          style={classicStyles.blur}
        >
          <View style={classicStyles.inner}>
            <View style={classicStyles.tabsRow} onLayout={onLayout}>
              {tabWidth > 0 && (
                <Animated.View
                  style={[
                    classicStyles.indicator,
                    {
                      width: tabWidth,
                      opacity: fadeAnim,
                      transform: [{ translateX: slideAnim }],
                    },
                  ]}
                />
              )}
              {state.routes.map((route, index) => {
                const focused = state.index === index;
                const IconComponent = TAB_ICONS[route.name] || Home;
                const label = t(TAB_KEYS[route.name] || route.name);

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={focused ? { selected: true } : {}}
                    accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
                    onPress={() => onTabPress(route.name, route.key, index)}
                    style={[classicStyles.tabButton, { paddingVertical: TAB_PADDING }]}
                  >
                    <IconComponent color={COLORS.white} size={ICON_SIZE} strokeWidth={1.5} />
                    <Text style={[classicStyles.label, { fontSize: 10, fontWeight: focused ? '600' : '400' }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
}

// Android native style tab bar styles
const androidStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  inner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 2,
    fontSize: IS_COMPACT_ANDROID ? 9 : 10,
    color: COLORS.white,
    textAlign: 'center',
  },
  bannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const classicStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  wrapper: {
    width: IS_TABLET ? '55%' : IS_COMPACT_ANDROID ? '82%' : '88%',
    maxWidth: IS_COMPACT_ANDROID ? scale(320) : androidScale(scale(380)),
    borderRadius: IS_COMPACT_ANDROID ? scale(80) : scale(100),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blur: {
    width: '100%',
    borderRadius: scale(100),
    overflow: 'hidden',
  },
  inner: {
    paddingVertical: Platform.OS === 'ios' ? 3 : (IS_COMPACT_ANDROID ? scale(3) : scale(5)),
    paddingHorizontal: Platform.OS === 'ios' ? 3 : (IS_COMPACT_ANDROID ? scale(3) : scale(5)),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: scale(100),
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 3,
    color: COLORS.white,
    textAlign: 'center',
  },
});

// ============================================
// Classic Tab Bar Wrapper for non-iOS 26
// ============================================
function CustomTabBar(props: BottomTabBarProps) {
  const hidden = useUIStore((s) => s.isTabBarHidden);
  if (hidden) return null;
  return <ClassicTabBar {...props} />;
}

// ============================================
// Classic Tab Layout (for Android / Legacy iOS)
// ============================================
function ClassicTabLayout() {
  return (
    <View style={layoutStyles.root}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          animation: 'none',
          lazy: false,
        }}
        initialRouteName="index"
      >
        <Tabs.Screen name="feed" options={{ title: '피드' }} />
        <Tabs.Screen name="memories" options={{ title: '추억' }} />
        <Tabs.Screen name="index" options={{ title: '홈' }} />
        <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
        <Tabs.Screen name="more" options={{ title: '더보기' }} />
      </Tabs>
    </View>
  );
}

// ============================================
// Tab Layout Router
// ============================================
export default function TabLayout() {
  // USE_IOS_26_TAB_BAR 상수로 iOS 26 탭바와 레거시 탭바 전환
  // useConsistentBottomInset.ts에서 동일한 상수를 사용하여 배너 광고 위치도 동기화됨
  if (USE_IOS_26_TAB_BAR && IS_IOS_26 && HAS_NATIVE_TABS) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
