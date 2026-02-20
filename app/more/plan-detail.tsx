import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Ticket,
  Trash2,
  Navigation,
  ExternalLink,
  Pencil,
  X,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, rs, fp } from '@/constants/design';
import { usePlanStore } from '@/stores/planStore';
import { getUserCountryCode } from '@/lib/locationUtils';

const ACCENT = '#FF4B6E';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}.${month}.${day}`;
}

function ProgressBar({ status }: { status: string }) {
  const { t } = useTranslation();
  const steps = [
    { key: 'interested', label: t('planDetail.status.interested') },
    { key: 'booked', label: t('planDetail.status.booked') },
    { key: 'completed', label: t('planDetail.status.completed') },
  ];

  const activeIndex =
    status === 'completed' ? 2 : status === 'booked' ? 1 : 0;

  return (
    <View style={progressStyles.container}>
      {steps.map((step, index) => {
        const isActive = index <= activeIndex;
        const isLast = index === steps.length - 1;
        return (
          <React.Fragment key={step.key}>
            <View style={progressStyles.step}>
              <View
                style={[
                  progressStyles.dot,
                  isActive && progressStyles.dotActive,
                  index === activeIndex && progressStyles.dotCurrent,
                ]}
              />
              <Text
                style={[
                  progressStyles.label,
                  isActive && progressStyles.labelActive,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {!isLast && (
              <View
                style={[
                  progressStyles.line,
                  index < activeIndex && progressStyles.lineActive,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function PlanDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    plans,
    updateStatus,
    deletePlan,
    updateMemo,
  } = usePlanStore();

  const plan = plans.find((p) => p.id === id);

  // Booking confirmation flow
  const openedForBookingRef = useRef(false);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [showMemoEdit, setShowMemoEdit] = useState(false);
  const [editMemo, setEditMemo] = useState(plan?.memo || '');

  // Show booking confirmation when returning from web-viewer after booking CTA
  useFocusEffect(
    useCallback(() => {
      if (openedForBookingRef.current) {
        openedForBookingRef.current = false;
        setTimeout(() => setShowBookingConfirm(true), 300);
      }
    }, [])
  );

  const handleBookingPress = useCallback(() => {
    if (!plan) return;
    const link = plan.affiliateLink || plan.externalLink;
    if (link) {
      openedForBookingRef.current = true;
      router.push({
        pathname: '/more/web-viewer',
        params: { url: link, title: plan.title },
      });
    }
  }, [plan, router]);

  const handleOpenDetails = useCallback(() => {
    if (!plan) return;
    const link = plan.affiliateLink || plan.externalLink;
    if (link) {
      router.push({
        pathname: '/more/web-viewer',
        params: { url: link, title: plan.title },
      });
    }
  }, [plan, router]);

  const handleConfirmBooked = useCallback(async () => {
    if (!plan) return;
    setShowBookingConfirm(false);
    await updateStatus(plan.id, 'booked');
  }, [plan, updateStatus]);

  const cleanLocationQuery = (location: string): string => {
    // Remove parenthetical info like (서울특별시), (대극장) etc., then remove stray parens
    return location.replace(/\s*\([^)]*\)/g, '').replace(/[()]/g, '').trim();
  };

  const handleNavigateToLocation = useCallback(async () => {
    if (!plan) return;
    const rawQuery = plan.locationName || plan.title;
    const query = cleanLocationQuery(rawQuery);
    const encodedQuery = encodeURIComponent(query);

    try {
      const countryCode = await getUserCountryCode();
      let mapUrl: string;
      if (countryCode === 'KR') {
        mapUrl = `https://map.naver.com/v5/search/${encodedQuery}`;
      } else {
        if (plan.latitude && plan.longitude) {
          mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${plan.latitude},${plan.longitude}`;
        } else {
          mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
        }
      }
      router.push({
        pathname: '/more/web-viewer',
        params: { url: mapUrl, title: t('planDetail.navigateCta') },
      });
    } catch {
      // Fallback to web
      router.push({
        pathname: '/more/web-viewer',
        params: { url: `https://map.naver.com/v5/search/${encodedQuery}`, title: t('planDetail.navigateCta') },
      });
    }
  }, [plan, router, t]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) return;
    Alert.alert(
      t('planDetail.deleteConfirm.title'),
      t('planDetail.deleteConfirm.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deletePlan(plan.id);
            router.back();
          },
        },
      ]
    );
  }, [plan, deletePlan, router, t]);

  const handleSaveMemo = useCallback(async () => {
    if (!plan) return;
    await updateMemo(plan.id, editMemo.trim());
    setShowMemoEdit(false);
  }, [plan, editMemo, updateMemo]);

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeft size={rs(24)} color="#1a1a1a" strokeWidth={2} />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('planDetail.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isInterested = plan.status === 'interested';
  const isBooked = plan.status === 'booked';
  const isCancelled = plan.status === 'cancelled';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={rs(24)} color="#1a1a1a" strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('planDetail.title')}</Text>
        <View style={{ width: rs(24) }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Image */}
        {plan.imageUrl ? (
          <Image
            source={{ uri: plan.imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Calendar size={rs(40)} color="#ccc" strokeWidth={1.5} />
          </View>
        )}

        {/* Event Info */}
        <View style={styles.infoSection}>
          <Text style={styles.eventTitle}>{plan.title}</Text>

          {plan.locationName ? (
            <View style={styles.infoRow}>
              <MapPin size={rs(14)} color="#888" strokeWidth={2} />
              <Text style={styles.infoText}>{plan.locationName}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Calendar size={rs(14)} color="#888" strokeWidth={2} />
            <Text style={styles.infoText}>{formatDate(plan.eventDate)}</Text>
          </View>

          {plan.price ? (
            <Text style={styles.priceText}>{plan.price}</Text>
          ) : null}
        </View>

        {/* Progress Bar */}
        {!isCancelled && <ProgressBar status={plan.status} />}

        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>{t('planDetail.cancelled')}</Text>
            {plan.cancelReason ? (
              <Text style={styles.cancelReasonText}>{plan.cancelReason}</Text>
            ) : null}
          </View>
        )}

        {/* Memo */}
        {plan.memo ? (
          <View style={styles.memoSection}>
            <Text style={styles.memoLabel}>{t('planDetail.memo')}</Text>
            <Text style={styles.memoText}>{plan.memo}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        {!isCancelled && (
          <View style={styles.actions}>
            {/* Booking CTA */}
            {isInterested && (plan.affiliateLink || plan.externalLink) && (
              <Pressable style={styles.primaryButton} onPress={handleBookingPress}>
                <Ticket size={rs(18)} color="#fff" strokeWidth={2} />
                <Text style={styles.primaryButtonText}>
                  {t('planDetail.bookingCta')}
                </Text>
              </Pressable>
            )}

            {/* Get details - view event details on external site */}
            {isBooked && (plan.affiliateLink || plan.externalLink) && (
              <Pressable style={styles.detailsButton} onPress={handleOpenDetails}>
                <ExternalLink size={rs(16)} color="#fff" strokeWidth={2} />
                <Text style={styles.detailsButtonText}>
                  {t('planDetail.getDetails')}
                </Text>
              </Pressable>
            )}

            {/* Navigate to location */}
            {isBooked && (plan.locationName || (plan.latitude && plan.longitude)) && (
              <Pressable
                style={styles.primaryButton}
                onPress={handleNavigateToLocation}
              >
                <Navigation size={rs(18)} color="#fff" strokeWidth={2} />
                <Text style={styles.primaryButtonText}>
                  {t('planDetail.navigateCta')}
                </Text>
              </Pressable>
            )}

            {/* Edit memo */}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setEditMemo(plan.memo || '');
                setShowMemoEdit(true);
              }}
            >
              <Pencil size={rs(16)} color="#555" strokeWidth={2} />
              <Text style={styles.secondaryButtonText}>
                {t('planDetail.editMemo')}
              </Text>
            </Pressable>

            {/* Delete plan (for both booked and interested) */}
            {(isBooked || isInterested) && (
              <Pressable
                style={styles.dangerButton}
                onPress={handleDeletePlan}
              >
                <Trash2 size={rs(16)} color="#e55" strokeWidth={2} />
                <Text style={styles.dangerButtonText}>
                  {t('planDetail.deletePlan')}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Booking Confirmation Modal */}
      <Modal
        visible={showBookingConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBookingConfirm(false)}
      >
        <Pressable style={bookingStyles.overlay} onPress={() => setShowBookingConfirm(false)}>
          <Pressable style={bookingStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={bookingStyles.title}>
              {t('planDetail.bookingConfirm.title')}
            </Text>
            <View style={bookingStyles.buttons}>
              <Pressable
                style={bookingStyles.btnPrimary}
                onPress={handleConfirmBooked}
              >
                <Text style={bookingStyles.btnPrimaryText}>
                  {t('planDetail.bookingConfirm.yes')}
                </Text>
              </Pressable>
              <Pressable
                style={bookingStyles.btnSecondary}
                onPress={() => setShowBookingConfirm(false)}
              >
                <Text style={bookingStyles.btnSecondaryText}>
                  {t('planDetail.bookingConfirm.notYet')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Memo Edit Modal */}
      <Modal
        visible={showMemoEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMemoEdit(false)}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={modalStyles.sheet}>
            <View style={modalStyles.sheetHeader}>
              <Text style={modalStyles.title}>
                {t('planDetail.editMemo')}
              </Text>
              <Pressable onPress={() => setShowMemoEdit(false)} hitSlop={12}>
                <X size={rs(20)} color="#999" strokeWidth={2} />
              </Pressable>
            </View>
            <TextInput
              style={modalStyles.memoInput}
              value={editMemo}
              onChangeText={setEditMemo}
              placeholder={t('planDetail.memoPlaceholder')}
              placeholderTextColor="#bbb"
              multiline
              maxLength={200}
            />
            <Pressable style={modalStyles.confirmButton} onPress={handleSaveMemo}>
              <Text style={modalStyles.confirmText}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(SPACING.lg),
    paddingVertical: rs(SPACING.md),
  },
  headerTitle: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: rs(40),
  },
  heroImage: {
    width: '100%',
    height: rs(220),
  },
  heroPlaceholder: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    padding: rs(SPACING.lg),
    gap: rs(6),
  },
  eventTitle: {
    fontSize: fp(20),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: rs(4),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
  },
  infoText: {
    fontSize: fp(14),
    color: '#666',
  },
  priceText: {
    fontSize: fp(16),
    fontWeight: '700',
    color: ACCENT,
    marginTop: rs(4),
  },
  cancelledBanner: {
    marginHorizontal: rs(SPACING.lg),
    padding: rs(12),
    backgroundColor: '#fff2f2',
    borderRadius: rs(12),
    marginBottom: rs(16),
  },
  cancelledText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#e55',
  },
  cancelReasonText: {
    fontSize: fp(13),
    color: '#999',
    marginTop: rs(4),
  },
  memoSection: {
    marginHorizontal: rs(SPACING.lg),
    padding: rs(12),
    backgroundColor: '#f8f8f8',
    borderRadius: rs(12),
    marginBottom: rs(16),
  },
  memoLabel: {
    fontSize: fp(12),
    fontWeight: '600',
    color: '#999',
    marginBottom: rs(4),
  },
  memoText: {
    fontSize: fp(14),
    color: '#333',
  },
  actions: {
    paddingHorizontal: rs(SPACING.lg),
    gap: rs(10),
  },
  primaryButton: {
    backgroundColor: ACCENT,
    borderRadius: rs(14),
    paddingVertical: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
  },
  primaryButtonText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
  },
  secondaryButtonText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#555',
  },
  detailsButton: {
    backgroundColor: '#3478F6',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
  },
  detailsButtonText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: '#fff',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    borderWidth: 1,
    borderColor: '#e55',
  },
  dangerButtonText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#e55',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fp(14),
    color: '#999',
  },
});

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(SPACING.xl),
    paddingVertical: rs(SPACING.lg),
    marginBottom: rs(8),
  },
  step: {
    alignItems: 'center',
    gap: rs(4),
  },
  dot: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: '#ddd',
  },
  dotActive: {
    backgroundColor: ACCENT,
  },
  dotCurrent: {
    width: rs(16),
    height: rs(16),
    borderRadius: rs(8),
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: fp(11),
    color: '#bbb',
    fontWeight: '500',
  },
  labelActive: {
    color: ACCENT,
    fontWeight: '600',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: rs(4),
    marginBottom: rs(16),
  },
  lineActive: {
    backgroundColor: ACCENT,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rs(SPACING.xl),
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: rs(20),
    padding: rs(24),
    width: '100%',
    maxWidth: rs(360),
    gap: rs(12),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  confirmButton: {
    backgroundColor: ACCENT,
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  confirmText: {
    fontSize: fp(15),
    fontWeight: '700',
    color: '#fff',
  },
  memoInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: rs(12),
    padding: rs(12),
    fontSize: fp(14),
    color: '#333',
    minHeight: rs(80),
    textAlignVertical: 'top',
  },
});

const bookingStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rs(32),
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: rs(20),
    padding: rs(24),
    width: '100%',
    maxWidth: rs(360),
    gap: rs(12),
  },
  title: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  buttons: {
    gap: rs(10),
  },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: fp(15),
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    backgroundColor: '#f5f5f5',
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: fp(15),
    fontWeight: '600',
    color: '#666',
  },
});
