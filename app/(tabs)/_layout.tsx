import React, { useRef, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Pressable, Text, Animated, LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { Target, BookHeart, Home, Calendar, Menu } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import { COLORS, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { useUIStore } from '@/stores/uiStore';

// Scaled icon size for iPad
const TAB_ICON_SIZE = scale(28);
const TAB_LABEL_SIZE = scaleFont(11);

function TabBarIcon({
  Icon,
}: {
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>;
}) {
  return (
    <Icon
      color={COLORS.white}
      size={TAB_ICON_SIZE}
      strokeWidth={1.5}
    />
  );
}

// Tab label translation keys mapping
const TAB_LABEL_KEYS: Record<string, string> = {
  mission: 'tabs.mission',
  memories: 'tabs.memories',
  index: 'tabs.home',
  calendar: 'tabs.calendar',
  more: 'tabs.more',
};

const TAB_ICONS: Record<string, React.ComponentType<{ color: string; size: number; strokeWidth: number }>> = {
  mission: Target,
  memories: BookHeart,
  index: Home,
  calendar: Calendar,
  more: Menu,
};

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const isTabBarHidden = useUIStore((s) => s.isTabBarHidden);
  const [tabWidth, setTabWidth] = useState(0);
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  // Animate indicator when tab changes
  useEffect(() => {
    if (tabWidth > 0 && !isTabBarHidden) {
      Animated.parallel([
        Animated.spring(indicatorPosition, {
          toValue: state.index * tabWidth,
          useNativeDriver: true,
          tension: 68,
          friction: 15,
          overshootClamping: true,
        }),
        Animated.timing(indicatorOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.index, tabWidth, indicatorPosition, indicatorOpacity, isTabBarHidden]);

  const handleTabsContainerLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    const singleTabWidth = width / state.routes.length;
    setTabWidth(singleTabWidth);
    // Set initial position without animation
    indicatorPosition.setValue(state.index * singleTabWidth);
  };

  // Don't render tab bar if hidden (must be after all hooks)
  if (isTabBarHidden) {
    return null;
  }

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarOuter}>
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={50} tint="dark" style={styles.tabBarBlur}>
          <View style={styles.tabBarInner}>
            {/* Tabs Container - indicator and tabs share the same reference */}
            <View style={styles.tabsContainer} onLayout={handleTabsContainerLayout}>
              {/* Animated Indicator */}
              {tabWidth > 0 && (
                <Animated.View
                  style={[
                    styles.indicator,
                    {
                      width: tabWidth,
                      opacity: indicatorOpacity,
                      transform: [{ translateX: indicatorPosition }],
                    },
                  ]}
                />
              )}

              {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const isFocused = state.index === index;

                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                };

                const IconComponent = TAB_ICONS[route.name] || Home;
                const labelKey = TAB_LABEL_KEYS[route.name];
                const label = labelKey ? t(labelKey) : route.name;

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    accessibilityLabel={options.tabBarAccessibilityLabel}
                    onPress={onPress}
                    style={styles.tabItem}
                  >
                    <TabBarIcon Icon={IconComponent} />
                    <Text
                      style={[
                        styles.tabLabel,
                        {
                          color: COLORS.white,
                          fontWeight: '400',
                        },
                      ]}
                    >
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

export default function TabLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          animation: 'none', // 탭 전환 애니메이션 제거로 플래시 감소
        }}
        initialRouteName="index"
      >
        <Tabs.Screen
          name="mission"
          options={{
            title: '미션',
          }}
        />
        <Tabs.Screen
          name="memories"
          options={{
            title: '추억',
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: '홈',
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: '캘린더',
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: '더보기',
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: scale(24),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  tabBarOuter: {
    width: IS_TABLET ? '60%' : '90%',
    maxWidth: scale(400),
    borderRadius: scale(100),
    overflow: 'hidden',
    // Glass effect shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: 0.2,
    shadowRadius: scale(32),
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tabBarBlur: {
    width: '100%',
    borderRadius: scale(100),
    overflow: 'hidden',
  },
  tabBarInner: {
    padding: scale(6),
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: scale(100),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(6),
    paddingHorizontal: scale(2),
    borderRadius: scale(100),
  },
  tabLabel: {
    fontSize: TAB_LABEL_SIZE,
    marginTop: scale(2),
    textAlign: 'center',
  },
});
