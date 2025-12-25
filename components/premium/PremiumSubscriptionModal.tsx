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
  SafeAreaView,
  Image,
} from 'react-native';
import {
  Crown,
  Sparkles,
  Bookmark,
  Ban,
  ChevronRight,
  X,
  Image as ImageIcon,
} from 'lucide-react-native';
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
  const {
    isPremium,
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

    let success = false;
    if (selectedPlan === 'monthly') {
      success = await purchaseMonthly();
    } else {
      success = await purchaseAnnual();
    }
    if (success) {
      onClose();
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

  // Premium benefits data (4 items for 2x2 grid)
  const premiumBenefits = [
    {
      title: t('premium.benefits.noAdsPremium'),
      subtitle: t('premium.benefits.noAdsPremiumDesc'),
      icon: Ban,
    },
    {
      title: t('premium.benefits.missionCompletePremium'),
      subtitle: t('premium.benefits.missionCompletePremiumDesc'),
      icon: Sparkles,
    },
    {
      title: t('premium.benefits.missionKeepPremium'),
      subtitle: t('premium.benefits.missionKeepPremiumDesc'),
      icon: Bookmark,
    },
    {
      title: t('premium.benefits.photoStoragePremium'),
      subtitle: t('premium.benefits.photoStoragePremiumDesc'),
      icon: ImageIcon,
    },
  ];

  // If already premium, show management view
  if (isPremium) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" />

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/daydate-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X color={COLORS.black} size={24} />
            </Pressable>
          </View>

          <View style={styles.managementContent}>
            <View style={styles.premiumBadgeLarge}>
              <Crown color="#FFD700" size={48} />
            </View>
            <Text style={styles.managementTitle}>{t('premium.currentPlan')}</Text>
            <Text style={styles.managementPlan}>
              {plan === 'monthly' ? t('premium.monthlyPlan') : t('premium.annualPlan')}
            </Text>

            <Pressable
              style={styles.manageButton}
              onPress={openSubscriptionManagement}
            >
              <Text style={styles.manageButtonText}>{t('premium.manageSubscription')}</Text>
              <ChevronRight color="#333" size={18} />
            </Pressable>
          </View>
        </SafeAreaView>
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
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/daydate-logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
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

          {/* Premium Benefits - 2x2 Grid */}
          <View style={styles.benefitsSection}>
            <Text style={styles.benefitsSectionTitle}>{t('premium.benefitsTitle')}</Text>
            <View style={styles.benefitsGrid}>
              {premiumBenefits.map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <View style={styles.benefitIconWrapper}>
                    <benefit.icon color="#3B82F6" size={24} />
                  </View>
                  <View style={styles.benefitTextWrapper}>
                    <Text style={styles.benefitTitle}>{benefit.title}</Text>
                    {benefit.subtitle && (
                      <Text style={styles.benefitSubtitle}>{benefit.subtitle}</Text>
                    )}
                  </View>
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

          {/* Payment Notice */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.paymentNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice2')}</Text>
            <Text style={styles.noticeText}>• {t('premium.paymentNotice3')}</Text>
          </View>

          {/* Refund Notice */}
          <View style={styles.noticeSection}>
            <Text style={styles.noticeSectionTitle}>{t('premium.refundNoticeTitle')}</Text>
            <Text style={styles.noticeText}>• {t('premium.refundNotice1')}</Text>
            <Text style={styles.noticeText}>• {t('premium.refundNotice2')}</Text>
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
          <Pressable
            style={[styles.ctaButton, (isLoading || !selectedPlan) && styles.ctaButtonDisabled]}
            onPress={handlePurchase}
            disabled={isLoading || !selectedPlan}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.ctaText}>
                {selectedPlan === 'annual'
                  ? t('premium.subscribeAnnualCTA')
                  : selectedPlan === 'monthly'
                  ? t('premium.subscribeMonthlyCTA')
                  : t('premium.subscribe')}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
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
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'left',
  },
  // Benefits Section
  benefitsSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  benefitsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  benefitItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    gap: SPACING.xs,
  },
  benefitIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  benefitTextWrapper: {
    alignItems: 'center',
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
  },
  benefitSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
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
    marginBottom: 8,
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
  managementContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  premiumBadgeLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF9E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  managementTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: SPACING.sm,
  },
  managementPlan: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: SPACING.xxxl,
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
});
