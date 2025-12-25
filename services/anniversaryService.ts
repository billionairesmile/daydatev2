import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { db, supabase, isInTestMode } from '@/lib/supabase';
import { formatDateToLocal, parseDateFromLocal } from '@/lib/dateUtils';

// Storage keys
const STORAGE_KEYS = {
  ANNIVERSARIES: 'anniversaries_local',
  PENDING_SYNC: 'anniversaries_pending_sync',
  LAST_SYNC: 'anniversaries_last_sync',
};

// Types
export interface Anniversary {
  id: string;
  label: string;
  targetDate: Date;
  icon: string;
  bgColor: string;
  gradientColors: readonly [string, string];
  isYearly?: boolean;
  isCustom?: boolean; // true for user-created, false for system-generated
}

interface DBAnniversary {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  is_recurring: boolean;
  notification_enabled: boolean;
  icon: string;
  bg_color: string;
  gradient_colors: string[];
  created_at: string;
  updated_at: string;
}

interface PendingAction {
  type: 'create' | 'update' | 'delete';
  anniversary: Anniversary;
  timestamp: number;
}

// Convert DB format to app format
function dbToApp(dbAnniversary: DBAnniversary): Anniversary {
  const colors = dbAnniversary.gradient_colors;
  const gradientColors: readonly [string, string] =
    colors && colors.length >= 2
      ? [colors[0], colors[1]]
      : ['#A855F7', '#EC4899'];

  return {
    id: dbAnniversary.id,
    label: dbAnniversary.title,
    targetDate: parseDateFromLocal(dbAnniversary.date),
    icon: dbAnniversary.icon || '🎉',
    bgColor: dbAnniversary.bg_color || 'rgba(168, 85, 247, 0.25)',
    gradientColors,
    isYearly: dbAnniversary.is_recurring,
    isCustom: true,
  };
}

// Convert app format to DB format
function appToDb(anniversary: Anniversary, coupleId: string): Omit<DBAnniversary, 'created_at' | 'updated_at'> {
  return {
    id: anniversary.id,
    couple_id: coupleId,
    title: anniversary.label,
    date: formatDateToLocal(anniversary.targetDate),
    is_recurring: anniversary.isYearly ?? true,
    notification_enabled: true,
    icon: anniversary.icon,
    bg_color: anniversary.bgColor,
    gradient_colors: [...anniversary.gradientColors],
  };
}

// Check if online
async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

// Local storage operations
async function getLocalAnniversaries(): Promise<Anniversary[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.ANNIVERSARIES);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return parsed.map((a: Anniversary & { targetDate: string }) => ({
      ...a,
      targetDate: new Date(a.targetDate),
    }));
  } catch (error) {
    console.error('[AnniversaryService] Failed to get local anniversaries:', error);
    return [];
  }
}

async function saveLocalAnniversaries(anniversaries: Anniversary[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ANNIVERSARIES, JSON.stringify(anniversaries));
  } catch (error) {
    console.error('[AnniversaryService] Failed to save local anniversaries:', error);
  }
}

async function getPendingActions(): Promise<PendingAction[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SYNC);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('[AnniversaryService] Failed to get pending actions:', error);
    return [];
  }
}

async function savePendingActions(actions: PendingAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(actions));
  } catch (error) {
    console.error('[AnniversaryService] Failed to save pending actions:', error);
  }
}

async function addPendingAction(action: PendingAction): Promise<void> {
  const actions = await getPendingActions();
  // Remove any existing action for the same anniversary
  const filtered = actions.filter(a => a.anniversary.id !== action.anniversary.id);
  // If deleting, remove any create/update actions for this anniversary
  if (action.type === 'delete') {
    filtered.push(action);
  } else {
    filtered.push(action);
  }
  await savePendingActions(filtered);
}

