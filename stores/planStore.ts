import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, supabase } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/pushNotifications';
import { useAuthStore } from './authStore';
import { planFromRow } from '@/types';
import type { Plan, PlanStatus, FeedPost } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schedulePlanNotifications } from '@/utils/planNotifications';
import { useSubscriptionStore, SUBSCRIPTION_LIMITS } from './subscriptionStore';

interface PlanState {
  plans: Plan[];
  isLoading: boolean;
  isInitialized: boolean;
  coupleId: string | null;
  userId: string | null;
}

interface PlanActions {
  initializePlanSync: (coupleId: string, userId: string) => Promise<void>;
  cleanup: () => void;
  loadPlans: () => Promise<void>;
  addPlan: (feedPost: FeedPost, memo?: string) => Promise<Plan | null>;
  updateStatus: (planId: string, newStatus: PlanStatus, extra?: Record<string, unknown>) => Promise<void>;
  cancelPlan: (planId: string, reason?: string) => Promise<void>;
  revertToInterested: (planId: string) => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
  updateMemo: (planId: string, memo: string) => Promise<void>;
  isAlreadyAdded: (feedPostId: string) => boolean;
  getPlansByStatus: (status: PlanStatus) => Plan[];
  canAddPlan: () => { allowed: boolean; currentCount: number; limit: number };
}

let planChannel: ReturnType<SupabaseClient['channel']> | null = null;

const initialState: PlanState = {
  plans: [],
  isLoading: false,
  isInitialized: false,
  coupleId: null,
  userId: null,
};

