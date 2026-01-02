import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Crown,
  Target,
  Bookmark,
  Ban,
  ChevronRight,
  X,
  Image as ImageIcon,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useLanguageStore } from '@/stores';

interface PremiumSubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PremiumSubscriptionModal({
  visible,
  onClose,
}: PremiumSubscriptionModalProps) {
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const {
    isPremium,
    partnerIsPremium,
    plan,
    offerings,
    isLoading,
    loadOfferings,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    openSubscriptionManagement,
  } = useSubscriptionStore();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual' | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  useEffect(() => {
    if (visible && !offerings) {
      loadOfferings();
    }
  }, [visible, offerings, loadOfferings]);

  // Get pricing from RevenueCat offerings or use locale-based fallback
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.product.identifier.includes('monthly')
  );
  const annualPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.product.identifier.includes('annual')
  );

  // Use RevenueCat prices if available, otherwise use locale-based defaults from translations
  const monthlyPrice = monthlyPackage?.product.priceString || t('premium.monthlyPrice');
  const annualPrice = annualPackage?.product.priceString || t('premium.annualPrice');
  const annualMonthlyEquivalent = t('premium.annualMonthlyEquivalent');

  const handlePurchase = async () => {
    if (!selectedPlan) return;

    if (selectedPlan === 'monthly') {
      await purchaseMonthly();
    } else {
      await purchaseAnnual();
    }
    // Don't close modal - it will re-render with premium management view if purchase succeeds
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    const success = await restorePurchases();
    setRestoreLoading(false);
    if (success) {
      Alert.alert(
        t('premium.restoreSuccess'),
        t('premium.restoreSuccessMessage'),
        [{ text: t('common.confirm'), onPress: onClose }]
      );
    } else {
      Alert.alert(
        t('premium.restoreFailed'),
        t('premium.restoreFailedMessage'),
        [{ text: t('common.confirm') }]
      );
    }
  };

  // Premium benefits data (6 items for 2x3 grid)
  const premiumBenefits = [
    {
      title: t('premium.benefits.noAdsPremium'),
      icon: Ban,
    },
    {
      title: t('premium.benefits.missionCompletePremium'),
      icon: Target,
    },
    {
      title: t('premium.benefits.missionGeneratePremiumShort'),
      icon: RefreshCw,
    },
    {
      title: t('premium.benefits.missionKeepPremium'),
      icon: Bookmark,
    },
    {
      title: t('premium.benefits.photoStoragePremium'),
      icon: ImageIcon,
    },
    {
      title: t('premium.benefits.newFeaturesPremium'),
      icon: Zap,
    },
  ];

  // If user has their own premium subscription, show management view
  if (isPremium) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/daydate-logo.png')}
              style={styles.headerLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X color={COLORS.black} size={24} />
            </Pressable>
          </View>

          {/* Centered Content Container - Plan text at exact center */}
          <View style={styles.managementCenterContainer}>
            {/* Top section: Crown + Title (positioned above center) */}
            <View style={styles.managementTopSection}>
              <View style={styles.premiumBadgeTop}>
                <Crown color="#FFD700" size={48} />
              </View>
              <Text style={styles.managementTitle}>{t('premium.currentPlan')}</Text>
            </View>

            {/* Center anchor: Plan name */}
            <Text style={styles.managementPlan}>
              {plan === 'monthly' ? t('premium.monthlyPlan') : t('premium.annualPlan')}
            </Text>

            {/* Bottom section: Button (positioned below center) */}
            <View style={styles.managementBottomSection}>
              <Pressable
                style={styles.manageButton}
                onPress={openSubscriptionManagement}
              >
                <Text style={styles.manageButtonText}>{t('premium.manageSubscription')}</Text>
                <ChevronRight color="#333" size={18} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/daydate-logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
          />
          <Pressable onPress={onClose} style={styles.closeButton}>
            <X color={COLORS.black} size={24} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>{t('premium.heroTitleNew')}</Text>
            <Text style={styles.heroSubtitle}>{t('premium.heroSubtitleNew')}</Text>
          </View>

          {/* Premium Benefits - 2x3 Grid */}
          <View style={styles.benefitsSection}>
            <View style={styles.benefitsTitleWrapper}>
              <View style={styles.benefitsTitleHighlight} />
              <Text style={styles.benefitsSectionTitle}>{t('premium.benefitsTitle')}</Text>
            </View>
            <View style={styles.benefitsGrid}>
              {premiumBenefits.map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <benefit.icon color={COLORS.black} size={24} />
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Pricing Cards */}
          <View style={styles.pricingSection}>
            {/* Annual Card */}
            <Pressable
              style={[
                styles.pricingCard,
                selectedPlan === 'annual' && styles.pricingCardSelected,
              ]}
              onPress={() => setSelectedPlan('annual')}
            >
              {/* Title Row with Badge */}
              <View style={styles.cardTitleRow}>
                <Text style={[styles.pricingCardTitle, selectedPlan === 'annual' && styles.pricingCardTitleSelected]}>
                  {t('premium.annual')}
                </Text>
                <LinearGradient
                  colors={['#34D399', '#06B6D4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveBadgeInline}
                >
                  <Text style={styles.saveBadgeText}>{t('premium.save27')}</Text>
                </LinearGradient>
              </View>

              {/* Price Section */}
              <View style={styles.priceSection}>
                <View style={styles.priceRow}>
                  <Text style={styles.pricingCardPrice}>{annualPrice}</Text>
                  <Text style={styles.pricingCardPeriod}>{t('premium.perYear')}</Text>
                </View>
              </View>
            </Pressable>

            {/* Monthly Card */}
            <Pressable
              style={[
                styles.pricingCard,
                selectedPlan === 'monthly' && styles.pricingCardSelected,
              ]}
              onPress={() => setSelectedPlan('monthly')}
            >
              {/* Title Row */}
              <View style={styles.cardTitleRow}>
                <Text style={[styles.pricingCardTitle, selectedPlan === 'monthly' && styles.pricingCardTitleSelected]}>
                  {t('premium.monthly')}
                </Text>
              </View>

              {/* Price Section */}
              <View style={styles.priceSection}>
                <View style={styles.priceRow}>
                  <Text style={styles.pricingCardPrice}>{monthlyPrice}</Text>
                  <Text style={styles.pricingCardPeriod}>{t('premium.perMonth')}</Text>
                </View>
              </View>
            </Pressable>
          </View>

          {/* Important Notes */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.importantNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.importantNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.importantNotice2')}</Text>
            <Text style={styles.noticeText}>• {t('premium.importantNotice3')}</Text>
          </View>

          {/* Payment Notice */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.paymentNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice2')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice3')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice4')}</Text>
          </View>

          {/* Refund Notice */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.refundNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.refundNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.refundNotice2')}</Text>
            <Text style={styles.noticeText}>• {t('premium.refundNotice3')}</Text>
          </View>

          {/* Restore Purchases Notice */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.restoreNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.restoreNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.restoreNotice2')}</Text>
          </View>

          {/* Restore Purchases & Legal Links */}
          <View style={styles.legalSection}>
            <Pressable
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={restoreLoading}
            >
              {restoreLoading ? (
                <ActivityIndicator color="#666" size="small" />
              ) : (
                <Text style={styles.restoreButtonText}>{t('premium.restorePurchases')}</Text>
              )}
            </Pressable>

            <View style={styles.legalLinks}>
              <Pressable style={styles.legalLinkLeft} onPress={() => Linking.openURL('https://daydate.app/terms')}>
                <Text style={styles.legalLink}>{t('premium.termsOfUse')}</Text>
              </Pressable>
              <Text style={styles.legalDivider}>|</Text>
              <Pressable style={styles.legalLinkRight} onPress={() => Linking.openURL('https://daydate.app/privacy')}>
                <Text style={styles.legalLink}>{t('premium.privacyPolicy')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Fixed Bottom CTA Button */}
        <View style={styles.fixedBottomContainer}>
          {/* Partner premium notice */}
          {partnerIsPremium && (
            <Text style={styles.partnerPremiumBannerText}>
              {t('premium.partnerPremiumNote')}
            </Text>
          )}
          <Pressable
            style={[styles.ctaButton, (isLoading || !selectedPlan || partnerIsPremium) && styles.ctaButtonDisabled]}
            onPress={handlePurchase}
            disabled={isLoading || !selectedPlan || partnerIsPremium}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.ctaText}>
                {partnerIsPremium
                  ? t('premium.alreadyHaveBenefits')
                  : selectedPlan === 'annual'
                    ? t('premium.subscribeAnnualCTA')
                    : selectedPlan === 'monthly'
                      ? t('premium.subscribeMonthlyCTA')
                      : t('premium.subscribe')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerLogo: {
    width: 120,
    height: 32,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  heroSection: {
    alignItems: 'flex-start',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'left',
    marginBottom: SPACING.md,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'left',
  },
  // Benefits Section
  benefitsSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 4,
    borderColor: '#FEF3C7',
  },
  benefitsTitleWrapper: {
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  benefitsTitleHighlight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
  },
  benefitsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  benefitItem: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xxl,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    marginHorizontal: '1.5%',
    backgroundColor: COLORS.white,
  },
  benefitTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
  },
  // Pricing Section
  pricingSection: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  pricingCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  pricingCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: COLORS.white,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  pricingCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  pricingCardTitleSelected: {
    color: '#1F2937',
  },
  saveBadgeInline: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },
  priceSection: {
    marginTop: 'auto',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  pricingCardPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  pricingCardPeriod: {
    fontSize: 16,
    color: '#888',
    marginLeft: 2,
  },
  pricingCardEquivalent: {
    fontSize: 12,
    color: '#888',
  },
  originalPrice: {
    fontSize: 13,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  // Fixed Bottom Container
  fixedBottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  // CTA Button
  ctaButton: {
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Notice Sections
  noticeSection: {
    marginBottom: SPACING.lg,
  },
  noticeSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: SPACING.xs,
  },
  noticeText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginBottom: 2,
  },
  // Legal Section
  legalSection: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#F5F5F5',
    borderRadius: RADIUS.full,
    marginTop: -SPACING.md,
    marginBottom: SPACING.md,
  },
  restoreButtonText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  legalLinkLeft: {
    flex: 1,
    alignItems: 'center',
  },
  legalLinkRight: {
    flex: 1,
    alignItems: 'center',
  },
  legalLink: {
    fontSize: 15,
    color: '#888',
    textDecorationLine: 'underline',
  },
  legalDivider: {
    fontSize: 15,
    color: '#DDD',
  },
  // Management view styles
  managementCenterContainer: {
    flex: 1,
    alignItems: 'center',
  },
  managementTopSection: {
    flex: 0.8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  premiumBadgeTop: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  managementTitle: {
    fontSize: 14,
    color: '#666',
  },
  managementPlan: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  managementBottomSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    gap: SPACING.xs,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  partnerPremiumNote: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.lg,
  },
  partnerPremiumBannerText: {
    fontSize: 13,
    color: '#D97706',
    textAlign: 'center',
    marginBottom: SPACING.sm,
    fontWeight: '500',
  },
});
