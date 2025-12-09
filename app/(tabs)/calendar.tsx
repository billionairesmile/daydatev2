import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Settings,
  Pen,
  X,
  Circle,
  Check,
  Trash2,
  Droplet,
  Calendar as CalendarIcon,
  Clock,
  Info,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react-native';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useMemoryStore, SAMPLE_MEMORIES } from '@/stores/memoryStore';

const { width, height } = Dimensions.get('window');

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

interface Todo {
  id: string;
  date: string;
  text: string;
  completed: boolean;
}

// Swipeable Todo Item Component
function SwipeableTodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const itemOpacity = useRef(new Animated.Value(1)).current;
  const itemScale = useRef(new Animated.Value(1)).current;
  const itemHeight = useRef(new Animated.Value(1)).current;
  const isSwipedRef = useRef(false);
  const gestureStartedRef = useRef(false);

  // Interpolate delete button opacity based on swipe distance
  const deleteButtonOpacity = translateX.interpolate({
    inputRange: [-64, -20, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  // Interpolate delete button scale for nice effect
  const deleteButtonScale = translateX.interpolate({
    inputRange: [-64, -32, 0],
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
        // Extract current value for smooth continuation
        translateX.extractOffset();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        if (!gestureStartedRef.current) return;

        // Calculate new position
        let newValue = gesture.dx;

        // Limit the swipe range
        if (newValue < -64) {
          // Add resistance beyond threshold
          newValue = -64 + (newValue + 64) * 0.2;
        } else if (newValue > 0) {
          // Allow slight overswipe when closing
          newValue = newValue * 0.3;
        }

        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gesture) => {
        gestureStartedRef.current = false;
        translateX.flattenOffset();

        // Get current animated value
        const currentValue = (translateX as any)._value || 0;
        const velocity = gesture.vx;

        // Use velocity and position to determine final state
        const shouldOpen = currentValue < -24 || velocity < -0.3;
        const shouldClose = currentValue > -40 || velocity > 0.3;

        if (shouldOpen && !shouldClose) {
          Animated.spring(translateX, {
            toValue: -64,
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

  const handleDelete = () => {
    // Smooth delete animation: fade out + scale down + collapse
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
      onDelete();
    });
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
      {/* Delete Button - Hidden until swiped with animated opacity */}
      <Animated.View
        style={[
          styles.deleteButtonContainer,
          {
            opacity: deleteButtonOpacity,
            transform: [{ scale: deleteButtonScale }],
          }
        ]}
      >
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Trash2 color={COLORS.white} size={18} strokeWidth={2} />
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
              <Check color={COLORS.black} size={14} strokeWidth={3} />
            </View>
          ) : (
            <Circle
              color="rgba(255,255,255,0.4)"
              size={20}
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
  const { backgroundImage } = useBackground();
  const { memories } = useMemoryStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isAddTodoOpen, setIsAddTodoOpen] = useState(false);
  const [todoText, setTodoText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [menstrualTrackingEnabled, setMenstrualTrackingEnabled] = useState(false);
  const [tempMenstrualEnabled, setTempMenstrualEnabled] = useState(false);
  const [isPeriodSettingsOpen, setIsPeriodSettingsOpen] = useState(false);
  const [hasPeriodData, setHasPeriodData] = useState(false);
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | null>(null);
  const [cycleLength, setCycleLength] = useState(28);
  const [tempCycleLength, setTempCycleLength] = useState('28');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [tempLastPeriodDate, setTempLastPeriodDate] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  // Keyboard animation for modals
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Modal animations
  const settingsOpacity = useRef(new Animated.Value(0)).current;
  const todoOpacity = useRef(new Animated.Value(0)).current;
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

  const closeSettingsModal = (saveChanges = false) => {
    Animated.timing(settingsOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (saveChanges) {
        setMenstrualTrackingEnabled(tempMenstrualEnabled);
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

  const openPeriodModal = () => {
    periodOpacity.setValue(0);
    setIsPeriodSettingsOpen(true);
    Animated.timing(periodOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closePeriodModal = (save = false) => {
    Keyboard.dismiss();
    Animated.timing(periodOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (save) {
        const parsedCycle = parseInt(tempCycleLength, 10);
        if (!isNaN(parsedCycle) && parsedCycle >= 21 && parsedCycle <= 35) {
          setCycleLength(parsedCycle);
        }
        setLastPeriodDate(tempLastPeriodDate);
        setHasPeriodData(true);
      }
      setIsPeriodSettingsOpen(false);
    });
  };

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
    // First check actual memories from store (includes newly completed missions)
    const memoryForDate = memories.find((memory) => {
      const completedDate = new Date(memory.completedAt);
      return (
        completedDate.getFullYear() === year &&
        completedDate.getMonth() === month &&
        completedDate.getDate() === day
      );
    });

    if (memoryForDate) {
      return {
        imageUrl: memoryForDate.photoUrl,
        title: memoryForDate.mission?.title || '미션 완료',
      };
    }

    // Then check SAMPLE_MEMORIES for development data
    const sampleMemory = SAMPLE_MEMORIES.find((memory) => {
      const completedDate = new Date(memory.completedAt);
      return (
        completedDate.getFullYear() === year &&
        completedDate.getMonth() === month &&
        completedDate.getDate() === day
      );
    });

    if (sampleMemory) {
      return {
        imageUrl: sampleMemory.photoUrl,
        title: sampleMemory.mission?.title || '미션 완료',
      };
    }

    // No mission data found
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

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const handleDateClick = (day: number) => {
    if (selectedDate === day) {
      setSelectedDate(null);
    } else if (isToday(day)) {
      setSelectedDate(null);
    } else {
      setSelectedDate(day);
    }
  };

  // Period tracking helpers
  const isPeriodDay = (day: number): boolean => {
    if (!lastPeriodDate || !menstrualTrackingEnabled) return false;
    const currentDayDate = new Date(year, month, day);

    for (let cycleOffset = -5; cycleOffset <= 3; cycleOffset++) {
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

    for (let cycleOffset = -5; cycleOffset <= 3; cycleOffset++) {
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

    for (let cycleOffset = -5; cycleOffset <= 3; cycleOffset++) {
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

    const today = new Date();
    const nextPeriodDate = new Date(lastPeriodDate);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);

    const dDay = Math.ceil(
      (nextPeriodDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return { nextPeriodDate, dDay };
  };

  const periodInfo = calculatePeriodInfo();

  // Todo functions
  const getTodosForDate = (day: number) => {
    const dateKey = `${year}-${month + 1}-${day}`;
    return todos.filter((todo) => todo.date === dateKey);
  };

  const getCurrentDateTodos = () => {
    const today = new Date();
    const targetDay = selectedDate || today.getDate();
    return getTodosForDate(targetDay);
  };

  const handleAddTodo = () => {
    if (todoText.trim()) {
      const today = new Date();
      const targetDay = selectedDate || today.getDate();
      const newTodo: Todo = {
        id: Date.now().toString(),
        date: `${year}-${month + 1}-${targetDay}`,
        text: todoText,
        completed: false,
      };
      setTodos([...todos, newTodo]);
      setTodoText('');
      setIsAddTodoOpen(false);
    }
  };

  const toggleTodoComplete = (id: string) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((todo) => todo.id !== id));
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
      <ImageBackground
        source={backgroundImage}
        defaultSource={require('@/assets/images/backgroundimage.png')}
        style={styles.backgroundImage}
        imageStyle={styles.backgroundImageStyle}
        blurRadius={40}
      />
      <View style={styles.overlay} />

      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>캘린더</Text>
          <Text style={styles.headerSubtitle}>우리의 시간을 기록해요</Text>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={openSettingsModal}
        >
          <Settings color={COLORS.white} size={20} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Calendar Header - Month/Year with Navigation */}
        <View style={styles.monthYearContainer}>
          <Pressable
            style={styles.monthNavButton}
            onPress={() => {
              setCurrentDate(new Date(year, month - 1, 1));
              setSelectedDate(null);
            }}
          >
            <ChevronLeft color={COLORS.white} size={20} strokeWidth={2} />
          </Pressable>
          <Text style={styles.monthYearText}>
            {MONTH_NAMES_EN[month]} {year}
          </Text>
          <Pressable
            style={styles.monthNavButton}
            onPress={() => {
              setCurrentDate(new Date(year, month + 1, 1));
              setSelectedDate(null);
            }}
          >
            <ChevronRight color={COLORS.white} size={20} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Day Names */}
        <View style={styles.dayNamesRow}>
          {DAY_NAMES.map((day, index) => (
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
            const isSelectedDay = selectedDate === day;
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
                      isTodayDay && styles.todayBorder,
                      isSelectedDay && !isTodayDay && styles.selectedBorder,
                    ]}
                  >
                    <Image
                      source={{ uri: mission.imageUrl }}
                      style={styles.missionImage}
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
              {selectedDate ? `${month + 1}월 ${selectedDate}일` : '오늘'}
            </Text>
            <Pressable
              style={styles.iconButtonRound}
              onPress={openTodoModal}
            >
              <Pen color={COLORS.white} size={18} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.divider} />

          {/* Todo List */}
          <View style={styles.todoList}>
            {getCurrentDateTodos().length === 0 ? (
              <View style={styles.emptyTodoCard}>
                <Text style={styles.emptyTodoText}>할 일이 없습니다</Text>
                <View style={styles.emptyTodoHint}>
                  <Pen color="rgba(255,255,255,0.5)" size={16} strokeWidth={2} />
                  <Text style={styles.emptyTodoHintText}>버튼을 눌러 추가해보세요</Text>
                </View>
              </View>
            ) : (
              getCurrentDateTodos().map((todo) => (
                <SwipeableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => toggleTodoComplete(todo.id)}
                  onDelete={() => deleteTodo(todo.id)}
                />
              ))
            )}
          </View>
        </View>

        {/* Menstrual Information Section */}
        {menstrualTrackingEnabled && (
          <View style={styles.periodSection}>
            <View style={styles.periodSectionHeader}>
              <Text style={styles.periodSectionTitle}>월경 정보</Text>
              <Pressable
                style={styles.iconButtonRound}
                onPress={openPeriodModal}
              >
                <Pen color={COLORS.white} size={18} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.divider} />

            {!hasPeriodData ? (
              <View style={styles.emptyPeriodCard}>
                <LinearGradient
                  colors={['#ef4444', '#ec4899']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.periodIconLarge}
                >
                  <Droplet color={COLORS.white} size={32} strokeWidth={2} />
                </LinearGradient>
                <Text style={styles.emptyPeriodTitle}>월경 정보를 입력해주세요</Text>
              </View>
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
                        <Droplet color={COLORS.white} size={20} strokeWidth={2} />
                      </LinearGradient>
                      <View>
                        <Text style={styles.nextPeriodLabel}>다음 예정일</Text>
                        <Text style={styles.nextPeriodDate}>
                          {periodInfo.nextPeriodDate.getMonth() + 1}월{' '}
                          {periodInfo.nextPeriodDate.getDate()}일
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
                    <Text style={styles.cycleInfoLabel}>평균 주기</Text>
                    <Text style={styles.cycleInfoValue}>{cycleLength}일</Text>
                  </View>
                  {lastPeriodDate && (
                    <View style={[styles.cycleInfoCard, { backgroundColor: 'rgba(219, 234, 254, 0.3)' }]}>
                      <Text style={styles.cycleInfoLabel}>지난 시작일</Text>
                      <Text style={styles.cycleInfoValue}>
                        {lastPeriodDate.getMonth() + 1}월 {lastPeriodDate.getDate()}일
                      </Text>
                    </View>
                  )}
                </View>

                {/* Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#ec4899' }]} />
                    <Text style={styles.legendText}>월경일</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#93c5fd' }]} />
                    <Text style={styles.legendText}>가임기</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
                    <Text style={styles.legendText}>배란일 예상</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={isSettingsOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeSettingsModal(false)}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: settingsOpacity }]}>
          <BlurView intensity={60} tint="dark" style={styles.blurOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>캘린더 기능 설정</Text>
                <Pressable
                  onPress={() => closeSettingsModal(false)}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.modalHeaderDivider} />

              <View style={styles.modalBody}>
                <Text style={styles.modalDescription}>표시할 기능을 선택하세요</Text>

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
                    <Droplet color={COLORS.white} size={24} strokeWidth={2} />
                  </LinearGradient>
                  <View style={styles.featureInfo}>
                    <Text style={styles.featureTitle}>월경 캘린더</Text>
                    <Text style={styles.featureDescription}>
                      월경 주기를 추적하고 예측할 수 있어요
                    </Text>
                  </View>
                  {tempMenstrualEnabled ? (
                    <View style={styles.checkCircleActive}>
                      <Check color={COLORS.black} size={16} strokeWidth={3} />
                    </View>
                  ) : (
                    <Circle color="rgba(255,255,255,0.4)" size={24} strokeWidth={2} />
                  )}
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalDoneButton}
                  onPress={() => closeSettingsModal(true)}
                >
                  <Text style={styles.modalDoneButtonText}>완료</Text>
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
            <BlurView intensity={60} tint="dark" style={styles.blurOverlay}>
              <Animated.View style={[styles.modalContent, { transform: [{ translateY: keyboardOffset }] }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>할 일을 입력하세요</Text>
                  <Pressable
                    onPress={closeTodoModal}
                    style={styles.modalCloseButton}
                  >
                    <X color="rgba(255,255,255,0.8)" size={20} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.modalHeaderDivider} />

                <View style={styles.modalBody}>
                  <View style={styles.todoInputContainer}>
                    <TextInput
                      style={styles.todoInput}
                      placeholder="예: 영화 예매하기"
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
                  <Pressable style={styles.modalAddButtonFull} onPress={handleAddTodo}>
                    <Text style={styles.modalAddButtonText}>추가</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </BlurView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Period Settings Modal */}
      <Modal
        visible={isPeriodSettingsOpen}
        transparent
        animationType="none"
        onRequestClose={() => closePeriodModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.modalOverlay, { opacity: periodOpacity }]}>
            <BlurView intensity={60} tint="dark" style={styles.blurOverlay}>
              <Animated.View style={[styles.modalContent, { transform: [{ translateY: keyboardOffset }] }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>월경 정보 설정</Text>
                <Pressable
                  onPress={() => closePeriodModal(false)}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.modalHeaderDivider} />

              <View style={styles.modalBody}>
                {/* Last Period Date */}
                <View style={styles.periodSettingSection}>
                  <Text style={styles.periodSettingLabel}>생리 시작일</Text>
                  <Pressable
                    style={styles.periodSettingButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setPickerMonth(tempLastPeriodDate);
                      setIsPeriodSettingsOpen(false);
                      setIsDatePickerOpen(true);
                    }}
                  >
                    <LinearGradient
                      colors={['#ef4444', '#ec4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.settingIconRound}
                    >
                      <CalendarIcon color={COLORS.white} size={18} strokeWidth={2} />
                    </LinearGradient>
                    <View style={styles.periodSettingInfo}>
                      <Text style={styles.periodSettingHint}>마지막 생리 시작일</Text>
                      <Text style={styles.periodSettingValue}>
                        {tempLastPeriodDate.getFullYear()}년 {tempLastPeriodDate.getMonth() + 1}월 {tempLastPeriodDate.getDate()}일
                      </Text>
                    </View>
                    <ChevronRight color="rgba(255,255,255,0.4)" size={20} strokeWidth={2} />
                  </Pressable>
                </View>

                {/* Cycle Length */}
                <View style={[styles.periodSettingSection, { marginTop: -8, marginBottom: 4 }]}>
                  <Text style={styles.periodSettingLabel}>평균 주기</Text>
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
                      <Clock color={COLORS.white} size={18} strokeWidth={2} />
                    </LinearGradient>
                    <TextInput
                      style={styles.cycleInput}
                      value={tempCycleLength}
                      onChangeText={setTempCycleLength}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Text style={styles.cycleUnit}>일</Text>
                  </Pressable>
                  <View style={styles.infoTextContainer}>
                    <Info color="rgba(255, 255, 255, 0.5)" size={14} strokeWidth={2} />
                    <Text style={styles.infoText}>일반적인 생리 주기는 21~35일입니다</Text>
                  </View>
                </View>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalSaveButton}
                  onPress={() => closePeriodModal(true)}
                >
                  <Text style={styles.modalSaveButtonText}>저장하기</Text>
                </Pressable>
              </View>
              </Animated.View>
            </BlurView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={isDatePickerOpen}
        transparent
        animationType="none"
        onRequestClose={() => {
          setIsDatePickerOpen(false);
          openPeriodModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={60} tint="dark" style={styles.blurOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>날짜 선택</Text>
                <Pressable
                  onPress={() => {
                    setIsDatePickerOpen(false);
                    openPeriodModal();
                  }}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} strokeWidth={2} />
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
                  <ChevronLeft color={COLORS.foreground} size={18} />
                </Pressable>
                <Text style={styles.pickerMonthText}>
                  {pickerMonth.getFullYear()}년 {pickerMonth.getMonth() + 1}월
                </Text>
                <Pressable
                  onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                  style={styles.pickerNavButton}
                >
                  <ChevronRight color={COLORS.foreground} size={18} />
                </Pressable>
              </View>

              {/* Day Names */}
              <View style={styles.pickerDayNames}>
                {DAY_NAMES.map((day, idx) => (
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
                        setTempLastPeriodDate(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day));
                        setIsDatePickerOpen(false);
                        openPeriodModal();
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
            </View>
          </BlurView>
        </View>
      </Modal>

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
    width: width,
    height: height,
  },
  backgroundImageStyle: {
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.glass.black40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.mutedForeground,
    fontWeight: '400',
    marginTop: 4,
  },
  // Icon button - circular style
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonRound: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: SPACING.md,
  },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: 120,
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 12,
    color: COLORS.mutedForeground,
    fontWeight: '500',
  },
  dayNameSunday: {
    color: COLORS.status.error,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.lg,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
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
  missionDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  todayBorder: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  selectedBorder: {
    borderWidth: 2,
    borderColor: '#E8DCC4',
    shadowColor: '#E8DCC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  todayCell: {
    backgroundColor: COLORS.glass.white10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  todayDayText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  selectedCell: {
    backgroundColor: COLORS.glass.white08,
    borderWidth: 2,
    borderColor: '#E8DCC4',
    shadowColor: '#E8DCC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  selectedDayText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  normalDayText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  redDayText: {
    color: COLORS.status.error,
  },
  periodDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ec4899',
  },
  ovulationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eab308',
  },
  fertileDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#93c5fd',
  },
  todoDot: {
    position: 'absolute',
    top: '78%',
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E8DCC4',
  },
  todaySection: {
    marginTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  todaySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  todaySectionTitle: {
    fontSize: 24,
    color: COLORS.white,
    fontWeight: '600',
  },
  // Separator - aligned with figma-designs separator.tsx
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  todoList: {
    gap: 4,
  },
  // Empty state card - aligned with figma-designs card.tsx
  emptyTodoCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyTodoText: {
    fontSize: 18,
    color: COLORS.text.secondary,
    fontWeight: '500',
    marginBottom: 12,
  },
  emptyTodoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyTodoHintText: {
    fontSize: 14,
    color: COLORS.text.muted,
    fontWeight: '400',
  },
  // Swipeable Todo Item styles
  todoItemWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 0,
  },
  // Destructive button - matches todo item height
  deleteButton: {
    width: 56,
    height: '100%',
    borderRadius: 28,
    backgroundColor: COLORS.destructive,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.destructive,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Todo item card - maximum rounded
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    zIndex: 1,
  },
  todoCheckbox: {
    flexShrink: 0,
  },
  todoCheckboxCompleted: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '400',
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  periodSection: {
    marginTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  periodSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  periodSectionTitle: {
    fontSize: 24,
    color: COLORS.white,
    fontWeight: '600',
  },
  // Period empty card - aligned with figma-designs card.tsx
  emptyPeriodCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: 12,
  },
  periodIconLarge: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPeriodTitle: {
    fontSize: 18,
    color: COLORS.foreground,
    fontWeight: '600',
  },
  periodDataContainer: {
    gap: 12,
  },
  // Next period card - aligned with figma-designs card.tsx
  nextPeriodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nextPeriodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  periodIconSmall: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextPeriodLabel: {
    fontSize: 12,
    color: COLORS.text.tertiary,
    fontWeight: '500',
  },
  nextPeriodDate: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  dDayBadge: {
    backgroundColor: COLORS.glass.white20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  dDayText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '700',
  },
  cycleInfoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cycleInfoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cycleInfoLabel: {
    fontSize: 12,
    color: COLORS.text.tertiary,
    fontWeight: '500',
    marginBottom: 4,
  },
  cycleInfoValue: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
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
    paddingHorizontal: SPACING.lg,
  },
  // Figma: bg-white/30 backdrop-blur-xl border-white/40 rounded-[32px]
  modalContent: {
    width: width - 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  // Figma: border-b border-white/30
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  modalHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 24,
  },
  // Figma: fontSize 20px, fontWeight 600
  modalTitle: {
    fontSize: 20,
    color: COLORS.foreground,
    fontWeight: '600',
    lineHeight: 28,
  },
  // Figma: p-2 rounded-full hover:bg-white/20
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 16,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.mutedForeground,
    fontWeight: '400',
    lineHeight: 20,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  // Button styles - rounded like navigation bar
  // Figma: primary button - bg-white text-black, very rounded
  modalDoneButton: {
    height: 44,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  modalAddButtonFull: {
    width: '100%',
    height: 44,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  // Figma: primary button - bg-white text-black, very rounded
  modalSaveButton: {
    height: 44,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  // Feature card - aligned with figma-designs card.tsx
  // Figma: bg-white/20 border-2 border-white/30 rounded-2xl
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 16,
  },
  // Figma: active - bg-white/30 border-white
  featureCardActive: {
    borderColor: COLORS.white,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  checkCircleActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconRound: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: COLORS.text.tertiary,
    fontWeight: '400',
  },
  // Input styles - aligned with figma-designs input.tsx & textarea.tsx
  // Figma: bg-white/10 border-white/20 rounded-2xl
  todoInputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  todoInput: {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '400',
    minHeight: 72,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  todoInputCount: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'right',
    marginTop: 8,
  },
  // Period settings - aligned with figma-designs input.tsx
  periodSettingSection: {
    marginBottom: 20,
  },
  periodSettingLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    marginBottom: 10,
  },
  // Figma: bg-white/10 border-white/20 rounded-2xl
  periodSettingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 12,
  },
  // Gradient background for period settings icons
  settingIconRound: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSettingInfo: {
    flex: 1,
  },
  periodSettingHint: {
    fontSize: 12,
    color: COLORS.mutedForeground,
    fontWeight: '400',
  },
  periodSettingValue: {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '500',
  },
  // Figma: bg-white/10 border-white/20 rounded-2xl
  cycleInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 12,
  },
  cycleInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '500',
  },
  cycleUnit: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },
  infoTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },
  // Date Picker styles - aligned with figma-designs calendar.tsx
  pickerMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 12,
  },
  pickerNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMonthText: {
    fontSize: 16,
    color: COLORS.foreground,
    fontWeight: '600',
  },
  pickerDayNames: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pickerDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.mutedForeground,
    fontWeight: '500',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  pickerDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  pickerDayCellInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  pickerDayText: {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '400',
  },
  pickerDayTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
});
