import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  User,
  Heart,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react-native';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useBackground } from '@/contexts';

const { width, height } = Dimensions.get('window');


type MenuItemType = {
  icon: React.ComponentType<{ color: string; size: number }>;
  label: string;
  onPress: () => void;
};

type MenuSectionType = {
  title: string;
  items: MenuItemType[];
};

export default function MoreScreen() {
  const { backgroundImage } = useBackground();
  const menuSections: MenuSectionType[] = [
    {
      title: '프로필',
      items: [
        { icon: User, label: '내 프로필', onPress: () => {} },
        { icon: Heart, label: '커플 프로필', onPress: () => {} },
      ],
    },
    {
      title: '설정',
      items: [
        { icon: Settings, label: '앱 설정', onPress: () => {} },
        { icon: Bell, label: '알림 설정', onPress: () => {} },
        { icon: Shield, label: '개인정보 보호', onPress: () => {} },
      ],
    },
    {
      title: '지원',
      items: [
        { icon: HelpCircle, label: '도움말', onPress: () => {} },
        { icon: LogOut, label: '로그아웃', onPress: () => {} },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      {/* Background */}
      <ImageBackground
        source={backgroundImage}
        style={styles.backgroundImage}
        blurRadius={40}
      >
        <View style={styles.backgroundScale} />
      </ImageBackground>
      <View style={styles.overlay} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>더보기</Text>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => {
                const IconComponent = item.icon;
                const isLast = itemIndex === section.items.length - 1;
                return (
                  <Pressable
                    key={itemIndex}
                    style={[
                      styles.menuItem,
                      !isLast && styles.menuItemBorder,
                    ]}
                    onPress={item.onPress}
                  >
                    <View style={styles.menuItemLeft}>
                      <IconComponent color="rgba(255, 255, 255, 0.8)" size={22} />
                      <Text style={styles.menuItemLabel}>{item.label}</Text>
                    </View>
                    <ChevronRight color="rgba(255, 255, 255, 0.4)" size={20} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Daydate</Text>
          <Text style={styles.appSlogan}>Everyday, a new Date</Text>
          <Text style={styles.appVersion}>v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  backgroundImage: {
    position: 'absolute',
    width: width,
    height: height,
  },
  backgroundScale: {
    flex: 1,
    transform: [{ scale: 1.1 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  topFadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 64,
    paddingBottom: 120,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemLabel: {
    fontSize: 16,
    color: COLORS.white,
    marginLeft: SPACING.md,
    fontWeight: '400',
  },
  appInfo: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.lg,
  },
  appName: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '600',
  },
  appSlogan: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  appVersion: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: SPACING.sm,
  },
});
