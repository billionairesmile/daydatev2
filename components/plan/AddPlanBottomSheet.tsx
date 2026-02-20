import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Calendar, Ticket, X, Crown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SCREEN_WIDTH, SCREEN_HEIGHT, rs, fp } from '@/constants/design';
import { usePlanStore } from '@/stores/planStore';
import PremiumSubscriptionModal from '@/components/premium/PremiumSubscriptionModal';
import type { FeedPost } from '@/types';

const ACCENT = '#FF4B6E';

interface AddPlanBottomSheetProps {
  visible: boolean;
  post: FeedPost;
  onClose: () => void;
}

function formatDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function AddPlanBottomSheet({ visible, post, onClose }: AddPlanBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const addPlan = usePlanStore((s) => s.addPlan);
  const canAddPlan = usePlanStore((s) => s.canAddPlan);
  const [memo, setMemo] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      // Backdrop fades in, sheet slides up
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
      ]).start();
    }
  }, [visible]);

  const animateClose = useCallback((callback?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback?.();
    });
  }, []);

  const eventDate = formatDate(post.eventStartDate);
  const planLimit = canAddPlan();

  const handleAdd = useCallback(async () => {
    if (isAdding) return;

    // Check plan limit
    const { allowed } = canAddPlan();
    if (!allowed) {
      setShowPremiumModal(true);
      return;
    }

    setIsAdding(true);
    try {
      await addPlan(post, memo.trim() || undefined);
      setMemo('');
      animateClose(onClose);
    } finally {
      setIsAdding(false);
    }
  }, [addPlan, canAddPlan, post, memo, isAdding, onClose, animateClose]);

  const handleClose = useCallback(() => {
    setMemo('');
    animateClose(onClose);
  }, [onClose, animateClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          {/* Backdrop - fades in */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.backdrop,
              { opacity: backdropOpacity },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          {/* Sheet - slides up */}
          <Animated.View
            style={[
              styles.sheetWrapper,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardView}
            >
              <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, rs(20)) }]}>
                {/* Header */}
                <View style={styles.header}>
                  <Text style={styles.headerTitle}>📅 우리 스케줄에 추가할까요?</Text>
                  <Pressable onPress={handleClose} hitSlop={12}>
                    <X size={rs(20)} color="#999" strokeWidth={2} />
                  </Pressable>
                </View>

                {/* Event info card */}
                <View style={styles.eventCard}>
                  {post.images?.[0] ? (
                    <Image
                      source={{ uri: post.images[0] }}
                      style={styles.eventImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : null}
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={2}>{post.title}</Text>
                    {eventDate ? (
                      <View style={styles.infoRow}>
                        <Calendar size={rs(12)} color="#999" strokeWidth={2} />
                        <Text style={styles.infoText}>이벤트: {eventDate}</Text>
                      </View>
                    ) : null}
                    {post.locationName ? (
                      <View style={styles.infoRow}>
                        <MapPin size={rs(12)} color="#999" strokeWidth={2} />
                        <Text style={styles.infoText}>{post.locationName}</Text>
                      </View>
                    ) : null}
                    {post.price ? (
                      <Text style={styles.priceText}>{post.price}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Memo input */}
                <Text style={styles.memoLabel}>메모 (선택)</Text>
                <TextInput
                  style={styles.memoInput}
                  placeholder="예: VIP석으로 예매하자!"
                  placeholderTextColor="#bbb"
                  value={memo}
                  onChangeText={setMemo}
                  multiline
                  maxLength={200}
                />

                {/* Plan limit indicator for free users */}
                {planLimit.limit !== Infinity && (
                  <View style={styles.limitRow}>
                    <Text style={styles.limitText}>
                      {t('plans.monthlyLimit', { current: planLimit.currentCount, max: planLimit.limit })}
                    </Text>
                    {!planLimit.allowed && (
                      <View style={styles.limitBadge}>
                        <Crown size={rs(12)} color="#D97706" strokeWidth={2} />
                        <Text style={styles.limitBadgeText}>{t('plans.premiumRequired')}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Add button */}
                <Pressable
                  style={[styles.addButton, (isAdding || !planLimit.allowed) && styles.addButtonDisabled]}
                  onPress={handleAdd}
                  disabled={isAdding}
                >
                  <Text style={styles.addButtonText}>
                    {isAdding
                      ? t('plans.adding')
                      : !planLimit.allowed
                        ? t('plans.upgradeToPremium')
                        : t('plans.addToPlan')}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      {/* Premium Upgrade Modal */}
      <PremiumSubscriptionModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingTop: rs(20),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(16),
  },
  headerTitle: {
    fontSize: fp(18),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: rs(12),
    overflow: 'hidden',
    marginBottom: rs(16),
  },
  eventImage: {
    width: rs(80),
    aspectRatio: 3 / 4,
  },
  eventInfo: {
    flex: 1,
    padding: rs(10),
    gap: rs(4),
  },
  eventTitle: {
    fontSize: fp(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: rs(4),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
  },
  infoText: {
    fontSize: fp(12),
    color: '#888',
  },
  priceText: {
    fontSize: fp(13),
    fontWeight: '600',
    color: ACCENT,
    marginTop: rs(2),
  },
  memoLabel: {
    fontSize: fp(13),
    fontWeight: '600',
    color: '#666',
    marginBottom: rs(8),
  },
  memoInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: rs(12),
    padding: rs(12),
    fontSize: fp(14),
    color: '#333',
    minHeight: rs(60),
    textAlignVertical: 'top',
    marginBottom: rs(16),
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(12),
  },
  limitText: {
    fontSize: fp(12),
    color: '#999',
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    backgroundColor: '#FEF3C7',
    paddingHorizontal: rs(8),
    paddingVertical: rs(4),
    borderRadius: rs(12),
  },
  limitBadgeText: {
    fontSize: fp(11),
    fontWeight: '600',
    color: '#D97706',
  },
  addButton: {
    backgroundColor: ACCENT,
    borderRadius: rs(28),
    paddingVertical: rs(16),
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: fp(16),
    fontWeight: '700',
    color: '#fff',
  },
});
