import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Heart, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { GlassCard, GlassButton } from '@/components/glass';
import { useAuthStore } from '@/stores';
import type { AnniversaryType } from '@/types';

const { width, height } = Dimensions.get('window');
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800';

const ANNIVERSARY_TYPES: { type: AnniversaryType; label: string; emoji: string }[] = [
  { type: '연애 시작일', label: '연애 시작일', emoji: '💕' },
  { type: '결혼 기념일', label: '결혼 기념일', emoji: '💍' },
  { type: '첫 만남', label: '첫 만남', emoji: '✨' },
  { type: '아이 출생일', label: '아이 출생일', emoji: '👶' },
];

export default function AnniversaryScreen() {
  const router = useRouter();
  const { setIsOnboardingComplete } = useAuthStore();

  const [selectedType, setSelectedType] = useState<AnniversaryType | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };
  const days = Array.from(
    { length: getDaysInMonth(selectedYear, selectedMonth) },
    (_, i) => i + 1
  );

  const handleComplete = async () => {
    if (!selectedType) {
      Alert.alert('알림', '기념일 종류를 선택해주세요.');
      return;
    }

    setLoading(true);
    // TODO: Save to Supabase
    setTimeout(() => {
      setLoading(false);
      setIsOnboardingComplete(true);
      router.replace('/(tabs)');
    }, 1000);
  };

  const handleSkip = () => {
    Alert.alert(
      '건너뛰기',
      '기념일은 나중에 설정에서 변경할 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '건너뛰기',
          onPress: () => {
            setIsOnboardingComplete(true);
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  const calculateDday = () => {
    if (!selectedYear || !selectedMonth || !selectedDay) return null;
    const anniversary = new Date(selectedYear, selectedMonth - 1, selectedDay);
    const today = new Date();
    const diff = Math.floor(
      (today.getTime() - anniversary.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff + 1;
  };

  const dday = calculateDday();

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: BACKGROUND_IMAGE }}
        style={styles.backgroundImage}
        blurRadius={25}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
          style={styles.overlay}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '66%' }]} />
          </View>
          <Text style={styles.progressText}>2/3</Text>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.iconWrapper}>
            <Calendar size={32} color={COLORS.primary} />
          </View>

          <Text style={styles.cardTitle}>기념일 설정</Text>
          <Text style={styles.cardDescription}>
            특별한 날을 기록하고{'\n'}D-day를 함께 세어보세요
          </Text>

          {/* Anniversary Type Selection */}
          <Text style={styles.sectionTitle}>기념일 종류</Text>
          <View style={styles.typeGrid}>
            {ANNIVERSARY_TYPES.map((item) => (
              <TouchableOpacity
                key={item.type}
                style={[
                  styles.typeCard,
                  selectedType === item.type && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType(item.type)}
                activeOpacity={0.7}
              >
                <Text style={styles.typeEmoji}>{item.emoji}</Text>
                <Text
                  style={[
                    styles.typeLabel,
                    selectedType === item.type && styles.typeLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
                {selectedType === item.type && (
                  <View style={styles.checkIcon}>
                    <Check size={16} color={COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Date Selection */}
          <Text style={styles.sectionTitle}>날짜 선택</Text>
          <View style={styles.dateContainer}>
            {/* Year */}
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>년</Text>
              <ScrollView
                style={styles.dateScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.dateItem,
                      selectedYear === year && styles.dateItemSelected,
                    ]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Text
                      style={[
                        styles.dateItemText,
                        selectedYear === year && styles.dateItemTextSelected,
                      ]}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Month */}
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>월</Text>
              <ScrollView
                style={styles.dateScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {months.map((month) => (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.dateItem,
                      selectedMonth === month && styles.dateItemSelected,
                    ]}
                    onPress={() => setSelectedMonth(month)}
                  >
                    <Text
                      style={[
                        styles.dateItemText,
                        selectedMonth === month && styles.dateItemTextSelected,
                      ]}
                    >
                      {month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Day */}
            <View style={styles.dateColumn}>
              <Text style={styles.dateLabel}>일</Text>
              <ScrollView
                style={styles.dateScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {days.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dateItem,
                      selectedDay === day && styles.dateItemSelected,
                    ]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text
                      style={[
                        styles.dateItemText,
                        selectedDay === day && styles.dateItemTextSelected,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* D-day Preview */}
          {dday && dday > 0 && (
            <View style={styles.ddayContainer}>
              <Heart size={20} color={COLORS.primary} fill={COLORS.primary} />
              <Text style={styles.ddayText}>D+{dday}</Text>
            </View>
          )}

          <GlassButton
            onPress={handleComplete}
            variant="primary"
            fullWidth
            loading={loading}
            style={styles.completeButton}
          >
            완료
          </GlassButton>

          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>나중에 설정하기</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
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
    width,
    height,
  },
  overlay: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.massive,
    paddingBottom: SPACING.xxxl,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.glass.white20,
    borderRadius: 2,
    marginRight: SPACING.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressText: {
    color: COLORS.glass.white60,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  card: {
    padding: SPACING.xl,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.glass.white10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  cardDescription: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  typeCard: {
    width: '48%',
    padding: SPACING.md,
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
    alignItems: 'center',
    position: 'relative',
  },
  typeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255, 107, 157, 0.15)',
  },
  typeEmoji: {
    fontSize: 28,
    marginBottom: SPACING.xs,
  },
  typeLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white70,
  },
  typeLabelSelected: {
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  checkIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  dateColumn: {
    flex: 1,
  },
  dateLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white60,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  dateScroll: {
    height: 150,
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.lg,
  },
  dateItem: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  dateItemSelected: {
    backgroundColor: COLORS.glass.white20,
  },
  dateItemText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
  },
  dateItemTextSelected: {
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  ddayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
    padding: SPACING.md,
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.lg,
  },
  ddayText: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary,
  },
  completeButton: {
    marginTop: SPACING.sm,
  },
  skipButton: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  skipText: {
    color: COLORS.glass.white50,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
});
