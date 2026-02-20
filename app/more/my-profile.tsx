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
  Mail,
  Clock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { useOnboardingStore, useAuthStore } from '@/stores';
import type { CalendarType, RelationshipType } from '@/stores/onboardingStore';
import { db, isDemoMode } from '@/lib/supabase';
import { formatDateToLocal } from '@/lib/dateUtils';

const { width } = Dimensions.get('window');

type EditMode = 'nickname' | 'birthday' | 'anniversary' | 'my-account' | 'partner-account' | null;

export default function MyProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data, updateData } = useOnboardingStore();
  const { user, partner, couple, updateNickname, updateAnniversary } = useAuthStore();

  const [editMode, setEditMode] = useState<EditMode>(null);

  // Nickname state
  const [tempNickname, setTempNickname] = useState(data.nickname);

  // Birthday state
  const [tempBirthday, setTempBirthday] = useState<Date | null>(data.birthDate ? new Date(data.birthDate) : null);
  const [tempCalendarType, setTempCalendarType] = useState<CalendarType>(data.birthDateCalendarType || 'solar');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Anniversary state
  const syncedRelationshipType: RelationshipType = couple?.relationshipType || data.relationshipType || 'dating';
  const syncedAnniversaryDate = couple?.datingStartDate
    ? new Date(couple.datingStartDate)
    : data.anniversaryDate
      ? new Date(data.anniversaryDate)
      : null;
  const [tempRelationshipType, setTempRelationshipType] = useState<RelationshipType>(syncedRelationshipType);
  const [tempAnniversaryDate, setTempAnniversaryDate] = useState<Date | null>(syncedAnniversaryDate);
  const [showAnniversaryDatePicker, setShowAnniversaryDatePicker] = useState(false);

  // Nicknames
  const myNickname = data.nickname || user?.nickname || t('profile.me');
  const partnerNickname = partner?.nickname || t('profile.partner');

  // DatePicker animation
  const { height } = Dimensions.get('window');
  const datePickerSlideAnim = useRef(new Animated.Value(height)).current;
  const datePickerBackdropAnim = useRef(new Animated.Value(0)).current;

  const isDatePickerVisible = showDatePicker || showAnniversaryDatePicker;

  useEffect(() => {
    if (isDatePickerVisible) {
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
  }, [isDatePickerVisible]);

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
      setShowAnniversaryDatePicker(false);
      datePickerSlideAnim.setValue(height);
      datePickerBackdropAnim.setValue(0);
    });
  };

  // --- Save handlers ---

  const handleSaveNickname = async () => {
    if (tempNickname.trim()) {
      updateData({ nickname: tempNickname.trim() });
      updateNickname(tempNickname.trim());

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

      if (user) {
        const updatedUser = {
          ...user,
          birthDate: tempBirthday,
          birthDateCalendarType: tempCalendarType,
        };
        useAuthStore.getState().setUser(updatedUser);
      }

      if (!isDemoMode && user?.id) {
        try {
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

  const handleSaveAnniversary = async () => {
    updateData({
      relationshipType: tempRelationshipType,
      anniversaryDate: tempAnniversaryDate,
    });

    if (tempAnniversaryDate && couple) {
      const typeLabel = tempRelationshipType === 'dating' ? t('profile.couple.editAnniversary.datingStart') : t('profile.couple.editAnniversary.marriedAnniversary');
      updateAnniversary(tempAnniversaryDate, typeLabel);

      const updatedCouple = {
        ...couple,
        datingStartDate: tempAnniversaryDate,
        weddingDate: tempRelationshipType === 'married' ? tempAnniversaryDate : undefined,
        relationshipType: tempRelationshipType as 'dating' | 'married',
      };
      useAuthStore.getState().setCouple(updatedCouple);

      if (!isDemoMode && couple.id) {
        try {
          await db.couples.update(couple.id, {
            relationship_type: tempRelationshipType,
            dating_start_date: formatDateToLocal(tempAnniversaryDate),
            wedding_date: tempRelationshipType === 'married' ? formatDateToLocal(tempAnniversaryDate) : null,
          });
        } catch (error) {
          console.error('Error updating anniversary:', error);
        }
      }
    }
    setEditMode(null);
  };

  // --- Formatters ---

  const formatDate = (date: Date | string | null) => {
    if (!date) return t('profile.notSet');
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return t('profile.dateFormat', { year, month, day });
  };

  const getRelationshipLabel = (type: RelationshipType) => {
    switch (type) {
      case 'dating': return t('profile.couple.datingType');
      case 'married': return t('profile.couple.marriedType');
      default: return t('profile.couple.datingType');
    }
  };

  const getDateLabel = (type: RelationshipType) => {
    switch (type) {
      case 'dating': return t('profile.couple.datingLabel');
      case 'married': return t('profile.couple.marriedLabel');
      default: return t('profile.couple.datingLabel');
    }
  };

  // --- Render sections ---

  const renderMainContent = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* My Profile Section */}
      <Text style={styles.sectionTitle}>{t('more.menu.myProfile')}</Text>

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

      {/* Anniversary Section */}
      <Text style={styles.sectionTitle}>{t('profile.couple.anniversary')}</Text>
      <Pressable
        style={styles.menuItem}
        onPress={() => {
          setTempRelationshipType(syncedRelationshipType);
          setTempAnniversaryDate(syncedAnniversaryDate);
          setEditMode('anniversary');
        }}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <Calendar color={COLORS.black} size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{getDateLabel(syncedRelationshipType)}</Text>
            <Text style={styles.menuItemValue}>{formatDate(syncedAnniversaryDate)}</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={scale(20)} />
      </Pressable>

      {/* Account Info Section */}
      <Text style={styles.sectionTitle}>{t('profile.couple.accountInfo')}</Text>
      <Pressable
        style={styles.menuItem}
        onPress={() => setEditMode('my-account')}
      >
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#e8f5e9' }]}>
            <User color="#4caf50" size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{t('profile.couple.myAccountInfo', { nickname: myNickname })}</Text>
            <Text style={styles.menuItemValue}>{t('profile.couple.myAccount')}</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={scale(20)} />
      </Pressable>

      <Pressable
        style={styles.menuItem}
        onPress={() => setEditMode('partner-account')}
      >
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#fce4ec' }]}>
            <User color="#e91e63" size={scale(20)} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{t('profile.couple.myAccountInfo', { nickname: partnerNickname })}</Text>
            <Text style={styles.menuItemValue}>{t('profile.couple.partnerAccount')}</Text>
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

  const renderAnniversaryEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>{t('profile.couple.editAnniversary.title')}</Text>
      <Text style={styles.editDescription}>{t('profile.couple.editAnniversary.description')}</Text>

      {/* Relationship Type */}
      <Text style={styles.fieldLabel}>{t('profile.couple.editAnniversary.relationshipLabel')}</Text>
      <View style={styles.relationshipRow}>
        {(['dating', 'married'] as RelationshipType[]).map((type) => (
          <Pressable
            key={type}
            style={[styles.relationshipButton, tempRelationshipType === type && styles.relationshipButtonActive]}
            onPress={() => setTempRelationshipType(type)}
          >
            <Text style={[styles.relationshipButtonText, tempRelationshipType === type && styles.relationshipButtonTextActive]}>
              {getRelationshipLabel(type)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Date Picker */}
      <Text style={styles.fieldLabel}>{getDateLabel(tempRelationshipType)}</Text>
      <Pressable
        style={styles.datePickerButton}
        onPress={() => setShowAnniversaryDatePicker(true)}
      >
        <Calendar color="#666" size={scale(20)} />
        <Text style={[styles.datePickerText, tempAnniversaryDate && styles.datePickerTextSelected]}>
          {tempAnniversaryDate ? formatDate(tempAnniversaryDate) : t('profile.couple.editAnniversary.selectDate')}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={showAnniversaryDatePicker} transparent animationType="none" onRequestClose={closeDatePicker}>
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
                value={tempAnniversaryDate || new Date()}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && setTempAnniversaryDate(date)}
                maximumDate={new Date()}
                textColor={COLORS.black}
                themeVariant="light"
                style={styles.datePicker}
              />
            </Animated.View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showAnniversaryDatePicker && (
        <DateTimePicker
          value={tempAnniversaryDate || new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowAnniversaryDatePicker(false);
            if (date) setTempAnniversaryDate(date);
          }}
          maximumDate={new Date()}
        />
      )}

      <View style={[styles.buttonRow, { marginTop: 'auto' }]}>
        <Pressable style={styles.cancelButton} onPress={() => setEditMode(null)}>
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSaveAnniversary}>
          <Text style={styles.saveButtonText}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderAccountInfo = (isMe: boolean) => {
    const nickname = isMe ? myNickname : partnerNickname;
    const email = isMe ? (user?.email || 'email@example.com') : (partner?.email || t('profile.couple.accountDetail.defaultPartnerEmail'));
    const createdAt = isMe ? user?.createdAt : partner?.createdAt;

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Avatar */}
        <View style={styles.profileHeader}>
          <View style={[styles.largeAvatar, !isMe && { backgroundColor: '#fce4ec' }]}>
            <Text style={[styles.largeAvatarText, !isMe && { color: '#e91e63' }]}>
              {nickname.charAt(0)}
            </Text>
          </View>
          <Text style={styles.profileName}>{nickname}</Text>
          <View style={styles.relationshipBadge}>
            <Text style={styles.relationshipBadgeText}>
              {isMe ? t('profile.couple.accountDetail.me') : t('profile.couple.accountDetail.partner')}
            </Text>
          </View>
        </View>

        {/* Info Items */}
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <User color="#666" size={scale(18)} />
              <Text style={styles.infoLabel}>{t('profile.couple.accountDetail.nickname')}</Text>
            </View>
            <Text style={styles.infoValue}>{nickname}</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <Mail color="#666" size={scale(18)} />
              <Text style={styles.infoLabel}>{t('profile.couple.accountDetail.email')}</Text>
            </View>
            <Text style={styles.infoValue}>{email}</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <Clock color="#666" size={scale(18)} />
              <Text style={styles.infoLabel}>{t('profile.couple.accountDetail.joinDate')}</Text>
            </View>
            <Text style={styles.infoValue}>
              {createdAt ? formatDate(new Date(createdAt)) : t('profile.couple.accountDetail.noInfo')}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  const getHeaderTitle = () => {
    switch (editMode) {
      case 'nickname': return t('profile.editNickname.title');
      case 'birthday': return t('profile.editBirthday.title');
      case 'anniversary': return t('profile.couple.editAnniversary.title');
      case 'my-account': return t('profile.couple.myAccountInfo', { nickname: myNickname });
      case 'partner-account': return t('profile.couple.myAccountInfo', { nickname: partnerNickname });
      default: return t('more.menu.profile');
    }
  };

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
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {editMode === null && renderMainContent()}
      {editMode === 'nickname' && renderNicknameEdit()}
      {editMode === 'birthday' && renderBirthdayEdit()}
      {editMode === 'anniversary' && renderAnniversaryEdit()}
      {editMode === 'my-account' && renderAccountInfo(true)}
      {editMode === 'partner-account' && renderAccountInfo(false)}
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
  sectionTitle: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#999',
    marginLeft: scale(SPACING.lg),
    marginTop: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
    textTransform: 'uppercase',
    letterSpacing: scale(0.5),
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
  // Anniversary edit
  fieldLabel: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: scale(SPACING.sm),
    height: scale(20),
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: scale(12),
    marginBottom: scale(SPACING.xl),
  },
  relationshipButton: {
    flex: 1,
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  relationshipButtonActive: {
    backgroundColor: COLORS.black,
  },
  relationshipButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#666',
  },
  relationshipButtonTextActive: {
    color: COLORS.white,
  },
  // Account info
  profileHeader: {
    alignItems: 'center',
    paddingVertical: scale(SPACING.xl),
  },
  largeAvatar: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.md),
  },
  largeAvatarText: {
    fontSize: scaleFont(32),
    fontWeight: '700',
    color: '#4caf50',
  },
  profileName: {
    fontSize: scaleFont(22),
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: scale(SPACING.sm),
  },
  relationshipBadge: {
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.xs),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  relationshipBadgeText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#666',
  },
  infoCard: {
    marginHorizontal: scale(SPACING.lg),
    backgroundColor: '#f8f8f8',
    borderRadius: scale(RADIUS.md),
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(SPACING.sm),
  },
  infoLabel: {
    fontSize: scaleFont(15),
    color: '#666',
  },
  infoValue: {
    fontSize: scaleFont(15),
    fontWeight: '500',
    color: COLORS.black,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: scale(SPACING.lg),
  },
});
