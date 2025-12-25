import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image as ExpoImage } from 'expo-image';
import {
  User,
  Heart,
  Settings,
  ChevronRight,
  RotateCcw,
  Megaphone,
  Headphones,
  Trash2,
  Crown,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useAuthStore, useOnboardingStore, useMissionStore, useSubscriptionStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
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
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const setIsOnboardingComplete = useAuthStore((state) => state.setIsOnboardingComplete);
  const resetAllTodayMissions = useMissionStore((state) => state.resetAllTodayMissions);
  const resetAuth = useAuthStore((state) => state.reset);
  const coupleSyncCleanup = useCoupleSyncStore((state) => state.cleanup);
  const resetAllMissions = useCoupleSyncStore((state) => state.resetAllMissions);
  const { isPremium, plan } = useSubscriptionStore();

  // Premium modal state
  const [showPremiumModal, setShowPremiumModal] = React.useState(false);

  const handleDevReset = () => {
    Alert.alert(
      t('more.alerts.devReset'),
      t('more.alerts.devResetMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: async () => {
            resetOnboarding();
            setIsOnboardingComplete(false);
            // Reset home tutorial so it shows again after onboarding
            await AsyncStorage.removeItem('hasSeenHomeTutorial');
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  };

  const handleMissionReset = () => {
    Alert.alert(
      t('more.alerts.missionReset'),
      t('more.alerts.missionResetMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: async () => {
            // Reset local mission store
            resetAllTodayMissions();
            // Reset synced missions (coupleSyncStore + database)
            await resetAllMissions();
            Alert.alert(
              t('more.alerts.missionResetComplete'),
              t('more.alerts.missionResetCompleteMessage'),
              [{ text: t('common.confirm') }]
            );
          },
        },
      ]
    );
  };

  const handleFullReset = () => {
    Alert.alert(
      t('more.alerts.fullReset'),
      t('more.alerts.fullResetMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: async () => {
            // 1. 커플 동기화 정리
            coupleSyncCleanup();
            // 2. 온보딩 리셋
            resetOnboarding();
            // 3. 미션 리셋
            resetAllTodayMissions();
            // 4. Auth 리셋
            resetAuth();
            // 5. AsyncStorage 완전 삭제
            await AsyncStorage.clear();

            Alert.alert(
              t('more.alerts.fullResetComplete'),
              t('more.alerts.fullResetCompleteMessage'),
              [
                {
                  text: t('common.confirm'),
                  onPress: () => router.replace('/(auth)/onboarding'),
                },
              ]
            );
          },
        },
      ]
    );
  };

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
      ],
    },
    {
      title: t('more.sections.developer'),
      items: [
        { icon: RotateCcw, label: t('more.menu.onboardingReset'), onPress: handleDevReset },
        { icon: RotateCcw, label: t('more.menu.missionReset'), onPress: handleMissionReset },
        { icon: Trash2, label: t('more.menu.fullReset'), onPress: handleFullReset },
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
          <IconComponent color="rgba(255, 255, 255, 0.8)" size={22} />
          <Text style={styles.menuItemLabel}>{item.label}</Text>
        </View>
        <ChevronRight color="rgba(255, 255, 255, 0.4)" size={20} />
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('more.title')}</Text>
        </View>

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
                  style={[styles.premiumCard, isPremium && styles.premiumCardActive]}
                  onPress={() => setShowPremiumModal(true)}
                >
                  <View style={styles.premiumCardLeft}>
                    <View style={[styles.premiumIconWrapper, isPremium && styles.premiumIconWrapperActive]}>
                      <Crown color={isPremium ? '#FFD700' : 'rgba(255, 255, 255, 0.8)'} size={22} />
                    </View>
                    <View style={styles.premiumInfo}>
                      <Text style={[styles.premiumTitle, isPremium && styles.premiumTitleActive]}>
                        {isPremium ? t('premium.status.active') : t('premium.title')}
                      </Text>
                      <Text style={styles.premiumDescription}>
                        {isPremium
                          ? plan === 'monthly'
                            ? t('premium.status.monthlyPlan')
                            : t('premium.status.annualPlan')
                          : t('premium.subtitle')}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight color={isPremium ? '#FFD700' : 'rgba(255, 255, 255, 0.4)'} size={20} />
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
  // Premium Card Styles
  premiumCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumCardActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: 'rgba(255, 215, 0, 0.4)',
  },
  premiumCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  premiumIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  premiumIconWrapperActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  premiumTitleActive: {
    color: '#FFD700',
  },
  premiumDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