// Anniversary Service
export const anniversaryService = {
  // Load anniversaries (from DB if online, from local storage if offline)
  async load(coupleId: string): Promise<Anniversary[]> {
    // In test mode, just return local data
    if (isInTestMode()) {
      return getLocalAnniversaries();
    }

    const online = await isOnline();

    if (online && supabase) {
      try {
        const { data, error } = await db.anniversaries.getAll(coupleId);
        if (error) {
          console.error('[AnniversaryService] DB load error:', error);
          return getLocalAnniversaries();
        }

        const anniversaries = (data || []).map(dbToApp);
        // Update local cache
        await saveLocalAnniversaries(anniversaries);
        return anniversaries;
      } catch (error) {
        console.error('[AnniversaryService] Load error:', error);
        return getLocalAnniversaries();
      }
    } else {
      return getLocalAnniversaries();
    }
  },

  // Create a new anniversary
  async create(coupleId: string, anniversary: Omit<Anniversary, 'id'>): Promise<Anniversary | null> {
    const newAnniversary: Anniversary = {
      ...anniversary,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isCustom: true,
    };

    // Save locally first
    const local = await getLocalAnniversaries();
    local.push(newAnniversary);
    await saveLocalAnniversaries(local);

    // In test mode, just return local data
    if (isInTestMode()) {
      return newAnniversary;
    }

    const online = await isOnline();

    if (online && supabase) {
      try {
        const dbData = appToDb(newAnniversary, coupleId);
        const { data, error } = await db.anniversaries.create({
          couple_id: dbData.couple_id,
          title: dbData.title,
          date: dbData.date,
          is_recurring: dbData.is_recurring,
          icon: dbData.icon,
          bg_color: dbData.bg_color,
          gradient_colors: dbData.gradient_colors,
        });

        if (error) {
          console.error('[AnniversaryService] DB create error:', error);
          await addPendingAction({ type: 'create', anniversary: newAnniversary, timestamp: Date.now() });
          return newAnniversary;
        }

        // Update local with real DB id
        const dbAnniversary = dbToApp(data);
        const updatedLocal = local.filter(a => a.id !== newAnniversary.id);
        updatedLocal.push(dbAnniversary);
        await saveLocalAnniversaries(updatedLocal);

        return dbAnniversary;
      } catch (error) {
        console.error('[AnniversaryService] Create error:', error);
        await addPendingAction({ type: 'create', anniversary: newAnniversary, timestamp: Date.now() });
        return newAnniversary;
      }
    } else {
      // Offline: queue for sync
      await addPendingAction({ type: 'create', anniversary: newAnniversary, timestamp: Date.now() });
      return newAnniversary;
    }
  },

  // Update an anniversary
  async update(coupleId: string, anniversary: Anniversary): Promise<Anniversary | null> {
    // Update locally first
    const local = await getLocalAnniversaries();
    const index = local.findIndex(a => a.id === anniversary.id);
    if (index !== -1) {
      local[index] = anniversary;
      await saveLocalAnniversaries(local);
    }

    // In test mode, just return local data
    if (isInTestMode()) {
      return anniversary;
    }

    const online = await isOnline();

    if (online && supabase && !anniversary.id.startsWith('local_')) {
      try {
        const { error } = await db.anniversaries.update(anniversary.id, {
          title: anniversary.label,
          date: formatDateToLocal(anniversary.targetDate),
          is_recurring: anniversary.isYearly,
          icon: anniversary.icon,
          bg_color: anniversary.bgColor,
          gradient_colors: [...anniversary.gradientColors],
        });

        if (error) {
          console.error('[AnniversaryService] DB update error:', error);
          await addPendingAction({ type: 'update', anniversary, timestamp: Date.now() });
        }

        return anniversary;
      } catch (error) {
        console.error('[AnniversaryService] Update error:', error);
        await addPendingAction({ type: 'update', anniversary, timestamp: Date.now() });
        return anniversary;
      }
    } else {
      // Offline or local-only: queue for sync
      await addPendingAction({ type: 'update', anniversary, timestamp: Date.now() });
      return anniversary;
    }
  },

  // Delete an anniversary
  async delete(coupleId: string, anniversaryId: string): Promise<boolean> {
    // Get the anniversary before deleting (for pending sync)
    const local = await getLocalAnniversaries();
    const anniversary = local.find(a => a.id === anniversaryId);

    // Delete locally first
    const filtered = local.filter(a => a.id !== anniversaryId);
    await saveLocalAnniversaries(filtered);

    // In test mode, just return success
    if (isInTestMode()) {
      return true;
    }

    const online = await isOnline();

    if (online && supabase && !anniversaryId.startsWith('local_')) {
      try {
        const { error } = await db.anniversaries.delete(anniversaryId);

        if (error) {
          console.error('[AnniversaryService] DB delete error:', error);
          if (anniversary) {
            await addPendingAction({ type: 'delete', anniversary, timestamp: Date.now() });
          }
        }

        return true;
      } catch (error) {
        console.error('[AnniversaryService] Delete error:', error);
        if (anniversary) {
          await addPendingAction({ type: 'delete', anniversary, timestamp: Date.now() });
        }
        return true;
      }
    } else {
      // Offline: queue for sync if it was a real DB item
      if (anniversary && !anniversaryId.startsWith('local_')) {
        await addPendingAction({ type: 'delete', anniversary, timestamp: Date.now() });
      }
      return true;
    }
  },

  // Sync pending actions when coming online
  async syncPending(coupleId: string): Promise<{ synced: number; failed: number }> {
    if (isInTestMode()) {
      return { synced: 0, failed: 0 };
    }

    const online = await isOnline();
    if (!online || !supabase) {
      return { synced: 0, failed: 0 };
    }

    const actions = await getPendingActions();
    if (actions.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;
    const remainingActions: PendingAction[] = [];
    const local = await getLocalAnniversaries();

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create': {
            const dbData = appToDb(action.anniversary, coupleId);
            const { data, error } = await db.anniversaries.create({
              couple_id: dbData.couple_id,
              title: dbData.title,
              date: dbData.date,
              is_recurring: dbData.is_recurring,
              icon: dbData.icon,
              bg_color: dbData.bg_color,
              gradient_colors: dbData.gradient_colors,
            });

            if (error) {
              failed++;
              remainingActions.push(action);
            } else {
              synced++;
              // Update local id with real DB id
              const index = local.findIndex(a => a.id === action.anniversary.id);
              if (index !== -1 && data) {
                local[index] = dbToApp(data);
              }
            }
            break;
          }

          case 'update': {
            if (action.anniversary.id.startsWith('local_')) {
              // This was a local-only item, skip
              synced++;
            } else {
              const { error } = await db.anniversaries.update(action.anniversary.id, {
                title: action.anniversary.label,
                date: formatDateToLocal(action.anniversary.targetDate),
                is_recurring: action.anniversary.isYearly,
                icon: action.anniversary.icon,
                bg_color: action.anniversary.bgColor,
                gradient_colors: [...action.anniversary.gradientColors],
              });

              if (error) {
                failed++;
                remainingActions.push(action);
              } else {
                synced++;
              }
            }
            break;
          }

          case 'delete': {
            if (action.anniversary.id.startsWith('local_')) {
              // This was a local-only item, skip
              synced++;
            } else {
              const { error } = await db.anniversaries.delete(action.anniversary.id);

              if (error) {
                failed++;
                remainingActions.push(action);
              } else {
                synced++;
              }
            }
            break;
          }
        }
      } catch (error) {
        console.error('[AnniversaryService] Sync error:', error);
        failed++;
        remainingActions.push(action);
      }
    }

    // Save updated local data and remaining actions
    await saveLocalAnniversaries(local);
    await savePendingActions(remainingActions);

    // Update last sync time
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

    return { synced, failed };
  },

  // Check if there are pending actions
  async hasPendingSync(): Promise<boolean> {
    const actions = await getPendingActions();
    return actions.length > 0;
  },

  // Clear all local data (for logout)
  async clearLocal(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ANNIVERSARIES,
      STORAGE_KEYS.PENDING_SYNC,
      STORAGE_KEYS.LAST_SYNC,
    ]);
  },

  // Subscribe to real-time updates
  subscribe(
    coupleId: string,
    onUpdate: (anniversaries: Anniversary[]) => void
  ): (() => void) | null {
    if (isInTestMode() || !supabase) {
      return null;
    }

    const channel = db.anniversaries.subscribeToAnniversaries(coupleId, async () => {
      // Reload from DB when changes occur
      const anniversaries = await this.load(coupleId);
      onUpdate(anniversaries);
    });

    // Return unsubscribe function
    return () => {
      db.anniversaries.unsubscribe(channel);
    };
  },
};
