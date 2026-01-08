import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
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

import { COLORS, SPACING, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useSubscriptionStore } from '@/stores';
import { PremiumSubscriptionModal } from '@/components/premium';

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
  const { t } = useTranslation();
  const { backgroundImage } = useBackground();
  const router = useRouter();
  const { isPremium, partnerIsPremium, plan } = useSubscriptionStore();
  // Combined premium status - user has premium benefits if they OR their partner has premium
  const hasPremiumAccess = isPremium || partnerIsPremium;

  // Premium modal state
  const [showPremiumModal, setShowPremiumModal] = React.useState(false);

  const menuSections: MenuSectionType[] = [
    {
      title: t('more.sections.profile'),
      items: [
        { icon: User, label: t('more.menu.myProfile'), onPress: () => router.push('/more/my-profile') },
        { icon: Heart, label: t('more.menu.coupleProfile'), onPress: () => router.push('/more/couple-profile') },
      ],
    },
    {
      title: t('more.sections.settings'),
      items: [
        { icon: Settings, label: t('more.menu.settings'), onPress: () => router.push('/more/settings') },
      ],
    },
    {
      title: t('more.sections.support'),
      items: [
        { icon: Megaphone, label: t('more.menu.announcements'), onPress: () => router.push('/more/announcements') },
        { icon: Headphones, label: t('more.menu.customerService'), onPress: () => router.push('/more/customer-service') },
        { icon: FileText, label: t('settings.other.termsAndPolicies'), onPress: () => router.push('/more/terms') },
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
      >
        <View style={styles.menuItemLeft}>
          <IconComponent color="rgba(255, 255, 255, 0.8)" size={scale(22)} />
          <Text style={styles.menuItemLabel}>{item.label}</Text>
        </View>
        <ChevronRight color="rgba(255, 255, 255, 0.4)" size={scale(20)} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Background - ExpoImage + BlurView (optimized) */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          style={styles.backgroundImageStyle}
        />
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.overlay} />

      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('more.title')}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
                      <Crown color={hasPremiumAccess ? '#D97706' : COLORS.black} size={scale(22)} />
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
                  <ChevronRight color={hasPremiumAccess ? '#D97706' : '#999'} size={scale(20)} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(120),
  },
  header: {
    paddingTop: scale(64),
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(SPACING.lg),
    zIndex: 20,
  },
  headerTitle: {
    fontSize: scaleFont(32),
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: scaleFont(38),
  },
  section: {
    marginBottom: scale(SPACING.lg),
  },
  sectionTitle: {
    fontSize: scaleFont(13),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    marginBottom: scale(SPACING.sm),
    marginLeft: scale(SPACING.xs),
    textTransform: 'uppercase',
    letterSpacing: scale(0.5),
  },
  menuCard: {
    borderRadius: scale(20),
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: scale(SPACING.lg),
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
    fontSize: scaleFont(16),
    color: COLORS.white,
    marginLeft: scale(SPACING.md),
    fontWeight: '400',
  },
  // Premium Card Styles
  premiumCard: {
    borderRadius: scale(20),
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    padding: scale(SPACING.lg),
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
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(SPACING.md),
  },
  premiumIconWrapperActive: {
    backgroundColor: '#FEF3C7',
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: scale(2),
  },
  premiumTitleActive: {
    color: '#D97706',
  },
  premiumDescription: {
    fontSize: scaleFont(13),
    color: '#666',
  },
});
