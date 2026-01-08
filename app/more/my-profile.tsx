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
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Sliders,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS, IS_TABLET, scale, scaleFont } from '@/constants/design';
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
  const { t } = useTranslation();
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
          // birthDateCalendarType is stored as a separate column, not in preferences
          const preferences = {
            mbti: data.mbti,
            gender: data.gender,
            activityTypes: data.activityTypes,
            dateWorries: data.dateWorries,
            constraints: data.constraints,
            relationshipType: data.relationshipType,
          };

          await db.profiles.update(user.id, {
            birth_date: formatDateToLocal(tempBirthday),
            birth_date_calendar_type: tempCalendarType,
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
        // birthDateCalendarType is stored as a separate column, not in preferences
        const preferences = {
          mbti: tempMbti,
          gender: data.gender,
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
    if (!date) return t('profile.notSet');
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return t('profile.dateFormat', { year, month, day });
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
            <User color={COLORS.black} size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{t('profile.nickname')}</Text>
            <Text style={styles.menuItemValue}>{data.nickname || t('profile.notSet')}</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={scale(20)} />
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
            <Calendar color={COLORS.black} size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{t('profile.birthDate')}</Text>
            <Text style={styles.menuItemValue}>
              {formatDate(data.birthDate ? new Date(data.birthDate) : null)}
              {data.birthDate && ` (${data.birthDateCalendarType === 'lunar' ? t('profile.lunar') : t('profile.solar')})`}
            </Text>
          </View>
        </View>
        <ChevronRight color="#999" size={scale(20)} />
      </Pressable>

      {/* Preferences Section */}
      <Pressable
        style={styles.menuItem}
        onPress={() => setEditMode('preferences-view')}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <Sliders color={COLORS.black} size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{t('profile.preferences')}</Text>
            <Text style={styles.menuItemValue}>
              {data.mbti ? `${data.mbti}` : ''}
              {data.activityTypes.length > 0 ? ` · ${t('profile.activitiesCount', { count: data.activityTypes.length })}` : ''}
              {!data.mbti && data.activityTypes.length === 0 ? t('profile.notSet') : ''}
            </Text>
          </View>
        </View>
        <ChevronRight color="#999" size={scale(20)} />
      </Pressable>
    </ScrollView>
  );

  const renderNicknameEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>{t('profile.editNickname.title')}</Text>
      <Text style={styles.editDescription}>{t('profile.editNickname.description')}</Text>

      <TextInput
        style={styles.textInput}
        value={tempNickname}
        onChangeText={setTempNickname}
        placeholder={t('profile.editNickname.placeholder')}
        placeholderTextColor="#999"
        maxLength={10}
        autoFocus
      />

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.cancelButton}
          onPress={() => setEditMode(null)}
        >
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, !tempNickname.trim() && styles.saveButtonDisabled]}
          onPress={handleSaveNickname}
          disabled={!tempNickname.trim()}
        >
          <Text style={styles.saveButtonText}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderBirthdayEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>{t('profile.editBirthday.title')}</Text>
      <Text style={styles.editDescription}>{t('profile.editBirthday.description')}</Text>

      {/* Calendar Type Toggle */}
      <View style={styles.calendarTypeToggle}>
        <Pressable
          style={[styles.calendarTypeButton, tempCalendarType === 'solar' && styles.calendarTypeButtonActive]}
          onPress={() => setTempCalendarType('solar')}
        >
          <Text style={[styles.calendarTypeButtonText, tempCalendarType === 'solar' && styles.calendarTypeButtonTextActive]}>
            {t('profile.solar')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.calendarTypeButton, tempCalendarType === 'lunar' && styles.calendarTypeButtonActive]}
          onPress={() => setTempCalendarType('lunar')}
        >
          <Text style={[styles.calendarTypeButtonText, tempCalendarType === 'lunar' && styles.calendarTypeButtonTextActive]}>
            {t('profile.lunar')}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.datePickerButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Calendar color="#666" size={scale(20)} />
        <Text style={[styles.datePickerText, tempBirthday && styles.datePickerTextSelected]}>
          {tempBirthday ? formatDate(tempBirthday) : t('profile.editBirthday.selectDate')}
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
                  <Text style={styles.datePickerCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={closeDatePicker}>
                  <Text style={styles.datePickerConfirm}>{t('common.confirm')}</Text>
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
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSaveBirthday}>
          <Text style={styles.saveButtonText}>{t('common.save')}</Text>
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
            <Text style={styles.emptyPreferencesText}>{t('profile.noPreferences')}</Text>
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
                <Text style={styles.preferenceViewLabel}>{t('profile.preferredActivities')}</Text>
                <View style={styles.hashtagContainer}>
                  {data.activityTypes.map((type) => {
                    const option = ACTIVITY_TYPE_OPTIONS.find((o) => o.id === type);
                    return option ? (
                      <View key={type} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{t(option.labelKey)}</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}

            {/* Date Worries */}
            {data.dateWorries.length > 0 && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>{t('profile.dateConcerns')}</Text>
                <View style={styles.hashtagContainer}>
                  {data.dateWorries.map((worry) => {
                    const option = DATE_WORRY_OPTIONS.find((o) => o.id === worry);
                    return option ? (
                      <View key={worry} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{t(option.labelKey)}</Text>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}

            {/* Constraints */}
            {data.constraints.length > 0 && data.constraints[0] !== 'none' && (
              <View style={styles.preferenceViewSection}>
                <Text style={styles.preferenceViewLabel}>{t('profile.constraints')}</Text>
                <View style={styles.hashtagContainer}>
                  {data.constraints.map((con) => {
                    const option = CONSTRAINT_OPTIONS.find((o) => o.id === con);
                    return option ? (
                      <View key={con} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>#{t(option.labelKey)}</Text>
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
          <Text style={styles.editPreferencesButtonText}>{t('profile.editPreferences.button')}</Text>
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
        <Text style={styles.preferenceSectionTitle}>{t('profile.preferredActivities')}</Text>
        <View style={styles.activityGrid}>
          {ACTIVITY_TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.activityButton, tempActivityTypes.includes(option.id) && styles.activityButtonActive]}
              onPress={() => toggleActivity(option.id)}
            >
              <Text style={styles.activityIcon}>{option.icon}</Text>
              <Text style={[styles.activityButtonText, tempActivityTypes.includes(option.id) && styles.activityButtonTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Date Worries */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>{t('profile.dateConcerns')}</Text>
        <View style={styles.dateWorryList}>
          {DATE_WORRY_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.dateWorryButton, tempDateWorries.includes(option.id) && styles.dateWorryButtonActive]}
              onPress={() => toggleDateWorry(option.id)}
            >
              <Text style={styles.dateWorryIcon}>{option.icon}</Text>
              <Text style={[styles.dateWorryButtonText, tempDateWorries.includes(option.id) && styles.dateWorryButtonTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Constraints */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceSectionTitle}>{t('profile.constraints')}</Text>
        <View style={styles.constraintGrid}>
          {CONSTRAINT_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.constraintButton, tempConstraints.includes(option.id) && styles.constraintButtonActive]}
              onPress={() => toggleConstraint(option.id)}
            >
              <Text style={styles.constraintIcon}>{option.icon}</Text>
              <Text style={[styles.constraintButtonText, tempConstraints.includes(option.id) && styles.constraintButtonTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.buttonRow, { marginTop: SPACING.xl, marginBottom: SPACING.xxxl }]}>
        <Pressable style={styles.cancelButton} onPress={() => setEditMode(null)}>
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSavePreferences}>
          <Text style={styles.saveButtonText}>{t('common.save')}</Text>
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
          <ChevronLeft color={COLORS.black} size={scale(24)} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {editMode === 'nickname' ? t('profile.editNickname.title') :
           editMode === 'birthday' ? t('profile.editBirthday.title') :
           editMode === 'preferences-view' ? t('profile.editPreferences.title') :
           editMode === 'preferences-edit' ? t('profile.editPreferences.editTitle') : t('profile.myProfile')}
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
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaleFont(18),
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: scale(40),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: scale(SPACING.lg),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
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
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(SPACING.md),
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: scaleFont(16),
    fontWeight: '500',
    color: COLORS.black,
    marginBottom: scale(2),
  },
  menuItemValue: {
    fontSize: scaleFont(14),
    color: '#666',
  },
  editContainer: {
    flex: 1,
    padding: scale(SPACING.lg),
  },
  editTitle: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: scale(SPACING.sm),
  },
  editDescription: {
    fontSize: scaleFont(14),
    color: '#666',
    marginBottom: scale(SPACING.xl),
  },
  textInput: {
    width: '100%',
    height: scale(56),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    paddingHorizontal: scale(SPACING.lg),
    fontSize: scaleFont(16),
    color: COLORS.black,
    marginBottom: scale(SPACING.xl),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: scale(12),
  },
  cancelButton: {
    flex: 1,
    height: scale(52),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  cancelButtonText: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    height: scale(52),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.black,
    borderRadius: scale(RADIUS.full),
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: COLORS.white,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: scale(56),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    paddingHorizontal: scale(SPACING.lg),
    gap: scale(SPACING.md),
    marginBottom: scale(SPACING.xl),
  },
  datePickerText: {
    fontSize: scaleFont(16),
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
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    paddingBottom: scale(40),
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: scale(SPACING.lg),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  datePickerCancel: {
    fontSize: scaleFont(16),
    color: '#666',
  },
  datePickerConfirm: {
    fontSize: scaleFont(16),
    color: COLORS.black,
    fontWeight: '600',
  },
  datePicker: {
    height: scale(200),
  },
  preferencesContent: {
    padding: scale(SPACING.lg),
    paddingBottom: scale(100),
  },
  preferenceSection: {
    marginBottom: scale(SPACING.xl),
  },
  preferenceSectionTitle: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: scale(SPACING.md),
  },
  mbtiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  mbtiButton: {
    width: (width - scale(SPACING.lg) * 2 - scale(24)) / 4,
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
  },
  mbtiButtonActive: {
    backgroundColor: COLORS.black,
  },
  mbtiButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#666',
  },
  mbtiButtonTextActive: {
    color: COLORS.white,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: scale(12),
  },
  toggleButton: {
    flex: 1,
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  toggleButtonActive: {
    backgroundColor: COLORS.black,
  },
  toggleButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#666',
  },
  toggleButtonTextActive: {
    color: COLORS.white,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
  },
  activityButton: {
    width: (width - scale(SPACING.lg) * 2 - scale(10)) / 2,
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    gap: scale(6),
  },
  activityButtonActive: {
    backgroundColor: COLORS.black,
  },
  activityIcon: {
    fontSize: scaleFont(24),
  },
  activityButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '500',
    color: '#666',
  },
  activityButtonTextActive: {
    color: COLORS.white,
  },
  situationList: {
    gap: scale(10),
  },
  situationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: scale(14),
    paddingHorizontal: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
  },
  situationButtonActive: {
    backgroundColor: COLORS.black,
  },
  situationButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '500',
    color: '#666',
  },
  situationButtonTextActive: {
    color: COLORS.white,
  },
  constraintGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
  },
  constraintButton: {
    width: (width - scale(SPACING.lg) * 2 - scale(10)) / 2,
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    gap: scale(6),
  },
  constraintButtonActive: {
    backgroundColor: COLORS.black,
  },
  constraintIcon: {
    fontSize: scaleFont(24),
  },
  constraintButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '500',
    color: '#666',
  },
  constraintButtonTextActive: {
    color: COLORS.white,
  },
  // Date Worries styles
  dateWorryList: {
    gap: scale(SPACING.sm),
  },
  dateWorryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    gap: scale(SPACING.sm),
  },
  dateWorryButtonActive: {
    backgroundColor: COLORS.black,
  },
  dateWorryIcon: {
    fontSize: scaleFont(18),
  },
  dateWorryButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '500',
    color: '#666',
    flex: 1,
  },
  dateWorryButtonTextActive: {
    color: COLORS.white,
  },
  // Preferences View styles
  preferencesViewContent: {
    padding: scale(SPACING.lg),
    paddingBottom: scale(SPACING.xxxl),
  },
  emptyPreferences: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(SPACING.xxxl),
  },
  emptyPreferencesText: {
    fontSize: scaleFont(14),
    color: '#999',
  },
  preferenceViewSection: {
    marginBottom: scale(SPACING.xl),
  },
  preferenceViewLabel: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: '#333',
    marginBottom: scale(SPACING.sm),
  },
  hashtagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(SPACING.xs),
  },
  hashtag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.xs),
    borderRadius: scale(RADIUS.full),
  },
  hashtagText: {
    fontSize: scaleFont(13),
    color: '#666',
  },
  editPreferencesButton: {
    backgroundColor: COLORS.black,
    paddingVertical: scale(SPACING.md),
    borderRadius: scale(RADIUS.lg),
    alignItems: 'center',
    marginTop: scale(SPACING.xl),
  },
  editPreferencesButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: COLORS.white,
  },
  // Calendar Type Toggle
  calendarTypeToggle: {
    flexDirection: 'row',
    gap: scale(8),
    marginBottom: scale(SPACING.md),
  },
  calendarTypeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(10),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  calendarTypeButtonActive: {
    backgroundColor: COLORS.black,
  },
  calendarTypeButtonText: {
    fontSize: scaleFont(14),
    color: '#666',
    fontWeight: '500',
  },
  calendarTypeButtonTextActive: {
    color: COLORS.white,
  },
});
