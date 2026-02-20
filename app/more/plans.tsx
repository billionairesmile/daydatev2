import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle, interpolate } from 'react-native-reanimated';
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Ticket,
  Trash2,
  ExternalLink,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';

import { COLORS, SPACING, rs, fp } from '@/constants/design';
import { usePlanStore } from '@/stores/planStore';
import type { Plan } from '@/types';

const ACCENT = '#FF4B6E';

type TabKey = 'interested' | 'booked';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function isExpired(eventDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate + 'T00:00:00');
  return event < today;
}

function PlanCard({
  plan,
  expired,
  onPress,
  onDelete,
  onBooking,
}: {
  plan: Plan;
  expired?: boolean;
  onPress: () => void;
  onDelete?: () => void;
  onBooking?: () => void;
}) {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const handleDeletePress = () => {
    Alert.alert(
      t('plans.deleteConfirmTitle', { defaultValue: '삭제하시겠습니까?' }),
      t('plans.deleteConfirmMessage', { defaultValue: '이 스케줄을 삭제하면 복구할 수 없습니다.' }),
      [
        {
          text: t('common.cancel', { defaultValue: '취소' }),
          style: 'cancel',
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: t('common.delete', { defaultValue: '삭제' }),
          style: 'destructive',
          onPress: () => onDelete?.(),
        },
      ],
    );
  };

  const renderRightActions = (_progress: SharedValue<number>, drag: SharedValue<number>) => {
    const animStyle = useAnimatedStyle(() => {
      const translateX = interpolate(drag.value, [-80, 0], [0, 80], 'clamp');
      return { transform: [{ translateX }] };
    });

    return (
      <Animated.View style={[styles.swipeDeleteContainer, animStyle]}>
        <Pressable style={styles.swipeDeleteButton} onPress={handleDeletePress}>
          <Trash2 size={rs(20)} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeDeleteText}>{t('common.delete', { defaultValue: '삭제' })}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const cardContent = (
    <Pressable
      style={[styles.card, expired && styles.cardExpired]}
      onPress={onPress}
    >
      {plan.imageUrl ? (
        <Image
          source={{ uri: plan.imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Calendar size={rs(24)} color="#ccc" strokeWidth={1.5} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, expired && styles.cardTextExpired]}
          numberOfLines={2}
        >
          {plan.title}
        </Text>

        <View style={styles.cardMeta}>
          <Calendar size={rs(12)} color={expired ? '#bbb' : '#888'} strokeWidth={2} />
          <Text style={[styles.cardMetaText, expired && styles.cardTextExpired]}>
            {formatDate(plan.eventDate)}
          </Text>
        </View>

        {plan.locationName ? (
          <View style={styles.cardMeta}>
            <MapPin size={rs(12)} color={expired ? '#bbb' : '#888'} strokeWidth={2} />
            <Text
              style={[styles.cardMetaText, expired && styles.cardTextExpired]}
              numberOfLines={1}
            >
              {plan.locationName}
            </Text>
          </View>
        ) : null}

        {plan.price ? (
          <Text style={[styles.cardPrice, expired && styles.cardTextExpired]}>
            {plan.price}
          </Text>
        ) : null}

        {/* Action row */}
        <View style={styles.cardActions}>
          {!expired && plan.status === 'interested' && (
            <Pressable style={styles.actionButton} onPress={onBooking} hitSlop={8}>
              <Ticket size={rs(13)} color={ACCENT} strokeWidth={2} />
              <Text style={styles.actionButtonText}>{t('plans.bookNow')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );

  if (plan.status === 'interested' && onDelete) {
    return (
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        {cardContent}
      </ReanimatedSwipeable>
    );
  }

  return cardContent;
}

export default function PlansScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { plans, isLoading, deletePlan, updateStatus } = usePlanStore();
  const [activeTab, setActiveTab] = useState<TabKey>('interested');

  // Booking confirmation flow
  const appState = useRef(AppState.currentState);
  const clickedBookingPlanRef = useRef<Plan | null>(null);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [bookingPlan, setBookingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active' &&
          clickedBookingPlanRef.current
        ) {
          setBookingPlan(clickedBookingPlanRef.current);
          clickedBookingPlanRef.current = null;
          setShowBookingConfirm(true);
        }
        appState.current = nextState;
      }
    );
    return () => sub.remove();
  }, []);

  const handleConfirmBooked = useCallback(async () => {
    if (!bookingPlan) return;
    setShowBookingConfirm(false);
    await updateStatus(bookingPlan.id, 'booked');
    setBookingPlan(null);
  }, [bookingPlan, updateStatus]);

  // Auto-complete booked plans whose event date has passed
  useEffect(() => {
    const expiredBooked = plans.filter(
      (p) => p.status === 'booked' && isExpired(p.eventDate)
    );
    expiredBooked.forEach((p) => {
      updateStatus(p.id, 'completed');
    });
  }, [plans, updateStatus]);

  // Split plans into categories (deduplicate by feedPostId — booked wins over interested)
  const { activePlans, expiredPlans, activeBookedPlans, expiredBookedPlans } = useMemo(() => {
    // Deduplicate: if same feedPostId exists as both interested and booked, keep only booked
    const bookedFeedPostIds = new Set(
      plans.filter((p) => p.status === 'booked' && p.feedPostId).map((p) => p.feedPostId)
    );
    const interested = plans.filter(
      (p) => p.status === 'interested' && !(p.feedPostId && bookedFeedPostIds.has(p.feedPostId))
    );

    const active = interested
      .filter((p) => !isExpired(p.eventDate))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const expired = interested
      .filter((p) => isExpired(p.eventDate))
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
      .slice(0, 10);

    const booked = plans.filter((p) => p.status === 'booked' || p.status === 'completed');
    const activeBooked = booked
      .filter((p) => !isExpired(p.eventDate) && p.status !== 'completed')
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const expiredBooked = booked
      .filter((p) => p.status === 'completed' || isExpired(p.eventDate))
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

    return { activePlans: active, expiredPlans: expired, activeBookedPlans: activeBooked, expiredBookedPlans: expiredBooked };
  }, [plans]);

  const interestedCount = activePlans.length + expiredPlans.length;
  const bookedCount = activeBookedPlans.length + expiredBookedPlans.length;

  const handlePlanPress = useCallback(
    (plan: Plan) => {
      if (Platform.OS === 'android') {
        requestAnimationFrame(() => {
          router.push({ pathname: '/more/plan-detail', params: { id: plan.id } } as any);
        });
      } else {
        router.push({ pathname: '/more/plan-detail', params: { id: plan.id } } as any);
      }
    },
    [router]
  );

  const handleDelete = useCallback(
    (planId: string) => {
      deletePlan(planId);
    },
    [deletePlan]
  );

  const handleBooking = useCallback((plan: Plan) => {
    const link = plan.affiliateLink || plan.externalLink;
    if (link) {
      clickedBookingPlanRef.current = plan;
      Linking.openURL(link);
    }
  }, []);

  const renderInterestedTab = () => (
    <>
      {activePlans.length > 0 ? (
        activePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onPress={() => handlePlanPress(plan)}
            onDelete={() => handleDelete(plan.id)}
            onBooking={() => handleBooking(plan)}
          />
        ))
      ) : !expiredPlans.length ? (
        <View style={styles.emptyState}>
          <Calendar size={rs(40)} color="#ccc" strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('plans.emptyInterested')}</Text>
        </View>
      ) : null}

      {expiredPlans.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('plans.expiredSection')}</Text>
          {expiredPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expired
              onPress={() => handlePlanPress(plan)}
              onDelete={() => handleDelete(plan.id)}
            />
          ))}
        </>
      )}
    </>
  );

  const renderBookedTab = () => (
    <>
      {activeBookedPlans.length > 0 ? (
        activeBookedPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onPress={() => handlePlanPress(plan)}
            onBooking={() => handleBooking(plan)}
          />
        ))
      ) : !expiredBookedPlans.length ? (
        <View style={styles.emptyState}>
          <Ticket size={rs(40)} color="#ccc" strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('plans.emptyBooked')}</Text>
        </View>
      ) : null}

      {expiredBookedPlans.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('plans.expiredSection')}</Text>
          {expiredBookedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expired
              onPress={() => handlePlanPress(plan)}
            />
          ))}
        </>
      )}
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
        >
          <ChevronLeft size={rs(24)} color="#1a1a1a" strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('plans.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'interested' && styles.tabActive]}
          onPress={() => setActiveTab('interested')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'interested' && styles.tabTextActive,
            ]}
          >
            {t('plans.tabs.interested')} ({interestedCount})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'booked' && styles.tabActive]}
          onPress={() => setActiveTab('booked')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'booked' && styles.tabTextActive,
            ]}
          >
            {t('plans.tabs.booked')} ({bookedCount})
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={ACCENT} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS === 'android' && { paddingBottom: rs(100) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'interested'
            ? renderInterestedTab()
            : renderBookedTab()}
        </ScrollView>
      )}

      {/* Booking Confirmation Modal */}
      <Modal
        visible={showBookingConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBookingConfirm(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>
              {t('planDetail.bookingConfirm.title')}
            </Text>
            <View style={modalStyles.buttonRow}>
              <Pressable
                style={modalStyles.confirmButton}
                onPress={handleConfirmBooked}
              >
                <Text style={modalStyles.confirmText}>
                  {t('planDetail.bookingConfirm.yes')}
                </Text>
              </Pressable>
              <Pressable
                style={modalStyles.dismissButton}
                onPress={() => {
                  setShowBookingConfirm(false);
                  setBookingPlan(null);
                }}
              >
                <Text style={modalStyles.dismissText}>
                  {t('planDetail.bookingConfirm.notYet')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

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
  title: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  buttonRow: {
    gap: rs(10),
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
  dismissButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  dismissText: {
    fontSize: fp(15),
    fontWeight: '600',
    color: '#666',
  },
});

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
  backButton: {
    width: rs(32),
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSpacer: {
    width: rs(32),
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(SPACING.md),
    marginTop: rs(12),
    gap: rs(8),
  },
  tab: {
    flex: 1,
    paddingVertical: rs(10),
    borderRadius: rs(20),
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: ACCENT,
  },
  tabText: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: rs(SPACING.lg),
    paddingBottom: rs(40),
    gap: rs(12),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: fp(13),
    fontWeight: '600',
    color: '#999',
    marginTop: rs(16),
    marginBottom: rs(4),
  },
  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: rs(14),
    overflow: 'hidden',
    minHeight: rs(110),
  },
  cardExpired: {
    opacity: 0.5,
  },
  cardImage: {
    width: rs(90),
    minHeight: rs(110),
    alignSelf: 'stretch',
  },
  cardImagePlaceholder: {
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    padding: rs(10),
    justifyContent: 'center',
    gap: rs(3),
  },
  cardTitle: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: rs(2),
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
  },
  cardMetaText: {
    fontSize: fp(12),
    color: '#888',
  },
  cardPrice: {
    fontSize: fp(13),
    fontWeight: '600',
    color: ACCENT,
    marginTop: rs(2),
  },
  cardTextExpired: {
    color: '#bbb',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: rs(4),
    gap: rs(8),
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    backgroundColor: '#fff',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: ACCENT,
  },
  actionButtonText: {
    fontSize: fp(12),
    fontWeight: '600',
    color: ACCENT,
  },
  swipeDeleteContainer: {
    width: rs(80),
    borderTopRightRadius: rs(14),
    borderBottomRightRadius: rs(14),
    overflow: 'hidden',
  },
  swipeDeleteButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rs(4),
    paddingHorizontal: rs(8),
  },
  swipeDeleteText: {
    fontSize: fp(11),
    fontWeight: '600',
    color: '#fff',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(60),
    gap: rs(12),
  },
  emptyText: {
    fontSize: fp(14),
    color: '#999',
    textAlign: 'center',
  },
});
