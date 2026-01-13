import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Animated,
  PanResponder,
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
  Alert,
  InteractionManager,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Settings,
  Pen,
  X,
  Circle,
  Check,
  Trash2,
  Edit2,
  Droplet,
  Calendar as CalendarIcon,
  Clock,
  Info,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react-native';

import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, IS_TABLET, scale, scaleFont, ANDROID_BOTTOM_PADDING, BANNER_AD_BOTTOM } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useMemoryStore, SAMPLE_MEMORIES } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useCoupleSyncStore, type SyncedTodo } from '@/stores/coupleSyncStore';
import { useTimezoneStore } from '@/stores/timezoneStore';
import { isDemoMode } from '@/lib/supabase';
import { BannerAdView } from '@/components/ads';

const { width, height } = Dimensions.get('window');

// Parse date string as local date (not UTC) to avoid timezone issues
// Handles both simple date strings and ISO timestamps
const parseDateAsLocal = (dateString: string): Date => {
  // If it's an ISO timestamp (contains T), parse as Date first to get correct local time
  // e.g., "1990-01-02T15:00:00.000Z" represents Jan 3 00:00 in KST (UTC+9)
  if (dateString.includes('T')) {
    const d = new Date(dateString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // If it's a simple date string like "1990-01-03", parse as local
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// Korean holidays for 2025
const HOLIDAYS_2025: Record<string, string> = {
  '2025-1-1': '신정',
  '2025-1-28': '설날 연휴',
  '2025-1-29': '설날',
  '2025-1-30': '설날 연휴',
  '2025-3-1': '삼일절',
  '2025-5-5': '어린이날',
  '2025-6-6': '현충일',
  '2025-8-15': '광복절',
  '2025-10-3': '개천절',
  '2025-10-6': '추석 연휴',
  '2025-10-7': '추석',
  '2025-10-8': '추석 연휴',
  '2025-10-9': '한글날',
  '2025-12-25': '크리스마스',
};

// Local Todo type for fallback when not synced
interface LocalTodo {
  id: string;
  date: string;
  text: string;
  completed: boolean;
}

// Union type to support both local and synced todos
type Todo = LocalTodo | SyncedTodo;

// Swipeable Todo Item Component
function SwipeableTodoItem({
  todo,
  onToggle,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onSwipeStart,
  onSwipeEnd,
  editLabel,
  deleteLabel,
}: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onRequestDelete: () => Promise<boolean>;
  onConfirmDelete: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  editLabel: string;
  deleteLabel: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const itemOpacity = useRef(new Animated.Value(1)).current;
  const itemScale = useRef(new Animated.Value(1)).current;
  const itemHeight = useRef(new Animated.Value(1)).current;
  const isSwipedRef = useRef(false);
  const gestureStartedRef = useRef(false);

  // Interpolate action buttons opacity based on swipe distance (120px for two buttons)
  const actionButtonsOpacity = translateX.interpolate({
    inputRange: [-120, -40, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  // Interpolate action buttons scale for nice effect
  const actionButtonsScale = translateX.interpolate({
    inputRange: [-120, -60, 0],
    outputRange: [1, 0.8, 0.6],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        // Capture any horizontal movement immediately
        const absX = Math.abs(gesture.dx);
        const absY = Math.abs(gesture.dy);
        // If already swiped open, capture right swipes to close
        if (isSwipedRef.current && gesture.dx > 2) {
          return true;
        }
        // For left swipes, capture immediately when horizontal
        if (gesture.dx < -2 && absX > absY) {
          return true;
        }
        return false;
      },
      onPanResponderGrant: () => {
        gestureStartedRef.current = true;
        // Disable parent scroll when swipe starts
        onSwipeStart?.();
        // Extract current value for smooth continuation
        translateX.extractOffset();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        if (!gestureStartedRef.current) return;

        // Calculate new position
        let newValue = gesture.dx;

        // Limit the swipe range (120px for two buttons)
        if (newValue < -120) {
          // Add resistance beyond threshold
          newValue = -120 + (newValue + 120) * 0.2;
        } else if (newValue > 0) {
          // Allow slight overswipe when closing
          newValue = newValue * 0.3;
        }

        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gesture) => {
        gestureStartedRef.current = false;
        // Re-enable parent scroll when swipe ends
        onSwipeEnd?.();
        translateX.flattenOffset();

        // Get current animated value
        const currentValue = (translateX as any)._value || 0;
        const velocity = gesture.vx;

        // Use velocity and position to determine final state (adjusted for 120px)
        const shouldOpen = currentValue < -50 || velocity < -0.3;
        const shouldClose = currentValue > -70 || velocity > 0.3;

        if (shouldOpen && !shouldClose) {
          Animated.spring(translateX, {
            toValue: -120,
            useNativeDriver: true,
            tension: 180,
            friction: 12,
          }).start();
          isSwipedRef.current = true;
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 180,
            friction: 12,
          }).start();
          isSwipedRef.current = false;
        }
      },
      onPanResponderTerminate: () => {
        gestureStartedRef.current = false;
        // Re-enable parent scroll when swipe is terminated
        onSwipeEnd?.();
        translateX.flattenOffset();
        // Reset to closed state on terminate
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 180,
          friction: 12,
        }).start();
        isSwipedRef.current = false;
      },
    })
  ).current;

  const handleDelete = async () => {
    // First confirm deletion - wait for user response
    const confirmed = await onRequestDelete();

    if (confirmed) {
      // Run animation after user confirms, then actually delete
      Animated.parallel([
        Animated.timing(itemOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(itemScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(itemHeight, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Actually delete after animation completes
        onConfirmDelete();
      });
    }
  };

  const handleEdit = () => {
    // Trigger edit immediately, then close the swipe in background
    onEdit();
    isSwipedRef.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 180,
      friction: 12,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.todoItemWrapper,
        {
          opacity: itemOpacity,
          transform: [{ scale: itemScale }],
          maxHeight: itemHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 100],
          }),
          marginBottom: itemHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 4],
          }),
        }
      ]}
    >
      {/* Action Buttons - Hidden until swiped with animated opacity */}
      <Animated.View
        style={[
          styles.todoActionsContainer,
          {
            opacity: actionButtonsOpacity,
            transform: [{ scale: actionButtonsScale }],
          }
        ]}
      >
        <Pressable style={styles.todoEditButton} onPress={handleEdit}>
          <Edit2 color={COLORS.black} size={scale(18)} strokeWidth={2} />
          <Text style={styles.todoEditButtonText}>{editLabel}</Text>
        </Pressable>
        <Pressable style={styles.todoDeleteButton} onPress={handleDelete}>
          <Trash2 color={COLORS.white} size={scale(18)} strokeWidth={2} />
          <Text style={styles.todoDeleteButtonText}>{deleteLabel}</Text>
        </Pressable>
      </Animated.View>

      {/* Swipeable Todo Content */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.todoItem,
          { transform: [{ translateX }] },
        ]}
      >
        <Pressable onPress={onToggle} style={styles.todoCheckbox}>
          {todo.completed ? (
            <View style={styles.todoCheckboxCompleted}>
              <Check color={COLORS.black} size={scale(14)} strokeWidth={3} />
            </View>
          ) : (
            <Circle
              color="rgba(255,255,255,0.4)"
              size={scale(20)}
            />
          )}
        </Pressable>
        <Text
          style={[
            styles.todoText,
            todo.completed && styles.todoTextCompleted,
          ]}
        >
          {todo.text}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { backgroundImage } = useBackground();
  const { memories, loadFromDB } = useMemoryStore();
  const { couple } = useAuthStore();
  const { getEffectiveTimezone } = useTimezoneStore();

  // Track if navigation/interaction is complete for deferred operations
  const [isInteractionComplete, setIsInteractionComplete] = useState(false);

  // Defer heavy operations until after navigation completes
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsInteractionComplete(true);
    });
    return () => handle.cancel();
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  // Store full date to keep selection when navigating months
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [localTodos, setLocalTodos] = useState<LocalTodo[]>([]); // Fallback for non-synced mode
  const [scrollEnabled, setScrollEnabled] = useState(true); // For disabling scroll during swipe
  const [swipeResetKey, setSwipeResetKey] = useState(0); // For resetting swipe state on screen focus
  const [isAddTodoOpen, setIsAddTodoOpen] = useState(false);
  const [todoText, setTodoText] = useState('');
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [isEditTodoOpen, setIsEditTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editTodoText, setEditTodoText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempMenstrualEnabled, setTempMenstrualEnabled] = useState(false);
  const [isPeriodSettingsOpen, setIsPeriodSettingsOpen] = useState(false);
  const [periodModalStep, setPeriodModalStep] = useState<'settings' | 'datePicker'>('settings');
  const [tempLastPeriodDate, setTempLastPeriodDate] = useState(new Date());
  const [tempCycleLength, setTempCycleLength] = useState('28');
  const [pickerMonth, setPickerMonth] = useState(new Date());

  // Couple sync state for todos and menstrual settings
  const {
    sharedTodos,
    menstrualSettings,
    isInitialized: isSyncInitialized,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo: deleteSyncedTodo,
    updateMenstrualSettings,
  } = useCoupleSyncStore();

  // Derived menstrual state from sync
  const menstrualTrackingEnabled = menstrualSettings?.enabled ?? false;
  const lastPeriodDate = menstrualSettings?.last_period_date ? parseDateAsLocal(menstrualSettings.last_period_date) : null;
  const cycleLength = menstrualSettings?.cycle_length ?? 30;
  const hasPeriodData = !!menstrualSettings?.last_period_date;

  // Keyboard animation for modals
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Modal animations
  const settingsOpacity = useRef(new Animated.Value(0)).current;
  const todoOpacity = useRef(new Animated.Value(0)).current;
  const editTodoOpacity = useRef(new Animated.Value(0)).current;
  const periodOpacity = useRef(new Animated.Value(0)).current;

  const openSettingsModal = () => {
    setTempMenstrualEnabled(menstrualTrackingEnabled);
    settingsOpacity.setValue(0);
    setIsSettingsOpen(true);
    Animated.timing(settingsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeSettingsModal = async (saveChanges = false) => {
    Animated.timing(settingsOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(async () => {
      if (saveChanges) {
        // Update via sync store
        await updateMenstrualSettings({ enabled: tempMenstrualEnabled });
      }
      setIsSettingsOpen(false);
    });
  };

  const openTodoModal = () => {
    todoOpacity.setValue(0);
    setIsAddTodoOpen(true);
    Animated.timing(todoOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeTodoModal = () => {
    Keyboard.dismiss();
    Animated.timing(todoOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setIsAddTodoOpen(false);
      setTodoText('');
    });
  };

  const openEditTodoModal = (todo: Todo) => {
    setEditingTodo(todo);
    setEditTodoText(todo.text);
    editTodoOpacity.setValue(0);
    setIsEditTodoOpen(true);
    Animated.timing(editTodoOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeEditTodoModal = () => {
    Keyboard.dismiss();
    Animated.timing(editTodoOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setIsEditTodoOpen(false);
      setEditingTodo(null);
      setEditTodoText('');
    });
  };

  const openPeriodModal = (skipReset = false) => {
    // Load existing values from menstrualSettings, unless skipReset is true
    if (!skipReset) {
      if (menstrualSettings?.last_period_date) {
        setTempLastPeriodDate(parseDateAsLocal(menstrualSettings.last_period_date));
        setPickerMonth(parseDateAsLocal(menstrualSettings.last_period_date));
      } else {
        setTempLastPeriodDate(new Date());
        setPickerMonth(new Date());
      }
      setTempCycleLength(String(menstrualSettings?.cycle_length ?? 30));
      setPeriodModalStep('settings'); // Reset to settings step
    }

    periodOpacity.setValue(0);
    setIsPeriodSettingsOpen(true);
    Animated.timing(periodOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closePeriodModal = async (save = false) => {
    Keyboard.dismiss();
    Animated.timing(periodOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(async () => {
      if (save) {
        const parsedCycle = parseInt(tempCycleLength, 10);
        const validCycle = !isNaN(parsedCycle) && parsedCycle >= 20 && parsedCycle <= 50 ? parsedCycle : 28;

        // Format date as YYYY-MM-DD for DB
        const formattedDate = `${tempLastPeriodDate.getFullYear()}-${String(tempLastPeriodDate.getMonth() + 1).padStart(2, '0')}-${String(tempLastPeriodDate.getDate()).padStart(2, '0')}`;

        // Update via sync store
        await updateMenstrualSettings({
          last_period_date: formattedDate,
          cycle_length: validCycle,
        });
      }
      setIsPeriodSettingsOpen(false);
    });
  };

  // Open date picker - switch to date picker step within same modal
  const openDatePicker = () => {
    Keyboard.dismiss();
    setPickerMonth(tempLastPeriodDate);
    setPeriodModalStep('datePicker');
  };

  // Close date picker - switch back to settings step
  const closeDatePicker = (selectedDate?: Date) => {
    if (selectedDate) {
      setTempLastPeriodDate(selectedDate);
    }
    setPeriodModalStep('settings');
  };

  // Load memories from DB when couple is available
  useEffect(() => {
    if (!isDemoMode && couple?.id) {
      loadFromDB(couple.id);
    }
  }, [couple?.id, loadFromDB]);

  // Reset calendar to today, swipe state, and reload memories when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Reset calendar to current date when returning to screen
      setCurrentDate(new Date());
      setSelectedDate(null);
      // Increment key to force SwipeableTodoItem components to reset
      setSwipeResetKey((prev) => prev + 1);
      // Also ensure scroll is enabled
      setScrollEnabled(true);
      // Reload memories from database to ensure sync between paired devices
      if (!isDemoMode && couple?.id) {
        loadFromDB(couple.id);
      }
    }, [couple?.id, loadFromDB])
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowListener = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: -e.endCoordinates.height / 2.5,
        duration: Platform.OS === 'ios' ? 250 : 150,
        useNativeDriver: true,
      }).start();
    });

    const keyboardHideListener = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? 250 : 150,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, [keyboardOffset]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDayOfWeek = firstDayOfMonth.getDay();

  const getDaysArray = () => {
    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getMissionForDate = (day: number) => {
    // Get all memories for this date and sort by completedAt (earliest first)
    // This ensures we show the first completed mission's photo, with fallback if deleted
    const memoriesForDate = memories
      .filter((memory) => {
        const completedDate = new Date(memory.completedAt);
        return (
          completedDate.getFullYear() === year &&
          completedDate.getMonth() === month &&
          completedDate.getDate() === day
        );
      })
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

    // Find the first memory with a valid photo URL
    const memoryWithPhoto = memoriesForDate.find(
      (memory) => memory.photoUrl && memory.photoUrl.trim() !== ''
    );

    if (memoryWithPhoto) {
      return {
        imageUrl: memoryWithPhoto.photoUrl,
        title: memoryWithPhoto.mission?.title || '미션 완료',
      };
    }

    // Then check SAMPLE_MEMORIES for development data (same logic)
    const sampleMemoriesForDate = SAMPLE_MEMORIES
      .filter((memory) => {
        const completedDate = new Date(memory.completedAt);
        return (
          completedDate.getFullYear() === year &&
          completedDate.getMonth() === month &&
          completedDate.getDate() === day
        );
      })
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

    const sampleMemoryWithPhoto = sampleMemoriesForDate.find(
      (memory) => memory.photoUrl && memory.photoUrl.trim() !== ''
    );

    if (sampleMemoryWithPhoto) {
      return {
        imageUrl: sampleMemoryWithPhoto.photoUrl,
        title: sampleMemoryWithPhoto.mission?.title || '미션 완료',
      };
    }

    // No mission data with valid photo found
    return undefined;
  };

  const getHolidayForDate = (day: number) => {
    const dateKey = `${year}-${month + 1}-${day}`;
    return HOLIDAYS_2025[dateKey];
  };

  const isWeekend = (day: number) => {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  const isHolidayOrWeekend = (day: number) => {
    return isWeekend(day) || !!getHolidayForDate(day);
  };

  // Get today's date in the selected timezone
  const getTodayInTimezone = (): Date => {
    const timezone = getEffectiveTimezone();
    const now = new Date();
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      };
      const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
      const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const m = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
      const d = parseInt(parts.find(p => p.type === 'day')?.value || '1');
      return new Date(y, m, d);
    } catch (e) {
      // Fallback to local date
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  };

  const isToday = (day: number) => {
    const today = getTodayInTimezone();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const handleDateClick = (day: number) => {
    // Check if this day is already selected (same year, month, day)
    const isAlreadySelected = selectedDate &&
      selectedDate.year === year &&
      selectedDate.month === month &&
      selectedDate.day === day;

    if (isAlreadySelected) {
      setSelectedDate(null);
    } else if (isToday(day)) {
      setSelectedDate(null);
    } else {
      setSelectedDate({ year, month, day });
    }
  };

  // Calculate cycle offset range: from past cycles to 3 months ahead from current month
  const getCycleOffsetRange = (): { start: number; end: number } => {
    if (!lastPeriodDate || !cycleLength) return { start: 0, end: 0 };

    const today = getTodayInTimezone();
    // 3 months from current month (end of that month)
    const threeMonthsAhead = new Date(today.getFullYear(), today.getMonth() + 4, 0);

    // Calculate how many days from lastPeriodDate to 3 months ahead
    const daysDiff = Math.ceil((threeMonthsAhead.getTime() - lastPeriodDate.getTime()) / (1000 * 60 * 60 * 24));
    const endOffset = Math.ceil(daysDiff / cycleLength) + 1;

    // Start from a few cycles before the last period date to handle past viewing
    const startOffset = -3;

    return { start: startOffset, end: endOffset };
  };

  // Period tracking helpers
  const isPeriodDay = (day: number): boolean => {
    if (!lastPeriodDate || !menstrualTrackingEnabled) return false;
    const currentDayDate = new Date(year, month, day);
    const { start, end } = getCycleOffsetRange();

    for (let cycleOffset = start; cycleOffset <= end; cycleOffset++) {
      const cycleStartDate = new Date(lastPeriodDate);
      cycleStartDate.setDate(cycleStartDate.getDate() + cycleOffset * cycleLength);
      const cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setDate(cycleEndDate.getDate() + 5);

      if (currentDayDate >= cycleStartDate && currentDayDate < cycleEndDate) {
        return true;
      }
    }
    return false;
  };

  const isOvulationDay = (day: number): boolean => {
    if (!lastPeriodDate || !cycleLength || !menstrualTrackingEnabled) return false;
    const currentDayDate = new Date(year, month, day);
    const { start, end } = getCycleOffsetRange();

    for (let cycleOffset = start; cycleOffset <= end; cycleOffset++) {
      const cycleStartDate = new Date(lastPeriodDate);
      cycleStartDate.setDate(cycleStartDate.getDate() + cycleOffset * cycleLength);
      const ovulationDate = new Date(cycleStartDate);
      ovulationDate.setDate(ovulationDate.getDate() + cycleLength - 14);

      if (currentDayDate.toDateString() === ovulationDate.toDateString()) {
        return true;
      }
    }
    return false;
  };

  const isFertileWindow = (day: number): boolean => {
    if (!lastPeriodDate || !cycleLength || !menstrualTrackingEnabled) return false;
    const currentDayDate = new Date(year, month, day);
    const { start, end } = getCycleOffsetRange();

    for (let cycleOffset = start; cycleOffset <= end; cycleOffset++) {
      const cycleStartDate = new Date(lastPeriodDate);
      cycleStartDate.setDate(cycleStartDate.getDate() + cycleOffset * cycleLength);
      const ovulationDate = new Date(cycleStartDate);
      ovulationDate.setDate(ovulationDate.getDate() + cycleLength - 14);
      const fertileStart = new Date(ovulationDate);
      fertileStart.setDate(fertileStart.getDate() - 5);
      const fertileEnd = new Date(ovulationDate);
      fertileEnd.setDate(fertileEnd.getDate() + 1);

      if (currentDayDate >= fertileStart && currentDayDate <= fertileEnd) {
        return true;
      }
    }
    return false;
  };

  const calculatePeriodInfo = () => {
    if (!lastPeriodDate || !cycleLength) return null;

    const today = getTodayInTimezone();
    const PERIOD_DURATION = 5; // Period lasts 5 days (day 0 to day 4)

    // Find the current or most recent period start date
    let currentPeriodStart = new Date(lastPeriodDate);

    // Move forward in cycles until we find the period that includes or is closest to today
    while (true) {
      const nextCycleStart = new Date(currentPeriodStart);
      nextCycleStart.setDate(nextCycleStart.getDate() + cycleLength);

      if (nextCycleStart.getTime() > today.getTime()) {
        // nextCycleStart is in the future, so currentPeriodStart is the most recent
        break;
      }
      currentPeriodStart = nextCycleStart;
    }

    // Calculate days since period start
    const daysSincePeriodStart = Math.floor(
      (today.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if today is within the current period (day 0 to day 4)
    if (daysSincePeriodStart >= 0 && daysSincePeriodStart < PERIOD_DURATION) {
      // Currently in period - show D-Day, D+1, D+2, D+3, D+4
      // dDay: 0 for day 0 (D-Day), -1 for day 1 (D+1), -2 for day 2 (D+2), etc.
      const dDay = daysSincePeriodStart === 0 ? 0 : -daysSincePeriodStart;
      return { nextPeriodDate: currentPeriodStart, dDay };
    } else {
      // Period has ended - show next upcoming period
      const nextPeriodDate = new Date(currentPeriodStart);
      nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);

      const dDay = Math.ceil(
        (nextPeriodDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return { nextPeriodDate, dDay };
    }
  };

  const periodInfo = calculatePeriodInfo();

  // Todo functions - use synced todos if available (with null safety)
  const todos: Todo[] = (isSyncInitialized ? sharedTodos : localTodos) || [];

  const getTodosForDate = (day: number) => {
    // Format date as YYYY-MM-DD to match DB format
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return todos.filter((todo) => todo.date === dateKey);
  };

  const getCurrentDateTodos = () => {
    const today = getTodayInTimezone();
    if (selectedDate) {
      // Use the stored selected date (full year/month/day)
      const dateKey = `${selectedDate.year}-${String(selectedDate.month + 1).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;
      return todos.filter((todo) => todo.date === dateKey);
    } else {
      // Use actual today's date (not the displayed month)
      const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return todos.filter((todo) => todo.date === dateKey);
    }
  };

  const handleAddTodo = async () => {
    // Prevent duplicate submissions from rapid clicks
    if (!todoText.trim() || isAddingTodo) {
      return;
    }

    setIsAddingTodo(true);

    try {
      const today = getTodayInTimezone();
      let dateKey: string;

      if (selectedDate) {
        // User selected a specific date - use the stored full date
        dateKey = `${selectedDate.year}-${String(selectedDate.month + 1).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;
      } else {
        // No date selected - use actual today's date (not displayed month/year)
        dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }

      if (isSyncInitialized) {
        // Use synced todo
        await addTodo(dateKey, todoText.trim());
      } else {
        // Fallback to local
        const newTodo: LocalTodo = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: dateKey,
          text: todoText.trim(),
          completed: false,
        };
        setLocalTodos([...localTodos, newTodo]);
      }

      setTodoText('');
      closeTodoModal();
    } finally {
      setIsAddingTodo(false);
    }
  };

  const handleToggleTodo = async (todo: Todo) => {
    if (isSyncInitialized && 'couple_id' in todo) {
      // Synced todo
      await toggleTodo(todo.id, !todo.completed);
    } else {
      // Local todo
      setLocalTodos(
        localTodos.map((t) =>
          t.id === todo.id ? { ...t, completed: !t.completed } : t
        )
      );
    }
  };

  const confirmDeleteTodo = (): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert(
        t('calendar.todo.deleteConfirmTitle'),
        t('calendar.todo.deleteConfirmMessage'),
        [
          {
            text: t('calendar.todo.deleteConfirmCancel'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: t('calendar.todo.deleteConfirmOk'),
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });
  };

  const executeDeleteTodo = async (todo: Todo) => {
    if (isSyncInitialized && 'couple_id' in todo) {
      // Synced todo
      await deleteSyncedTodo(todo.id);
    } else {
      // Local todo
      setLocalTodos(localTodos.filter((t) => t.id !== todo.id));
    }
  };

  const handleUpdateTodo = async () => {
    if (!editingTodo || !editTodoText.trim()) {
      return;
    }

    if (isSyncInitialized && 'couple_id' in editingTodo) {
      // Synced todo
      await updateTodo(editingTodo.id, editTodoText.trim());
    } else {
      // Local todo
      setLocalTodos(
        localTodos.map((t) =>
          t.id === editingTodo.id ? { ...t, text: editTodoText.trim() } : t
        )
      );
    }

    closeEditTodoModal();
  };

  // Date Picker helpers
  const getPickerDaysArray = () => {
    const pYear = pickerMonth.getFullYear();
    const pMonth = pickerMonth.getMonth();
    const firstDay = new Date(pYear, pMonth, 1);
    const lastDay = new Date(pYear, pMonth + 1, 0);
    const daysCount = lastDay.getDate();
    const startDay = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysCount; i++) {
      days.push(i);
    }
    return days;
  };

  const isPickerDateSelected = (day: number) => {
    return (
      tempLastPeriodDate.getFullYear() === pickerMonth.getFullYear() &&
      tempLastPeriodDate.getMonth() === pickerMonth.getMonth() &&
      tempLastPeriodDate.getDate() === day
    );
  };

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="high"
          style={styles.backgroundImageStyle}
        />
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]} />

      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('calendar.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('calendar.subtitle')}</Text>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={openSettingsModal}
        >
          <Settings color={COLORS.white} size={scale(20)} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {/* Calendar Header - Month/Year with Navigation */}
        <View style={styles.monthYearContainer}>
          <Pressable
            style={styles.monthNavButton}
            onPress={() => {
              setCurrentDate(new Date(year, month - 1, 1));
            }}
          >
            <ChevronLeft color={COLORS.white} size={scale(20)} strokeWidth={2} />
          </Pressable>
          <Text style={styles.monthYearText}>
            {MONTH_NAMES_EN[month]} {year}
          </Text>
          <Pressable
            style={styles.monthNavButton}
            onPress={() => {
              setCurrentDate(new Date(year, month + 1, 1));
            }}
          >
            <ChevronRight color={COLORS.white} size={scale(20)} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Day Names */}
        <View style={styles.dayNamesRow}>
          {(t('calendar.dayNames', { returnObjects: true }) as string[]).map((day: string, index: number) => (
            <View key={day} style={styles.dayNameCell}>
              <Text
                style={[
                  styles.dayNameText,
                  index === 0 && styles.dayNameSunday,
                ]}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {getDaysArray().map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={styles.dayCell} />;
            }

            const mission = getMissionForDate(day);
            const isRedDay = isHolidayOrWeekend(day);
            const isTodayDay = isToday(day);
            const isSelectedDay = selectedDate &&
              selectedDate.year === year &&
              selectedDate.month === month &&
              selectedDate.day === day;
            const hasTodos = getTodosForDate(day).length > 0;

            const showPeriod = !mission && isPeriodDay(day);
            const showOvulation = !mission && isOvulationDay(day);
            const showFertile = !mission && !showOvulation && isFertileWindow(day);

            return (
              <View key={day} style={styles.dayCell}>
                {mission ? (
                  <Pressable
                    onPress={() => handleDateClick(day)}
                    style={[
                      styles.dayCellInner,
                      styles.missionCell,
                    ]}
                  >
                    <ExpoImage
                      source={{ uri: mission.imageUrl }}
                      style={styles.missionImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={100}
                    />
                    <View style={styles.missionOverlay}>
                      <Text
                        style={[
                          styles.missionDayText,
                          isRedDay && styles.redDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </View>
                    {/* Selection/Today indicator overlay - doesn't affect image size */}
                    {(isTodayDay || isSelectedDay) && (
                      <View
                        style={[
                          styles.missionSelectionOverlay,
                          isTodayDay ? styles.missionTodayIndicator : styles.missionSelectedIndicator,
                        ]}
                      />
                    )}
                  </Pressable>
                ) : isTodayDay ? (
                  <Pressable
                    onPress={() => handleDateClick(day)}
                    style={[styles.dayCellInner, styles.todayCell]}
                  >
                    <Text
                      style={[
                        styles.todayDayText,
                        isRedDay && styles.redDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ) : isSelectedDay ? (
                  <Pressable
                    onPress={() => handleDateClick(day)}
                    style={[styles.dayCellInner, styles.selectedCell]}
                  >
                    <Text
                      style={[
                        styles.selectedDayText,
                        isRedDay && styles.redDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleDateClick(day)}
                    style={styles.dayCellInner}
                  >
                    {/* Period indicators */}
                    {showPeriod && <View style={styles.periodDot} />}
                    {showOvulation && <View style={styles.ovulationDot} />}
                    {showFertile && <View style={styles.fertileDot} />}
                    <Text
                      style={[
                        styles.normalDayText,
                        isRedDay && styles.redDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                )}
                {hasTodos && <View style={styles.todoDot} />}
              </View>
            );
          })}
        </View>

        {/* Today Section */}
        <View style={styles.todaySection}>
          <View style={styles.todaySectionHeader}>
            <Text style={styles.todaySectionTitle}>
              {selectedDate
                ? (i18n.language === 'ko'
                  ? `${selectedDate.month + 1}월 ${selectedDate.day}일`
                  : new Date(selectedDate.year, selectedDate.month, selectedDate.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
                : t('common.today')}
            </Text>
            <Pressable
              style={styles.iconButtonRound}
              onPress={openTodoModal}
            >
              <Pen color={COLORS.white} size={scale(18)} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.divider} />

          {/* Todo List */}
          <View style={styles.todoList}>
            {getCurrentDateTodos().length === 0 ? (
              <Pressable style={styles.emptyTodoCard} onPress={openTodoModal}>
                <Text style={styles.emptyTodoText}>{t('calendar.todo.empty')}</Text>
                <View style={styles.emptyTodoHint}>
                  <Pen color="rgba(255,255,255,0.5)" size={scale(16)} strokeWidth={2} />
                  <Text style={styles.emptyTodoHintText}>{t('calendar.todo.emptyHint')}</Text>
                </View>
              </Pressable>
            ) : (
              getCurrentDateTodos().map((todo) => (
                <SwipeableTodoItem
                  key={`${todo.id}-${swipeResetKey}`}
                  todo={todo}
                  onToggle={() => handleToggleTodo(todo)}
                  onEdit={() => openEditTodoModal(todo)}
                  onRequestDelete={confirmDeleteTodo}
                  onConfirmDelete={() => executeDeleteTodo(todo)}
                  onSwipeStart={() => setScrollEnabled(false)}
                  onSwipeEnd={() => setScrollEnabled(true)}
                  editLabel={t('calendar.todo.edit')}
                  deleteLabel={t('calendar.todo.delete')}
                />
              ))
            )}
          </View>
        </View>

        {/* Menstrual Information Section */}
        {menstrualTrackingEnabled && (
          <View style={styles.periodSection}>
            <View style={styles.periodSectionHeader}>
              <Text style={styles.periodSectionTitle}>{t('calendar.period.title')}</Text>
              <Pressable
                style={styles.iconButtonRound}
                onPress={() => openPeriodModal()}
              >
                <Pen color={COLORS.white} size={scale(18)} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.divider} />

            {!hasPeriodData ? (
              <Pressable style={styles.emptyPeriodCard} onPress={() => openPeriodModal()}>
                <LinearGradient
                  colors={['#ef4444', '#ec4899']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.periodIconLarge}
                >
                  <Droplet color={COLORS.white} size={scale(32)} strokeWidth={2} />
                </LinearGradient>
                <Text style={styles.emptyPeriodTitle}>{t('calendar.period.inputTitle')}</Text>
              </Pressable>
            ) : (
              <View style={styles.periodDataContainer}>
                {/* Next Period Card */}
                {periodInfo && (
                  <LinearGradient
                    colors={['rgba(254, 226, 226, 0.4)', 'rgba(252, 231, 243, 0.4)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.nextPeriodCard}
                  >
                    <View style={styles.nextPeriodLeft}>
                      <LinearGradient
                        colors={['#ef4444', '#ec4899']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.periodIconSmall}
                      >
                        <Droplet color={COLORS.white} size={scale(20)} strokeWidth={2} />
                      </LinearGradient>
                      <View>
                        <Text style={styles.nextPeriodLabel}>
                          {periodInfo.dDay <= 0 ? t('calendar.period.currentPeriod') : t('calendar.period.nextDate')}
                        </Text>
                        <Text style={styles.nextPeriodDate}>
                          {i18n.language === 'ko'
                            ? `${periodInfo.nextPeriodDate.getMonth() + 1}월 ${periodInfo.nextPeriodDate.getDate()}일`
                            : periodInfo.nextPeriodDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dDayBadge}>
                      <Text style={styles.dDayText}>
                        D{periodInfo.dDay > 0 ? `-${periodInfo.dDay}` : periodInfo.dDay === 0 ? '-Day' : `+${Math.abs(periodInfo.dDay)}`}
                      </Text>
                    </View>
                  </LinearGradient>
                )}

                {/* Cycle Info Cards */}
                <View style={styles.cycleInfoRow}>
                  <View style={[styles.cycleInfoCard, { backgroundColor: 'rgba(243, 232, 255, 0.3)' }]}>
                    <Text style={styles.cycleInfoLabel}>{t('calendar.period.averageCycle')}</Text>
                    <Text style={styles.cycleInfoValue}>{cycleLength}{t('calendar.period.daysUnit')}</Text>
                  </View>
                  {lastPeriodDate && (
                    <View style={[styles.cycleInfoCard, { backgroundColor: 'rgba(219, 234, 254, 0.3)' }]}>
                      <Text style={styles.cycleInfoLabel}>{t('calendar.period.lastDate')}</Text>
                      <Text style={styles.cycleInfoValue}>
                        {i18n.language === 'ko'
                          ? `${lastPeriodDate.getMonth() + 1}월 ${lastPeriodDate.getDate()}일`
                          : lastPeriodDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#ec4899' }]} />
                    <Text style={styles.legendText}>{t('calendar.period.legend.period')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#93c5fd' }]} />
                    <Text style={styles.legendText}>{t('calendar.period.legend.fertile')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
                    <Text style={styles.legendText}>{t('calendar.period.legend.ovulation')}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Banner Ad - Fixed at bottom above nav bar */}
      <BannerAdView placement="calendar" style={styles.bannerAd} />

      {/* Settings Modal */}
      <Modal
        visible={isSettingsOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeSettingsModal(false)}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: settingsOpacity }]}>
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('calendar.settings.title')}</Text>
                <Pressable
                  onPress={() => closeSettingsModal(false)}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={scale(20)} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.modalHeaderDivider} />

              <View style={styles.modalBody}>
                <Text style={styles.modalDescription}>{t('calendar.settings.description')}</Text>

                <Pressable
                  style={[
                    styles.featureCard,
                    tempMenstrualEnabled && styles.featureCardActive,
                  ]}
                  onPress={() => setTempMenstrualEnabled(!tempMenstrualEnabled)}
                >
                  <LinearGradient
                    colors={['#ef4444', '#ec4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.featureIconRound}
                  >
                    <Droplet color={COLORS.white} size={scale(24)} strokeWidth={2} />
                  </LinearGradient>
                  <View style={styles.featureInfo}>
                    <Text style={styles.featureTitle}>{t('calendar.period.calendar')}</Text>
                    <Text style={styles.featureDescription}>
                      {t('calendar.period.calendarDesc')}
                    </Text>
                  </View>
                  {tempMenstrualEnabled ? (
                    <View style={styles.checkCircleActive}>
                      <Check color={COLORS.black} size={scale(16)} strokeWidth={3} />
                    </View>
                  ) : (
                    <Circle color="rgba(255,255,255,0.4)" size={scale(24)} strokeWidth={2} />
                  )}
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalDoneButton}
                  onPress={() => closeSettingsModal(true)}
                >
                  <Text style={styles.modalDoneButtonText}>{t('common.done')}</Text>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </Animated.View>
      </Modal>

      {/* Add Todo Modal */}
      <Modal
        visible={isAddTodoOpen}
        transparent
        animationType="none"
        onRequestClose={closeTodoModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.modalOverlay, { opacity: todoOpacity }]}>
            <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
              <Animated.View style={[styles.modalContent, { transform: [{ translateY: keyboardOffset }] }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('calendar.todo.addTitle')}</Text>
                  <Pressable
                    onPress={closeTodoModal}
                    style={styles.modalCloseButton}
                  >
                    <X color="rgba(255,255,255,0.8)" size={scale(20)} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.modalHeaderDivider} />

                <View style={styles.modalBody}>
                  <View style={styles.todoInputContainer}>
                    <TextInput
                      style={styles.todoInput}
                      placeholder={t('calendar.todo.addPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={todoText}
                      onChangeText={setTodoText}
                      maxLength={50}
                      multiline
                      numberOfLines={3}
                    />
                    <Text style={styles.todoInputCount}>{todoText.length}/50</Text>
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={[styles.modalAddButtonFull, isAddingTodo && styles.modalAddButtonDisabled]}
                    onPress={handleAddTodo}
                    disabled={isAddingTodo}
                  >
                    <Text style={styles.modalAddButtonText}>
                      {isAddingTodo ? t('common.adding') : t('common.add')}
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            </BlurView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Todo Modal */}
      <Modal
        visible={isEditTodoOpen}
        transparent
        animationType="none"
        onRequestClose={closeEditTodoModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.modalOverlay, { opacity: editTodoOpacity }]}>
            <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
              <Animated.View style={[styles.modalContent, { transform: [{ translateY: keyboardOffset }] }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('calendar.todo.editTitle')}</Text>
                  <Pressable
                    onPress={closeEditTodoModal}
                    style={styles.modalCloseButton}
                  >
                    <X color="rgba(255,255,255,0.8)" size={scale(20)} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.modalHeaderDivider} />

                <View style={styles.modalBody}>
                  <View style={styles.todoInputContainer}>
                    <TextInput
                      style={styles.todoInput}
                      placeholder={t('calendar.todo.addPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={editTodoText}
                      onChangeText={setEditTodoText}
                      maxLength={50}
                      multiline
                      numberOfLines={3}
                    />
                    <Text style={styles.todoInputCount}>{editTodoText.length}/50</Text>
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.modalAddButtonFull}
                    onPress={handleUpdateTodo}
                  >
                    <Text style={styles.modalAddButtonText}>{t('common.save')}</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </BlurView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Period Settings Modal (with Date Picker step) */}
      <Modal
        visible={isPeriodSettingsOpen}
        transparent
        animationType="none"
        onRequestClose={() => periodModalStep === 'datePicker' ? closeDatePicker() : closePeriodModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.modalOverlay, { opacity: periodOpacity }]}>
            <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
              <Animated.View style={[styles.modalContent, { transform: [{ translateY: keyboardOffset }] }]}>
                {periodModalStep === 'settings' ? (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{t('calendar.period.settingsTitle')}</Text>
                      <Pressable
                        onPress={() => closePeriodModal(false)}
                        style={styles.modalCloseButton}
                      >
                        <X color="rgba(255,255,255,0.8)" size={scale(20)} strokeWidth={2} />
                      </Pressable>
                    </View>
                    <View style={styles.modalHeaderDivider} />

                    <View style={styles.modalBody}>
                      {/* Last Period Date */}
                      <View style={styles.periodSettingSection}>
                        <Text style={styles.periodSettingLabel}>{t('calendar.period.startDate')}</Text>
                        <Pressable
                          style={styles.periodSettingButton}
                          onPress={openDatePicker}
                        >
                          <LinearGradient
                            colors={['#ef4444', '#ec4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.settingIconRound}
                          >
                            <CalendarIcon color={COLORS.white} size={scale(18)} strokeWidth={2} />
                          </LinearGradient>
                          <View style={styles.periodSettingInfo}>
                            <Text style={styles.periodSettingHint}>{t('calendar.period.lastStartDate')}</Text>
                            <Text style={styles.periodSettingValue}>
                              {i18n.language === 'ko'
                                ? `${tempLastPeriodDate.getFullYear()}년 ${tempLastPeriodDate.getMonth() + 1}월 ${tempLastPeriodDate.getDate()}일`
                                : tempLastPeriodDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                          <ChevronRight color="rgba(255,255,255,0.4)" size={scale(20)} strokeWidth={2} />
                        </Pressable>
                      </View>

                      {/* Cycle Length */}
                      <View style={[styles.periodSettingSection, { marginTop: -8, marginBottom: 4 }]}>
                        <Text style={styles.periodSettingLabel}>{t('calendar.period.averageCycle')}</Text>
                        <Pressable
                          style={styles.cycleInputContainer}
                          onPress={Keyboard.dismiss}
                        >
                          <LinearGradient
                            colors={['#ef4444', '#ec4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.settingIconRound}
                          >
                            <Clock color={COLORS.white} size={scale(18)} strokeWidth={2} />
                          </LinearGradient>
                          <TextInput
                            style={styles.cycleInput}
                            value={tempCycleLength}
                            onChangeText={setTempCycleLength}
                            keyboardType="numeric"
                            maxLength={2}
                          />
                          <Text style={styles.cycleUnit}>{t('calendar.period.daysUnit')}</Text>
                        </Pressable>
                        <View style={styles.infoTextContainer}>
                          <Info color="rgba(255, 255, 255, 0.5)" size={scale(14)} strokeWidth={2} />
                          <Text style={styles.infoText}>{t('calendar.period.cycleHint')}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.modalFooter}>
                      <Pressable
                        style={styles.modalSaveButton}
                        onPress={() => closePeriodModal(true)}
                      >
                        <Text style={styles.modalSaveButtonText}>{t('common.save')}</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{t('calendar.period.selectDate')}</Text>
                      <Pressable
                        onPress={() => closeDatePicker()}
                        style={styles.modalCloseButton}
                      >
                        <X color="rgba(255,255,255,0.8)" size={scale(20)} strokeWidth={2} />
                      </Pressable>
                    </View>
                    <View style={styles.modalHeaderDivider} />

                    <View style={styles.modalBody}>
                      {/* Month Navigation */}
                      <View style={styles.pickerMonthNav}>
                        <Pressable
                          onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                          style={styles.pickerNavButton}
                        >
                          <ChevronLeft color={COLORS.foreground} size={scale(18)} />
                        </Pressable>
                        <Text style={styles.pickerMonthText}>
                          {i18n.language === 'ko'
                            ? `${pickerMonth.getFullYear()}년 ${pickerMonth.getMonth() + 1}월`
                            : pickerMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                        </Text>
                        <Pressable
                          onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                          style={styles.pickerNavButton}
                        >
                          <ChevronRight color={COLORS.foreground} size={scale(18)} />
                        </Pressable>
                      </View>

                      {/* Day Names */}
                      <View style={styles.pickerDayNames}>
                        {(t('calendar.dayNames', { returnObjects: true }) as string[]).map((day: string, idx: number) => (
                          <Text
                            key={day}
                            style={[
                              styles.pickerDayName,
                              idx === 0 && { color: '#ef4444' },
                            ]}
                          >
                            {day}
                          </Text>
                        ))}
                      </View>

                      {/* Calendar Grid */}
                      <View style={styles.pickerGrid}>
                        {getPickerDaysArray().map((day, index) => {
                          if (day === null) {
                            return <View key={`empty-${index}`} style={styles.pickerDayCell} />;
                          }

                          const isSelected = isPickerDateSelected(day);
                          const dayOfWeek = (new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day)).getDay();
                          const isSunday = dayOfWeek === 0;

                          return (
                            <Pressable
                              key={day}
                              style={styles.pickerDayCell}
                              onPress={() => {
                                const selectedDate = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day);
                                closeDatePicker(selectedDate);
                              }}
                            >
                              {isSelected ? (
                                <LinearGradient
                                  colors={['#ef4444', '#ec4899']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.pickerDayCellInner}
                                >
                                  <Text style={styles.pickerDayTextSelected}>
                                    {day}
                                  </Text>
                                </LinearGradient>
                              ) : (
                                <View style={styles.pickerDayCellInner}>
                                  <Text
                                    style={[
                                      styles.pickerDayText,
                                      isSunday && { color: '#ef4444' },
                                    ]}
                                  >
                                    {day}
                                  </Text>
                                </View>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </>
                )}
              </Animated.View>
            </BlurView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  bannerAd: {
    position: 'absolute',
    bottom: BANNER_AD_BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(SPACING.lg),
    paddingBottom: scale(170),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  headerSubtitle: {
    fontSize: scaleFont(14),
    color: COLORS.mutedForeground,
    fontWeight: '400',
    marginTop: scale(4),
  },
  // Icon button - circular style
  settingsButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonRound: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(16),
    marginBottom: scale(SPACING.md),
  },
  monthNavButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearText: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: scale(120),
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: scale(SPACING.md),
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: scaleFont(12),
    color: COLORS.mutedForeground,
    fontWeight: '500',
  },
  dayNameSunday: {
    color: COLORS.status.error,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: scale(SPACING.lg),
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: scale(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: scale(RADIUS.full),
    position: 'relative',
  },
  missionCell: {
    overflow: 'hidden',
  },
  missionImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  missionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.glass.black30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Selection overlay for mission cells - positioned on top without affecting image size
  missionSelectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(2),
  },
  missionTodayIndicator: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  missionSelectedIndicator: {
    borderColor: '#E8DCC4',
    shadowColor: '#E8DCC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  missionDayText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: COLORS.white,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: scale(2) },
    textShadowRadius: scale(8),
  },
  todayBorder: {
    borderWidth: scale(2),
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  selectedBorder: {
    borderWidth: scale(2),
    borderColor: '#E8DCC4',
    shadowColor: '#E8DCC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  todayCell: {
    backgroundColor: COLORS.glass.white10,
    borderWidth: scale(2),
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  todayDayText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    color: COLORS.foreground,
  },
  selectedCell: {
    backgroundColor: COLORS.glass.white08,
    borderWidth: scale(2),
    borderColor: '#E8DCC4',
    shadowColor: '#E8DCC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: scale(8),
  },
  selectedDayText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    color: COLORS.foreground,
  },
  normalDayText: {
    fontSize: scaleFont(14),
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  redDayText: {
    color: COLORS.status.error,
  },
  periodDot: {
    position: 'absolute',
    top: scale(4),
    right: scale(4),
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#ec4899',
  },
  ovulationDot: {
    position: 'absolute',
    top: scale(4),
    right: scale(4),
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#eab308',
  },
  fertileDot: {
    position: 'absolute',
    top: scale(4),
    right: scale(4),
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#93c5fd',
  },
  todoDot: {
    position: 'absolute',
    top: '78%',
    width: scale(18),
    height: scale(3),
    borderRadius: scale(2),
    backgroundColor: '#E8DCC4',
  },
  todaySection: {
    marginTop: scale(SPACING.lg),
    paddingBottom: scale(SPACING.lg),
  },
  todaySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(SPACING.sm),
  },
  todaySectionTitle: {
    fontSize: scaleFont(24),
    color: COLORS.white,
    fontWeight: '600',
  },
  // Separator - aligned with figma-designs separator.tsx
  divider: {
    height: scale(1),
    backgroundColor: COLORS.border,
    marginBottom: scale(SPACING.md),
  },
  todoList: {
    gap: scale(4),
  },
  // Empty state card - aligned with figma-designs card.tsx
  emptyTodoCard: {
    padding: scale(24),
    borderRadius: scale(20),
    backgroundColor: COLORS.card,
    borderWidth: scale(1),
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyTodoText: {
    fontSize: scaleFont(18),
    color: COLORS.text.secondary,
    fontWeight: '500',
    marginBottom: scale(12),
  },
  emptyTodoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  emptyTodoHintText: {
    fontSize: scaleFont(14),
    color: COLORS.text.muted,
    fontWeight: '400',
  },
  // Swipeable Todo Item styles
  todoItemWrapper: {
    position: 'relative',
    marginBottom: scale(4),
  },
  todoActionsContainer: {
    position: 'absolute',
    right: scale(4),
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: scale(8),
    paddingRight: scale(4),
    zIndex: 0,
  },
  // Edit button - matches anniversary card style
  todoEditButton: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(25),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.1,
    shadowRadius: scale(4),
  },
  // Delete button - matches anniversary card style
  todoDeleteButton: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(25),
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.3,
    shadowRadius: scale(4),
  },
  // Button text labels
  todoEditButtonText: {
    fontSize: scaleFont(10),
    color: COLORS.black,
    fontWeight: '600',
    marginTop: scale(2),
  },
  todoDeleteButtonText: {
    fontSize: scaleFont(10),
    color: COLORS.white,
    fontWeight: '600',
    marginTop: scale(2),
  },
  // Todo item card - maximum rounded
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: scale(999),
    backgroundColor: COLORS.card,
    borderWidth: scale(1),
    borderColor: COLORS.border,
    gap: scale(12),
    zIndex: 1,
  },
  todoCheckbox: {
    flexShrink: 0,
  },
  todoCheckboxCompleted: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoText: {
    flex: 1,
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '400',
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  periodSection: {
    marginTop: scale(SPACING.xl),
    paddingBottom: scale(SPACING.lg),
  },
  periodSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(SPACING.sm),
  },
  periodSectionTitle: {
    fontSize: scaleFont(24),
    color: COLORS.white,
    fontWeight: '600',
  },
  // Period empty card - aligned with figma-designs card.tsx
  emptyPeriodCard: {
    padding: scale(24),
    borderRadius: scale(20),
    backgroundColor: COLORS.card,
    borderWidth: scale(1),
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: scale(12),
  },
  periodIconLarge: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(RADIUS.full),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPeriodTitle: {
    fontSize: scaleFont(18),
    color: COLORS.foreground,
    fontWeight: '600',
  },
  periodDataContainer: {
    gap: scale(12),
  },
  // Next period card - aligned with figma-designs card.tsx
  nextPeriodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: scale(16),
    borderRadius: scale(20),
    borderWidth: scale(1),
    borderColor: COLORS.border,
  },
  nextPeriodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  periodIconSmall: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(RADIUS.full),
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextPeriodLabel: {
    fontSize: scaleFont(12),
    color: COLORS.text.tertiary,
    fontWeight: '500',
  },
  nextPeriodDate: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  dDayBadge: {
    backgroundColor: COLORS.glass.white20,
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: scale(RADIUS.sm),
  },
  dDayText: {
    fontSize: scaleFont(14),
    color: COLORS.white,
    fontWeight: '700',
  },
  cycleInfoRow: {
    flexDirection: 'row',
    gap: scale(12),
  },
  cycleInfoCard: {
    flex: 1,
    padding: scale(16),
    borderRadius: scale(20),
    borderWidth: scale(1),
    borderColor: COLORS.border,
  },
  cycleInfoLabel: {
    fontSize: scaleFont(12),
    color: COLORS.text.tertiary,
    fontWeight: '500',
    marginBottom: scale(4),
  },
  cycleInfoValue: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: scale(16),
    marginTop: scale(8),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  legendDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  legendText: {
    fontSize: scaleFont(12),
    color: COLORS.text.tertiary,
    fontWeight: '400',
  },
  // Modal styles - aligned with figma-designs dialog.tsx (glassmorphism)
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurOverlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(SPACING.lg),
  },
  // Figma: bg-white/30 backdrop-blur-xl border-white/40 rounded-[32px]
  modalContent: {
    width: width - scale(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: scale(32),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  // Figma: border-b border-white/30
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: scale(20),
  },
  modalHeaderDivider: {
    height: scale(1),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: scale(24),
  },
  // Figma: fontSize 20px, fontWeight 600
  modalTitle: {
    fontSize: scaleFont(20),
    color: COLORS.foreground,
    fontWeight: '600',
    lineHeight: scaleFont(28),
  },
  // Figma: p-2 rounded-full hover:bg-white/20
  modalCloseButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(24),
    gap: scale(16),
  },
  modalDescription: {
    fontSize: scaleFont(14),
    color: COLORS.mutedForeground,
    fontWeight: '400',
    lineHeight: scaleFont(20),
  },
  modalFooter: {
    paddingHorizontal: scale(24),
    paddingBottom: scale(24),
  },
  // Button styles - rounded like navigation bar
  // Figma: primary button - bg-white text-black, very rounded
  modalDoneButton: {
    height: scale(44),
    backgroundColor: COLORS.white,
    paddingHorizontal: scale(24),
    borderRadius: scale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneButtonText: {
    fontSize: scaleFont(15),
    color: COLORS.black,
    fontWeight: '600',
  },
  modalAddButtonFull: {
    width: '100%',
    height: scale(44),
    backgroundColor: COLORS.white,
    borderRadius: scale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddButtonDisabled: {
    opacity: 0.6,
  },
  modalAddButtonText: {
    fontSize: scaleFont(15),
    color: COLORS.black,
    fontWeight: '600',
  },
  // Figma: primary button - bg-white text-black, very rounded
  modalSaveButton: {
    height: scale(44),
    backgroundColor: COLORS.white,
    paddingHorizontal: scale(24),
    borderRadius: scale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveButtonText: {
    fontSize: scaleFont(15),
    color: COLORS.black,
    fontWeight: '600',
  },
  // Feature card - aligned with figma-designs card.tsx
  // Figma: bg-white/20 border-2 border-white/30 rounded-2xl
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: scale(2),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: scale(16),
  },
  // Figma: active - bg-white/30 border-white
  featureCardActive: {
    borderColor: COLORS.white,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  checkCircleActive: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconRound: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(RADIUS.full),
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
    marginBottom: scale(4),
  },
  featureDescription: {
    fontSize: scaleFont(14),
    color: COLORS.text.tertiary,
    fontWeight: '400',
  },
  // Input styles - aligned with figma-designs input.tsx & textarea.tsx
  // Figma: bg-white/10 border-white/20 rounded-2xl
  todoInputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scale(16),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
  },
  todoInput: {
    fontSize: scaleFont(14),
    color: COLORS.foreground,
    fontWeight: '400',
    minHeight: scale(72),
    textAlignVertical: 'top',
    lineHeight: scaleFont(20),
  },
  todoInputCount: {
    fontSize: scaleFont(12),
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'right',
    marginTop: scale(8),
  },
  // Period settings - aligned with figma-designs input.tsx
  periodSettingSection: {
    marginBottom: scale(20),
  },
  periodSettingLabel: {
    fontSize: scaleFont(14),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    marginBottom: scale(10),
  },
  // Figma: bg-white/10 border-white/20 rounded-2xl
  periodSettingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: scale(12),
  },
  // Gradient background for period settings icons
  settingIconRound: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSettingInfo: {
    flex: 1,
  },
  periodSettingHint: {
    fontSize: scaleFont(12),
    color: COLORS.mutedForeground,
    fontWeight: '400',
  },
  periodSettingValue: {
    fontSize: scaleFont(14),
    color: COLORS.foreground,
    fontWeight: '500',
  },
  // Figma: bg-white/10 border-white/20 rounded-2xl
  cycleInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: scale(12),
  },
  cycleInput: {
    flex: 1,
    fontSize: scaleFont(14),
    color: COLORS.foreground,
    fontWeight: '500',
  },
  cycleUnit: {
    fontSize: scaleFont(14),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },
  infoTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    marginTop: scale(8),
  },
  infoText: {
    fontSize: scaleFont(12),
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },
  // Date Picker styles - aligned with figma-designs calendar.tsx
  pickerMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(8),
    paddingVertical: scale(8),
    marginBottom: scale(12),
  },
  pickerNavButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMonthText: {
    fontSize: scaleFont(16),
    color: COLORS.foreground,
    fontWeight: '600',
  },
  pickerDayNames: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: scale(8),
    paddingHorizontal: scale(4),
  },
  pickerDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: scaleFont(12),
    color: COLORS.mutedForeground,
    fontWeight: '500',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: scale(4),
  },
  pickerDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(2),
  },
  pickerDayCellInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: scale(100),
  },
  pickerDayText: {
    fontSize: scaleFont(14),
    color: COLORS.foreground,
    fontWeight: '400',
  },
  pickerDayTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
});
