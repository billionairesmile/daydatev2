import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  Animated,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Sliders,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useOnboardingStore, useAuthStore } from '@/stores';
import {
  MBTI_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  CONSTRAINT_OPTIONS,
  DATE_WORRY_OPTIONS,
  type ActivityType,
  type Constraint,
  type DateWorry,
  type CalendarType,
} from '@/stores/onboardingStore';
import { db, isDemoMode } from '@/lib/supabase';
import { formatDateToLocal } from '@/lib/dateUtils';

const { width } = Dimensions.get('window');

type EditMode = 'nickname' | 'birthday' | 'preferences-view' | 'preferences-edit' | null;

export default function MyProfileScreen() {
  const router = useRouter();
  const { data, updateData } = useOnboardingStore();
  const { user, updateNickname } = useAuthStore();

  const [editMode, setEditMode] = useState<EditMode>(null);
  const [tempNickname, setTempNickname] = useState(data.nickname);
  const [tempBirthday, setTempBirthday] = useState<Date | null>(data.birthDate ? new Date(data.birthDate) : null);
  const [tempCalendarType, setTempCalendarType] = useState<CalendarType>(data.birthDateCalendarType || 'solar');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // DatePicker animation
  const { height } = Dimensions.get('window');
  const datePickerSlideAnim = useRef(new Animated.Value(height)).current;
  const datePickerBackdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showDatePicker) {
      Animated.parallel([
        Animated.spring(datePickerSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(datePickerBackdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showDatePicker]);

  const closeDatePicker = () => {
    Animated.parallel([
      Animated.timing(datePickerSlideAnim, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(datePickerBackdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDatePicker(false);
      datePickerSlideAnim.setValue(height);
      datePickerBackdropAnim.setValue(0);
    });
  };

  // Preferences state
  const [tempMbti, setTempMbti] = useState(data.mbti);
  const [tempActivityTypes, setTempActivityTypes] = useState<ActivityType[]>(data.activityTypes);
  const [tempDateWorries, setTempDateWorries] = useState<DateWorry[]>(data.dateWorries);
  const [tempConstraints, setTempConstraints] = useState<Constraint[]>(data.constraints);

  const handleSaveNickname = async () => {
    if (tempNickname.trim()) {
      updateData({ nickname: tempNickname.trim() });
      updateNickname(tempNickname.trim());

      // Save to database
      if (!isDemoMode && user?.id) {
        try {
          await db.profiles.update(user.id, {
            nickname: tempNickname.trim(),
          });
        } catch (error) {
          console.error('Error updating nickname:', error);
        }
      }

      setEditMode(null);
    }
  };

  const handleSaveBirthday = async () => {
    if (tempBirthday) {
      updateData({ birthDate: tempBirthday, birthDateCalendarType: tempCalendarType });

      // Also update authStore user for immediate UI update
      if (user) {
        const updatedUser = {
          ...user,
          birthDate: tempBirthday,
          birthDateCalendarType: tempCalendarType,
        };
        useAuthStore.getState().setUser(updatedUser);
      }

      // Save to database
      if (!isDemoMode && user?.id) {
        try {
          const preferences = {
            mbti: data.mbti,
            gender: data.gender,
            birthDateCalendarType: tempCalendarType,
            activityTypes: data.activityTypes,
            dateWorries: data.dateWorries,
            constraints: data.constraints,
            relationshipType: data.relationshipType,
          };

          await db.profiles.update(user.id, {
            birth_date: formatDateToLocal(tempBirthday),
            preferences,
          });
        } catch (error) {
          console.error('Error updating birthday:', error);
        }
      }
    }
    setEditMode(null);
  };

  const handleSavePreferences = async () => {
    updateData({
      mbti: tempMbti,
      activityTypes: tempActivityTypes,
      dateWorries: tempDateWorries,
      constraints: tempConstraints,
    });

    // Save to database
    if (!isDemoMode && user?.id) {
      try {
        const preferences = {
          mbti: tempMbti,
          gender: data.gender,
          birthDateCalendarType: data.birthDateCalendarType,
          activityTypes: tempActivityTypes,
          dateWorries: tempDateWorries,
          constraints: tempConstraints,
          relationshipType: data.relationshipType,
        };

        await db.profiles.update(user.id, {
          preferences,
        });
      } catch (error) {
        console.error('Error updating preferences:', error);
      }
    }

    setEditMode(null);
  };

  const toggleDateWorry = (worry: DateWorry) => {
    if (tempDateWorries.includes(worry)) {
      setTempDateWorries(tempDateWorries.filter((w) => w !== worry));
    } else {
      setTempDateWorries([...tempDateWorries, worry]);
    }
  };

  const toggleActivity = (type: ActivityType) => {
    if (tempActivityTypes.includes(type)) {
      setTempActivityTypes(tempActivityTypes.filter((t) => t !== type));
    } else {
      setTempActivityTypes([...tempActivityTypes, type]);
    }
  };

  const toggleConstraint = (con: Constraint) => {
    if (con === 'none') {
      if (tempConstraints.includes('none')) {
        setTempConstraints([]);
      } else {
        setTempConstraints(['none']);
      }
    } else {
      if (tempConstraints.includes(con)) {
        setTempConstraints(tempConstraints.filter((c) => c !== con));
      } else {
        setTempConstraints([...tempConstraints.filter((c) => c !== 'none'), con]);
      }
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '설정되지 않음';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
  };

  const renderMainContent = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Nickname Section */}
      <Pressable
        style={styles.menuItem}
        onPress={() => {
          setTempNickname(data.nickname);
          setEditMode('nickname');
        }}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <User color={COLORS.black} size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>닉네임</Text>
            <Text style={styles.menuItemValue}>{data.nickname || '설정되지 않음'}</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>

      {/* Birthday Section */}
      <Pressable
        style={styles.menuItem}
        onPress={() => {
          setTempBirthday(data.birthDate ? new Date(data.birthDate) : null);
          setTempCalendarType(data.birthDateCalendarType || 'solar');
          setEditMode('birthday');
        }}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <Calendar color={COLORS.black} size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>생년월일</Text>
            <Text style={styles.menuItemValue}>
              {formatDate(data.birthDate ? new Date(data.birthDate) : null)}
              {data.birthDate && ` (${data.birthDateCalendarType === 'lunar' ? '음력' : '양력'})`}
            </Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>

      {/* Preferences Section */}
      <Pressable
        style={styles.menuItem}
        onPress={() => setEditMode('preferences-view')}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <Sliders color={COLORS.black} size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>취향 설정</Text>
            <Text style={styles.menuItemValue}>
              {data.mbti ? `${data.mbti}` : ''}
              {data.activityTypes.length > 0 ? ` · ${data.activityTypes.length}개 활동` : ''}
              {!data.mbti && data.activityTypes.length === 0 ? '설정되지 않음' : ''}
            </Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>
    </ScrollView>
  );

  const renderNicknameEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>닉네임 변경</Text>
      <Text style={styles.editDescription}>파트너에게 보여질 이름이에요</Text>

      <TextInput
        style={styles.textInput}
        value={tempNickname}
        onChangeText={setTempNickname}
        placeholder="닉네임 입력"
        placeholderTextColor="#999"
        maxLength={10}
        autoFocus
      />

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.cancelButton}
          onPress={() => setEditMode(null)}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, !tempNickname.trim() && styles.saveButtonDisabled]}
          onPress={handleSaveNickname}
          disabled={!tempNickname.trim()}
        >
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderBirthdayEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>생년월일 수정</Text>
      <Text style={styles.editDescription}>정확한 생년월일을 입력해주세요</Text>

      {/* Calendar Type Toggle */}
      <View style={styles.calendarTypeToggle}>
        <Pressable
          style={[styles.calendarTypeButton, tempCalendarType === 'solar' && styles.calendarTypeButtonActive]}
          onPress={() => setTempCalendarType('solar')}
        >
          <Text style={[styles.calendarTypeButtonText, tempCalendarType === 'solar' && styles.calendarTypeButtonTextActive]}>
            양력
          </Text>
        </Pressable>
        <Pressable
          style={[styles.calendarTypeButton, tempCalendarType === 'lunar' && styles.calendarTypeButtonActive]}
          onPress={() => setTempCalendarType('lunar')}
        >
          <Text style={[styles.calendarTypeButtonText, tempCalendarType === 'lunar' && styles.calendarTypeButtonTextActive]}>
            음력
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.datePickerButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Calendar color="#666" size={20} />
        <Text style={[styles.datePickerText, tempBirthday && styles.datePickerTextSelected]}>
          {tempBirthday ? formatDate(tempBirthday) : '날짜를 선택해주세요'}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="none" onRequestClose={closeDatePicker}>
          <View style={styles.datePickerModal}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(0, 0, 0, 0.5)', opacity: datePickerBackdropAnim }
              ]}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={closeDatePicker} />
            </Animated.View>
            <Animated.View
              style={[
                styles.datePickerModalContent,
                { transform: [{ translateY: datePickerSlideAnim }] }
              ]}
            >
              <View style={styles.datePickerHeader}>
                <Pressable onPress={closeDatePicker}>
                  <Text style={styles.datePickerCancel}>취소</Text>
                </Pressable>
                <Pressable onPress={closeDatePicker}>
                  <Text style={styles.datePickerConfirm}>확인</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempBirthday || new Date(2000, 0, 1)}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && setTempBirthday(date)}
                maximumDate={new Date()}
                locale="ko-KR"
                style={styles.datePicker}
                textColor="#000000"
                themeVariant="light"
              />
            </Animated.View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={tempBirthday || new Date(2000, 0, 1)}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setTempBirthday(date);
          }}
          maximumDate={new Date()}
        />
      )}

      <View style={styles.buttonRow}>
        <Pressable style={styles.cancelButton} onPress={() => setEditMode(null)}>
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSaveBirthday}>
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderPreferencesView = () => {
    const hasAnyPreference = data.mbti || data.activityTypes.length > 0 ||
      data.dateWorries.length > 0 || data.constraints.length > 0;

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.preferencesViewContent}
        showsVerticalScrollIndicator={false}
      >
        {!hasAnyPreference ? (
          <View style={styles.emptyPreferences}>
            <Text style={styles.emptyPreferencesText}>설정된 취향이 없습니다</Text>
          </View>
        ) : (
          <>
            {/* MBTI */}
            {data.mbti && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>MBTI</Text>
                <View style={styles.hashtagContainer}>
                  <View style={styles.hashtag}>
                    <Text style={styles.hashtagText}>#{data.mbti}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Activity Types */}
            {data.activityTypes.length > 0 && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>선호하는 활동</Text>
                <View style={styles.hashtagContainer}>
                  {data.activityTypes.map((type) => {
                    const option = ACTIVITY_TYPE_OPTIONS.find((o) => o.id === type);
                    return option ? (
                      <View key={type} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{option.label}</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}

            {/* Date Worries */}
            {data.dateWorries.length > 0 && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>데이트 고민</Text>
                <View style={styles.hashtagContainer}>
                  {data.dateWorries.map((worry) => {
                    const option = DATE_WORRY_OPTIONS.find((o) => o.id === worry);
                    return option ? (
                      <View key={worry} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{option.label.slice(0, 10)}...</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}

            {/* Constraints */}
            {data.constraints.length > 0 && data.constraints[0] !== 'none' && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>제약 조건</Text>
                <View style={styles.hashtagContainer}>
                  {data.constraints.map((con) => {
                    const option = CONSTRAINT_OPTIONS.find((o) => o.id === con);
                    return option ? (
                      <View key={con} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{option.label}</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {/* Edit Button */}
        <Pressable
          style={styles.editPreferencesButton}
          onPress={() => {
            setTempMbti(data.mbti);
            setTempActivityTypes(data.activityTypes);
            setTempDateWorries(data.dateWorries);
            setTempConstraints(data.constraints);
            setEditMode('preferences-edit');
          }}
        >
          <Text style={styles.editPreferencesButtonText}>수정하기</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderPreferencesEdit = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.preferencesContent}
      showsVerticalScrollIndicator={false}
    >
      {/* MBTI */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>MBTI</Text>
        <View style={styles.mbtiGrid}>
          {MBTI_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.mbtiButton, tempMbti === option && styles.mbtiButtonActive]}
              onPress={() => setTempMbti(option)}
            >
              <Text style={[styles.mbtiButtonText, tempMbti === option && styles.mbtiButtonTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Activity Types */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>선호하는 활동</Text>
        <View style={styles.activityGrid}>
          {ACTIVITY_TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.activityButton, tempActivityTypes.includes(option.id) && styles.activityButtonActive]}
              onPress={() => toggleActivity(option.id)}
            >
              <Text style={styles.activityIcon}>{option.icon}</Text>
              <Text style={[styles.activityButtonText, tempActivityTypes.includes(option.id) && styles.activityButtonTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Date Worries */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>데이트 고민</Text>
        <View style={styles.dateWorryList}>
          {DATE_WORRY_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.dateWorryButton, tempDateWorries.includes(option.id) && styles.dateWorryButtonActive]}
              onPress={() => toggleDateWorry(option.id)}
            >
              <Text style={styles.dateWorryIcon}>{option.icon}</Text>
              <Text style={[styles.dateWorryButtonText, tempDateWorries.includes(option.id) && styles.dateWorryButtonTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Constraints */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>제약 조건</Text>
        <View style={styles.constraintGrid}>
          {CONSTRAINT_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.constraintButton, tempConstraints.includes(option.id) && styles.constraintButtonActive]}
              onPress={() => toggleConstraint(option.id)}
            >
              <Text style={styles.constraintIcon}>{option.icon}</Text>
              <Text style={[styles.constraintButtonText, tempConstraints.includes(option.id) && styles.constraintButtonTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.buttonRow, { marginTop: SPACING.xl, marginBottom: SPACING.xxxl }]}>
        <Pressable style={styles.cancelButton} onPress={() => setEditMode(null)}>
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSavePreferences}>
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => editMode ? setEditMode(null) : router.back()}
          style={styles.backButton}
        >
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {editMode === 'nickname' ? '닉네임 변경' :
           editMode === 'birthday' ? '생년월일 수정' :
           editMode === 'preferences-view' ? '취향 설정' :
           editMode === 'preferences-edit' ? '취향 설정 수정' : '내 프로필'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {editMode === null && renderMainContent()}
      {editMode === 'nickname' && renderNicknameEdit()}
      {editMode === 'birthday' && renderBirthdayEdit()}
      {editMode === 'preferences-view' && renderPreferencesView()}
      {editMode === 'preferences-edit' && renderPreferencesEdit()}
    </SafeAreaView>
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
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.black,
    marginBottom: 2,
  },
  menuItemValue: {
    fontSize: 14,
    color: '#666',
  },
  editContainer: {
    flex: 1,
    padding: SPACING.lg,
  },
  editTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  editDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: SPACING.xl,
  },
  textInput: {
    width: '100%',
    height: 56,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    color: COLORS.black,
    marginBottom: SPACING.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.full,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 56,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  datePickerText: {
    fontSize: 16,
    color: '#999',
  },
  datePickerTextSelected: {
    color: COLORS.black,
  },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  datePickerCancel: {
    fontSize: 16,
    color: '#666',
  },
  datePickerConfirm: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  datePicker: {
    height: 200,
  },
  preferencesContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  preferenceSection: {
    marginBottom: SPACING.xl,
  },
  preferenceSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  mbtiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mbtiButton: {
    width: (width - SPACING.lg * 2 - 24) / 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
  },
  mbtiButtonActive: {
    backgroundColor: COLORS.black,
  },
  mbtiButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  mbtiButtonTextActive: {
    color: COLORS.white,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.black,
  },
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  toggleButtonTextActive: {
    color: COLORS.white,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  activityButton: {
    width: (width - SPACING.lg * 2 - 10) / 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
    gap: 6,
  },
  activityButtonActive: {
    backgroundColor: COLORS.black,
  },
  activityIcon: {
    fontSize: 24,
  },
  activityButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  activityButtonTextActive: {
    color: COLORS.white,
  },
  situationList: {
    gap: 10,
  },
  situationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
  },
  situationButtonActive: {
    backgroundColor: COLORS.black,
  },
  situationButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  situationButtonTextActive: {
    color: COLORS.white,
  },
  constraintGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  constraintButton: {
    width: (width - SPACING.lg * 2 - 10) / 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
    gap: 6,
  },
  constraintButtonActive: {
    backgroundColor: COLORS.black,
  },
  constraintIcon: {
    fontSize: 24,
  },
  constraintButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  constraintButtonTextActive: {
    color: COLORS.white,
  },
  // Date Worries styles
  dateWorryList: {
    gap: SPACING.sm,
  },
  dateWorryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
  },
  dateWorryButtonActive: {
    backgroundColor: COLORS.black,
  },
  dateWorryIcon: {
    fontSize: 18,
  },
  dateWorryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    flex: 1,
  },
  dateWorryButtonTextActive: {
    color: COLORS.white,
  },
  // Preferences View styles
  preferencesViewContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  emptyPreferences: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
  },
  emptyPreferencesText: {
    fontSize: 14,
    color: '#999',
  },
  preferenceViewSection: {
    marginBottom: SPACING.xl,
  },
  preferenceViewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: SPACING.sm,
  },
  hashtagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  hashtag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  hashtagText: {
    fontSize: 13,
    color: '#666',
  },
  editPreferencesButton: {
    backgroundColor: COLORS.black,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  editPreferencesButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Calendar Type Toggle
  calendarTypeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  calendarTypeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  calendarTypeButtonActive: {
    backgroundColor: COLORS.black,
  },
  calendarTypeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  calendarTypeButtonTextActive: {
    color: COLORS.white,
  },
});