export const usePlanStore = create<PlanState & PlanActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      initializePlanSync: async (coupleId: string, userId: string) => {
        const state = get();
        if (state.isInitialized && state.coupleId === coupleId) return;

        set({ coupleId, userId, isInitialized: true });

        // Load plans
        await get().loadPlans();

        // Set up real-time subscription
        if (supabase && planChannel === null) {
          planChannel = supabase
            .channel(`plans:${coupleId}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'plans',
                filter: `couple_id=eq.${coupleId}`,
              },
              (payload) => {
                const { eventType } = payload;
                if (eventType === 'INSERT') {
                  const newPlan = planFromRow(payload.new as Record<string, unknown>);
                  set((s) => {
                    if (s.plans.some((p) => p.id === newPlan.id)) return s;
                    return { plans: [...s.plans, newPlan] };
                  });
                } else if (eventType === 'UPDATE') {
                  const updated = planFromRow(payload.new as Record<string, unknown>);
                  set((s) => ({
                    plans: s.plans.map((p) => (p.id === updated.id ? updated : p)),
                  }));
                } else if (eventType === 'DELETE') {
                  const deletedId = (payload.old as Record<string, unknown>).id as string;
                  set((s) => ({ plans: s.plans.filter((p) => p.id !== deletedId) }));
                }
              }
            )
            .subscribe();
        }
      },

      cleanup: () => {
        if (planChannel && supabase) {
          supabase.removeChannel(planChannel);
          planChannel = null;
        }
        set(initialState);
      },

      loadPlans: async () => {
        const { coupleId } = get();
        if (!coupleId) return;

        set({ isLoading: true });
        try {
          const { data, error } = await db.plans.getByCoupleId(coupleId);
          if (!error && data) {
            set({ plans: data.map((row: Record<string, unknown>) => planFromRow(row)) });
          }
        } catch (e) {
          console.warn('[planStore] Failed to load plans:', e);
        } finally {
          set({ isLoading: false });
        }
      },

      addPlan: async (feedPost: FeedPost, memo?: string) => {
        const { coupleId, userId } = get();
        if (!coupleId || !userId) return null;

        // Prevent duplicate plans for the same feed post
        if (get().isAlreadyAdded(feedPost.id)) return null;

        try {
          const { data, error } = await db.plans.add({
            couple_id: coupleId,
            added_by: userId,
            feed_post_id: feedPost.id,
            title: feedPost.title,
            description: feedPost.caption,
            image_url: feedPost.images?.[0],
            location_name: feedPost.locationName,
            latitude: feedPost.latitude,
            longitude: feedPost.longitude,
            event_date: feedPost.eventStartDate || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
            external_link: feedPost.externalLink,
            affiliate_link: feedPost.affiliateLink,
            price: feedPost.price,
            memo,
          });

          if (error || !data) {
            console.warn('[planStore] Failed to add plan:', error);
            return null;
          }

          const plan = planFromRow(data as Record<string, unknown>);

          // Add to local state immediately
          set((s) => {
            // Avoid duplicate if real-time subscription already added it
            if (s.plans.some((p) => p.id === plan.id)) return s;
            return { plans: [plan, ...s.plans] };
          });

          // Schedule notifications
          await schedulePlanNotifications(plan);

          // Notify partner
          const authState = useAuthStore.getState();
          const partnerId = authState.partner?.id;
          if (partnerId) {
            sendPushNotification({
              targetUserId: partnerId,
              type: 'new_plan',
              title: '새로운 스케줄이 추가됐어요! 📅',
              body: `${feedPost.title} - 같이 갈까?`,
              data: { type: 'new_plan', plan_id: plan.id },
            });
          }

          return plan;
        } catch (e) {
          console.warn('[planStore] addPlan error:', e);
          return null;
        }
      },

      updateStatus: async (planId: string, newStatus: PlanStatus, extra?: Record<string, unknown>) => {
        const { coupleId, userId } = get();
        if (!coupleId || !userId) return;

        try {
          const updateData: Record<string, unknown> = { ...extra };
          if (newStatus === 'cancelled') {
            updateData.cancelled_at = new Date().toISOString();
            updateData.cancelled_by = userId;
          }

          await db.plans.updateStatus(planId, newStatus, updateData);

          // Handle notifications based on status change
          if (newStatus === 'booked') {
            // Remove affiliate links from pending notifications
            await db.planNotifications.removeAffiliateLinks(planId);
            // Cancel booking nudge notifications
            await db.planNotifications.cancelByTypes(planId, ['booking_nudge', 'ticket_open']);

            // Notify partner
            const plan = get().plans.find((p) => p.id === planId);
            const partnerId = useAuthStore.getState().partner?.id;
            if (partnerId && plan) {
              sendPushNotification({
                targetUserId: partnerId,
                type: 'plan_booked',
                title: '예매 완료! ✅',
                body: `${plan.title} 예매가 확정됐어요!`,
                data: { type: 'plan_booked', plan_id: planId },
              });
            }
          }

          if (newStatus === 'cancelled') {
            await db.planNotifications.cancelAllForPlan(planId);

            const plan = get().plans.find((p) => p.id === planId);
            const partnerId = useAuthStore.getState().partner?.id;
            if (partnerId && plan) {
              sendPushNotification({
                targetUserId: partnerId,
                type: 'plan_cancelled',
                title: '스케줄이 취소됐어요',
                body: `${plan.title}이 취소되었어요`,
                data: { type: 'plan_cancelled', plan_id: planId },
              });
            }
          }

          // Optimistic update
          set((s) => ({
            plans: s.plans.map((p) =>
              p.id === planId ? { ...p, status: newStatus, ...updateData } as Plan : p
            ),
          }));
        } catch (e) {
          console.warn('[planStore] updateStatus error:', e);
        }
      },

      cancelPlan: async (planId: string, reason?: string) => {
        await get().updateStatus(planId, 'cancelled', {
          cancel_reason: reason,
        });
      },

      revertToInterested: async (planId: string) => {
        try {
          await db.plans.updateStatus(planId, 'interested');
          // Restore cancelled notifications
          await db.planNotifications.restoreForPlan(planId);
          // Add new booking nudge
          const plan = get().plans.find((p) => p.id === planId);
          if (plan) {
            const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
            await db.planNotifications.createBatch([{
              plan_id: planId,
              type: 'booking_nudge',
              scheduled_at: twoHoursLater,
              include_affiliate_link: true,
              message_title: '🎟 다시 예매할까요?',
              message_body: `${plan.title} 아직 자리 있을 때 예매하세요!`,
            }]);
          }

          set((s) => ({
            plans: s.plans.map((p) =>
              p.id === planId ? { ...p, status: 'interested' as PlanStatus } : p
            ),
          }));
        } catch (e) {
          console.warn('[planStore] revertToInterested error:', e);
        }
      },

      deletePlan: async (planId: string) => {
        try {
          await db.planNotifications.cancelAllForPlan(planId);
          await db.plans.delete(planId);
          set((s) => ({ plans: s.plans.filter((p) => p.id !== planId) }));
        } catch (e) {
          console.warn('[planStore] deletePlan error:', e);
        }
      },

      updateMemo: async (planId: string, memo: string) => {
        try {
          await db.plans.update(planId, { memo });
          set((s) => ({
            plans: s.plans.map((p) => (p.id === planId ? { ...p, memo } : p)),
          }));
        } catch (e) {
          console.warn('[planStore] updateMemo error:', e);
        }
      },

      isAlreadyAdded: (feedPostId: string) => {
        return get().plans.some(
          (p) => p.feedPostId === feedPostId && p.status !== 'cancelled'
        );
      },

      getPlansByStatus: (status: PlanStatus) => {
        return get().plans.filter((p) => p.status === status);
      },

      canAddPlan: () => {
        const { isPremium, partnerIsPremium } = useSubscriptionStore.getState();
        const isCouplePremium = isPremium || partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;
        const limit = limits.maxPlansPerMonth;

        // Count plans added this month (not cancelled)
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const currentCount = get().plans.filter(
          (p) => p.status !== 'cancelled' && p.createdAt >= monthStart
        ).length;

        return { allowed: currentCount < limit, currentCount, limit };
      },
    }),
    {
      name: 'daydate-plans',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        plans: state.plans,
        coupleId: state.coupleId,
      }),
    }
  )
);
