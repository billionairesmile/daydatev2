import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image as ExpoImage } from 'expo-image';
import {
  User,
  Heart,
  Settings,
  ChevronRight,
  Megaphone,
  Headphones,
  FileText,
  Crown,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, rs, fp } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useSubscriptionStore } from '@/stores';
import { PremiumSubscriptionModal } from '@/components/premium';
import { BannerAdView } from '@/components/ads';
import { useBannerAdBottom } from '@/hooks/useConsistentBottomInset';


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
  const { t } = useTranslation();
  const { backgroundImage } = useBackground();
  const router = useRouter();
  const bannerAdBottom = useBannerAdBottom();
  const { isPremium, partnerIsPremium, plan } = useSubscriptionStore();
  // Combined premium status - user has premium benefits if they OR their partner has premium
  const hasPremiumAccess = isPremium || partnerIsPremium;

  // Premium modal state
  const [showPremiumModal, setShowPremiumModal] = React.useState(false);

  // Helper function to navigate with requestAnimationFrame on Android
  const navigateTo = (path: string) => {
    if (Platform.OS === 'android') {
      requestAnimationFrame(() => {
        router.push(path as any);
      });
    } else {
      router.push(path as any);
    }
  };

  const menuSections: MenuSectionType[] = [
    {
      title: t('more.sections.profile'),
      items: [
        { icon: User, label: t('more.menu.myProfile'), onPress: () => navigateTo('/more/my-profile') },
        { icon: Heart, label: t('more.menu.coupleProfile'), onPress: () => navigateTo('/more/couple-profile') },
      ],
    },
    {
      title: t('more.sections.settings'),
      items: [
        { icon: Settings, label: t('more.menu.settings'), onPress: () => navigateTo('/more/settings') },
      ],
    },
    {
      title: t('more.sections.support'),
      items: [
        { icon: Megaphone, label: t('more.menu.announcements'), onPress: () => navigateTo('/more/announcements') },
        { icon: Headphones, label: t('more.menu.customerService'), onPress: () => navigateTo('/more/customer-service') },
        { icon: FileText, label: t('settings.other.termsAndPolicies'), onPress: () => navigateTo('/more/terms') },
      ],
    },
  ];

  const renderMenuItem = (
    item: MenuItemType,
    isLast: boolean,
    itemIndex: number
  ) => {
    const IconComponent = item.icon;

    return (
      <Pressable
        key={itemIndex}
        style={[
          styles.menuItem,
          !isLast && styles.menuItemBorder,
        ]}
        onPress={item.onPress}
        android_ripple={{ color: 'rgba(255, 255, 255, 0.15)', borderless: false }}
      >
        <View style={styles.menuItemLeft}>
          <IconComponent color="rgba(255, 255, 255, 0.8)" size={rs(22)} />
          <Text style={styles.menuItemLabel}>{item.label}</Text>
        </View>
        <ChevronRight color="rgba(255, 255, 255, 0.4)" size={rs(20)} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="high"
          style={styles.backgroundImageStyle}
        />
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />

      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('more.title')}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'android' && { paddingBottom: rs(180) },
        ]}
      >
        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <React.Fragment key={sectionIndex}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.menuCard}>
                {section.items.map((item, itemIndex) => {
                  const isLast = itemIndex === section.items.length - 1;
                  return renderMenuItem(item, isLast, itemIndex);
                })}
              </View>
            </View>

            {/* Premium Card - between Profile and Settings sections */}
            {sectionIndex === 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.sections.premium')}</Text>
                <Pressable
                  style={[styles.premiumCard, hasPremiumAccess && styles.premiumCardActive]}
                  onPress={() => setShowPremiumModal(true)}
                >
                  <View style={styles.premiumCardLeft}>
                    <View style={[styles.premiumIconWrapper, hasPremiumAccess && styles.premiumIconWrapperActive]}>
                      <Crown color={hasPremiumAccess ? '#D97706' : COLORS.black} size={rs(22)} />
                    </View>
                    <View style={styles.premiumInfo}>
                      <Text style={[styles.premiumTitle, hasPremiumAccess && styles.premiumTitleActive]}>
                        {hasPremiumAccess ? t('premium.status.active') : t('premium.title')}
                      </Text>
                      <Text style={styles.premiumDescription}>
                        {hasPremiumAccess
                          ? isPremium
                            ? plan === 'monthly'
                              ? t('premium.status.monthlyPlan')
                              : t('premium.status.annualPlan')
                            : t('premium.status.partnerPlan')
                          : t('premium.subtitle')}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight color={hasPremiumAccess ? '#D97706' : '#999'} size={rs(20)} />
                </Pressable>
              </View>
            )}
          </React.Fragment>
        ))}

      </ScrollView>

      {/* Premium Subscription Modal */}
      <PremiumSubscriptionModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
      />

      {/* Banner Ad - iOS only (Android renders banner inside tab bar) */}
      {Platform.OS === 'ios' && (
        <BannerAdView placement="more" style={[styles.bannerAd, { bottom: bannerAdBottom }]} />
      )}

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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(120),
  },
  header: {
    paddingTop: rs(64),
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(SPACING.lg),
    zIndex: 20,
  },
  headerTitle: {
    fontSize: fp(32),
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: fp(38),
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  section: {
    marginBottom: rs(SPACING.lg),
  },
  sectionTitle: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    marginBottom: rs(SPACING.sm),
    marginLeft: rs(SPACING.xs),
    textTransform: 'uppercase',
    letterSpacing: rs(0.5),
  },
  menuCard: {
    borderRadius: rs(20),
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: rs(SPACING.lg),
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
    fontSize: fp(16),
    color: COLORS.white,
    marginLeft: rs(SPACING.md),
    fontWeight: '400',
  },
  // Premium Card Styles
  premiumCard: {
    borderRadius: rs(20),
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    padding: rs(SPACING.lg),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumCardActive: {
    backgroundColor: '#FFFFFF',
  },
  premiumCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  premiumIconWrapper: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rs(SPACING.md),
  },
  premiumIconWrapperActive: {
    backgroundColor: '#FEF3C7',
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: rs(2),
  },
  premiumTitleActive: {
    color: '#D97706',
  },
  premiumDescription: {
    fontSize: fp(13),
    color: '#666',
  },
  bannerAd: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
