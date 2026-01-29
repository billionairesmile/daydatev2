import React, { useEffect, useState, useMemo } from 'react';
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
import { useConsistentBottomInset } from '@/hooks/useConsistentBottomInset';
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
import { getLocales } from 'expo-localization';

import { COLORS, SPACING, RADIUS, scale, scaleFont, IS_TABLET } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

interface PremiumSubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PremiumSubscriptionModal({
  visible,
  onClose,
}: PremiumSubscriptionModalProps) {
  const { t } = useTranslation();
  const insets = useConsistentBottomInset();
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

  // Get device locale/region (not app language) for pricing
  const isKoreanLocale = useMemo(() => {
    const locales = getLocales();
    // Check if device region is Korea (KR) - this is independent of app language
    return locales.some(locale => locale.regionCode === 'KR');
  }, []);

  // Locale-based fallback prices (device region, not app language)
  const localeFallbackPrices = useMemo(() => {
    if (isKoreanLocale) {
      return {
        monthly: '₩4,900',
        annual: '₩45,000',
      };
    }
    return {
      monthly: '$3.99',
      annual: '$34.99',
    };
  }, [isKoreanLocale]);

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

  // Check if RevenueCat price matches expected currency for locale
  // If Korean locale but RevenueCat returns USD (sandbox issue), use fallback
  const shouldUseLocaleFallback = useMemo(() => {
    if (!monthlyPackage?.product.priceString && !annualPackage?.product.priceString) {
      return true; // No RevenueCat prices, use fallback
    }

    const priceString = monthlyPackage?.product.priceString || annualPackage?.product.priceString || '';

    if (isKoreanLocale) {
      // Korean locale should have ₩ or 원, not $ or US$
      const hasKoreanCurrency = priceString.includes('₩') || priceString.includes('원');
      return !hasKoreanCurrency;
    } else {
      // Non-Korean locale should have $ (USD)
      const hasUSDCurrency = priceString.includes('$');
      return !hasUSDCurrency;
    }
  }, [isKoreanLocale, monthlyPackage, annualPackage]);

  // Use locale-based fallback if RevenueCat currency doesn't match device locale
  // This prevents showing wrong prices in sandbox or misconfigured environments
  const monthlyPrice = shouldUseLocaleFallback
    ? localeFallbackPrices.monthly
    : (monthlyPackage?.product.priceString || localeFallbackPrices.monthly);
  const annualPrice = shouldUseLocaleFallback
    ? localeFallbackPrices.annual
    : (annualPackage?.product.priceString || localeFallbackPrices.annual);

  const handlePurchase = async () => {
    if (!selectedPlan) return;

    // Check if RevenueCat is properly configured
    const { isRevenueCatConfigured } = useSubscriptionStore.getState();

    if (!isRevenueCatConfigured) {
      console.log('[PremiumModal] RevenueCat not configured');
      Alert.alert(
        t('common.error'),
        t('premium.storeNotAvailable', { defaultValue: 'In-App Purchase is not available. Please try again later.' }),
        [{ text: t('common.confirm') }]
      );
      return;
    }

    try {
      let success = false;
      if (selectedPlan === 'monthly') {
        success = await purchaseMonthly();
      } else {
        success = await purchaseAnnual();
      }

      // Don't close modal - it will re-render with premium management view if purchase succeeds
      if (!success) {
        // Check if there's an error in the store
        const { error: purchaseError } = useSubscriptionStore.getState();
        if (purchaseError) {
          console.log('[PremiumModal] Purchase failed with error:', purchaseError);
          Alert.alert(
            t('common.error'),
            purchaseError,
            [{ text: t('common.confirm') }]
          );
        } else {
          // Purchase was cancelled by user - no need to show error
          console.log('[PremiumModal] Purchase cancelled or not completed');
        }
      }
    } catch (error) {
      console.error('[PremiumModal] Purchase error:', error);
      Alert.alert(
        t('common.error'),
        t('premium.purchaseError'),
        [{ text: t('common.confirm') }]
      );
    }
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
              <X color={COLORS.black} size={scale(24)} />
            </Pressable>
          </View>

          {/* Centered Content Container - Plan text at exact center */}
          <View style={styles.managementCenterContainer}>
            {/* Top section: Crown + Title (positioned above center) */}
            <View style={styles.managementTopSection}>
              <View style={styles.premiumBadgeTop}>
                <Crown color="#FFD700" size={scale(48)} />
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
                <ChevronRight color="#333" size={scale(18)} />
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
            <X color={COLORS.black} size={scale(24)} />
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
                  <benefit.icon color={COLORS.black} size={IS_TABLET ? 24 * 0.75 : scale(24)} />
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
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
  },
  headerLogo: {
    width: scale(120),
    height: scale(32),
  },
  closeButton: {
    width: scale(40),
    height: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(SPACING.lg),
  },
  heroSection: {
    alignItems: 'flex-start',
    paddingTop: scale(SPACING.xl),
    paddingBottom: scale(SPACING.lg),
  },
  heroTitle: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'left',
    marginBottom: scale(SPACING.md),
  },
  heroSubtitle: {
    fontSize: scaleFont(15),
    color: '#666',
    textAlign: 'left',
  },
  // Benefits Section
  benefitsSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: IS_TABLET ? RADIUS.md * 0.75 : scale(RADIUS.md),
    padding: IS_TABLET ? SPACING.lg * 0.75 : scale(SPACING.lg),
    marginBottom: IS_TABLET ? SPACING.lg * 0.75 : scale(SPACING.lg),
    borderWidth: IS_TABLET ? 3 : scale(4),
    borderColor: '#FEF3C7',
  },
  benefitsTitleWrapper: {
    alignSelf: 'center',
    marginBottom: scale(SPACING.lg),
  },
  benefitsTitleHighlight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#FEF3C7',
    borderRadius: scale(4),
  },
  benefitsSectionTitle: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    paddingHorizontal: scale(SPACING.sm),
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: IS_TABLET ? SPACING.sm * 0.75 : scale(SPACING.sm),
    width: '100%',
  },
  benefitItem: {
    width: '48%',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    paddingVertical: IS_TABLET ? SPACING.md * 0.75 : scale(SPACING.md),
    paddingHorizontal: IS_TABLET ? SPACING.sm * 0.75 : scale(SPACING.sm),
    gap: IS_TABLET ? SPACING.lg * 0.75 : scale(SPACING.xxl),
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: IS_TABLET ? RADIUS.md * 0.75 : scale(RADIUS.md),
    backgroundColor: COLORS.white,
  },
  benefitTitle: {
    fontSize: IS_TABLET ? 13 * 0.75 : scaleFont(13),
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
  },
  // Pricing Section
  pricingSection: {
    flexDirection: 'row',
    gap: scale(SPACING.md),
    marginBottom: scale(SPACING.xl),
  },
  pricingCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: scale(16),
    padding: scale(SPACING.md),
    borderWidth: scale(2),
    borderColor: '#E5E7EB',
  },
  pricingCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: COLORS.white,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(32),
  },
  pricingCardTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: '#1F2937',
  },
  pricingCardTitleSelected: {
    color: '#1F2937',
  },
  saveBadgeInline: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(6),
  },
  saveBadgeText: {
    fontSize: scaleFont(11),
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
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: COLORS.black,
  },
  pricingCardPeriod: {
    fontSize: scaleFont(16),
    color: '#888',
    marginLeft: scale(2),
  },
  pricingCardEquivalent: {
    fontSize: scaleFont(12),
    color: '#888',
  },
  originalPrice: {
    fontSize: scaleFont(13),
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginTop: scale(2),
  },
  // Fixed Bottom Container
  fixedBottomContainer: {
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    backgroundColor: COLORS.white,
    borderTopWidth: scale(1),
    borderTopColor: '#F0F0F0',
  },
  // CTA Button
  ctaButton: {
    backgroundColor: COLORS.black,
    borderRadius: scale(RADIUS.full),
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: COLORS.white,
  },
  // Notice Sections
  noticeSection: {
    marginBottom: scale(SPACING.lg),
  },
  noticeSectionTitle: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#555',
    marginBottom: scale(SPACING.xs),
  },
  noticeText: {
    fontSize: scaleFont(12),
    color: '#888',
    lineHeight: scaleFont(18),
    marginBottom: scale(2),
  },
  // Legal Section
  legalSection: {
    alignItems: 'center',
    paddingTop: scale(SPACING.md),
    paddingBottom: scale(SPACING.lg),
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingVertical: scale(SPACING.sm),
    paddingHorizontal: scale(SPACING.md),
    backgroundColor: '#F5F5F5',
    borderRadius: scale(RADIUS.full),
    marginTop: -scale(SPACING.md),
    marginBottom: scale(SPACING.md),
  },
  restoreButtonText: {
    fontSize: scaleFont(15),
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
    fontSize: scaleFont(15),
    color: '#888',
    textDecorationLine: 'underline',
  },
  legalDivider: {
    fontSize: scaleFont(15),
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
    paddingBottom: scale(SPACING.lg),
  },
  premiumBadgeTop: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.md),
  },
  managementTitle: {
    fontSize: scaleFont(14),
    color: '#666',
  },
  managementPlan: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: COLORS.black,
  },
  managementBottomSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: scale(SPACING.xl),
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.xl),
    borderRadius: scale(RADIUS.full),
    gap: scale(SPACING.xs),
  },
  manageButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#333',
  },
  partnerPremiumNote: {
    fontSize: scaleFont(14),
    color: '#888',
    textAlign: 'center',
    lineHeight: scaleFont(20),
    paddingHorizontal: scale(SPACING.lg),
  },
  partnerPremiumBannerText: {
    fontSize: scaleFont(13),
    color: '#D97706',
    textAlign: 'center',
    marginBottom: scale(SPACING.sm),
    fontWeight: '500',
  },
});
