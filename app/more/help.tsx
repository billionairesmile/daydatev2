import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  HelpCircle,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS, IS_TABLET, scale, scaleFont } from '@/constants/design';

export default function HelpScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const menuItems = [
    { icon: MessageCircle, label: t('more.help.inquiry'), onPress: () => {} },
    { icon: HelpCircle, label: t('more.help.faq'), onPress: () => {} },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={scale(24)} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('more.help.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => {
            const IconComponent = item.icon;
            const isLast = index === menuItems.length - 1;
            return (
              <Pressable
                key={index}
                style={[styles.menuItem, !isLast && styles.menuItemBorder]}
                onPress={item.onPress}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.iconWrapper}>
                    <IconComponent color={COLORS.black} size={scale(20)} />
                  </View>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                </View>
                <ChevronRight color="#999" size={scale(20)} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaleFont(18),
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: scale(40),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: scale(SPACING.lg),
  },
  menuCard: {
    marginHorizontal: scale(SPACING.lg),
    backgroundColor: '#f8f8f8',
    borderRadius: scale(RADIUS.md),
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(SPACING.md),
  },
  menuItemLabel: {
    fontSize: scaleFont(16),
    fontWeight: '500',
    color: COLORS.black,
  },
});
