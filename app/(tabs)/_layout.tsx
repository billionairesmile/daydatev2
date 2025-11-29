import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Pressable, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Target, BookHeart, Home, Calendar, Menu } from 'lucide-react-native';

import { COLORS, SPACING, RADIUS } from '@/constants/design';

function TabBarIcon({
  Icon,
  focused
}: {
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>;
  focused: boolean;
}) {
  return (
    <Icon
      color={COLORS.white}
      size={28}
      strokeWidth={1.5}
    />
  );
}

const TAB_LABELS: Record<string, string> = {
  mission: '미션',
  memories: '추억',
  index: '홈',
  calendar: '캘린더',
  more: '더보기',
};

const TAB_ICONS: Record<string, React.ComponentType<{ color: string; size: number; strokeWidth: number }>> = {
  mission: Target,
  memories: BookHeart,
  index: Home,
  calendar: Calendar,
  more: Menu,
};

function CustomTabBar({ state, descriptors, navigation }: any) {
  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarOuter}>
        <BlurView intensity={50} tint="dark" style={styles.tabBarBlur}>
          <View style={styles.tabBarInner}>
            {state.routes.map((route: any, index: number) => {
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
              const label = TAB_LABELS[route.name] || route.name;

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  onPress={onPress}
                  style={[
                    styles.tabItem,
                    isFocused && styles.tabItemActive,
                  ]}
                >
                  <TabBarIcon Icon={IconComponent} focused={isFocused} />
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
        </BlurView>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
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
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  tabBarOuter: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 100,
    overflow: 'hidden',
    // Glass effect shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tabBarBlur: {
    width: '100%',
    borderRadius: 100,
    overflow: 'hidden',
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    // Inset shadow effect
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(255, 255, 255, 0.3)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
        shadowRadius: 0,
      },
      android: {},
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 100,
    width: 68,
    minWidth: 68,
    maxWidth: 72,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
});
