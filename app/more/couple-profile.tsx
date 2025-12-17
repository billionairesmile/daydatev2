import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
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
  Calendar,
  User,
  Mail,
  Clock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useOnboardingStore, useAuthStore } from '@/stores';
import type { RelationshipType } from '@/stores/onboardingStore';
import { db, isDemoMode } from '@/lib/supabase';
import { formatDateToLocal } from '@/lib/dateUtils';

const { width } = Dimensions.get('window');

type ViewMode = 'main' | 'anniversary' | 'my-account' | 'partner-account';

export default function CoupleProfileScreen() {
  const router = useRouter();
  const { data, updateData } = useOnboardingStore();
  const { user, partner, couple, updateAnniversary } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('main');

  // Use synced couple data as source of truth, fallback to local onboarding data
  const syncedRelationshipType: RelationshipType = couple?.relationshipType || data.relationshipType || 'dating';
  const syncedAnniversaryDate = couple?.datingStartDate
    ? new Date(couple.datingStartDate)
    : data.anniversaryDate
      ? new Date(data.anniversaryDate)
      : null;

  const [tempRelationshipType, setTempRelationshipType] = useState<RelationshipType>(syncedRelationshipType);

  const [tempAnniversaryDate, setTempAnniversaryDate] = useState<Date | null>(syncedAnniversaryDate);
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

  // Get the user's and partner's nicknames
  const myNickname = data.nickname || user?.nickname || '나';
  const partnerNickname = partner?.nickname || '파트너';

  const handleSaveAnniversary = async () => {
    updateData({
      relationshipType: tempRelationshipType,
      anniversaryDate: tempAnniversaryDate,
    });

    if (tempAnniversaryDate && couple) {
      const typeLabel = tempRelationshipType === 'dating' ? '연애 시작일' : '결혼 기념일';
      updateAnniversary(tempAnniversaryDate, typeLabel);

      // Update couple in authStore with new dates
      const updatedCouple = {
        ...couple,
        datingStartDate: tempAnniversaryDate,
        weddingDate: tempRelationshipType === 'married' ? tempAnniversaryDate : undefined,
        relationshipType: tempRelationshipType as 'dating' | 'married',
      };
      useAuthStore.getState().setCouple(updatedCouple);

      // Save to database
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
    setViewMode('main');
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '설정되지 않음';
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
  };

  const getRelationshipLabel = (type: RelationshipType) => {
    switch (type) {
      case 'dating': return '연인';
      case 'married': return '부부';
      default: return '연인';
    }
  };

  const getDateLabel = (type: RelationshipType) => {
    switch (type) {
      case 'dating': return '사귄 날';
      case 'married': return '결혼기념일';
      default: return '사귄 날';
    }
  };

  const renderMainContent = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Anniversary Section */}
      <Text style={styles.sectionTitle}>기념일</Text>
      <Pressable
        style={styles.menuItem}
        onPress={() => {
          setTempRelationshipType(syncedRelationshipType);
          setTempAnniversaryDate(syncedAnniversaryDate);
          setViewMode('anniversary');
        }}
      >
        <View style={styles.menuItemLeft}>
          <View style={styles.iconWrapper}>
            <Calendar color={COLORS.black} size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{getDateLabel(syncedRelationshipType)}</Text>
            <Text style={styles.menuItemValue}>{formatDate(syncedAnniversaryDate)}</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>

      {/* Account Info Section */}
      <Text style={styles.sectionTitle}>계정 정보</Text>
      <Pressable
        style={styles.menuItem}
        onPress={() => setViewMode('my-account')}
      >
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#e8f5e9' }]}>
            <User color="#4caf50" size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{myNickname} 계정 정보</Text>
            <Text style={styles.menuItemValue}>내 계정</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>

      <Pressable
        style={styles.menuItem}
        onPress={() => setViewMode('partner-account')}
      >
        <View style={styles.menuItemLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#fce4ec' }]}>
            <User color="#e91e63" size={20} />
          </View>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemLabel}>{partnerNickname} 계정 정보</Text>
            <Text style={styles.menuItemValue}>파트너 계정</Text>
          </View>
        </View>
        <ChevronRight color="#999" size={20} />
      </Pressable>
    </ScrollView>
  );

  const renderAnniversaryEdit = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>기념일 변경</Text>
      <Text style={styles.editDescription}>특별한 날을 수정해주세요</Text>

      {/* Relationship Type */}
      <Text style={styles.fieldLabel}>관계 유형</Text>
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
        onPress={() => setShowDatePicker(true)}
      >
        <Calendar color="#666" size={20} />
        <Text style={[styles.datePickerText, tempAnniversaryDate && styles.datePickerTextSelected]}>
          {tempAnniversaryDate ? formatDate(tempAnniversaryDate) : '날짜를 선택해주세요'}
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
                value={tempAnniversaryDate || new Date()}
                mode="date"
                display="spinner"
                onChange={(_, date) => date && setTempAnniversaryDate(date)}
                maximumDate={new Date()}
                locale="ko-KR"
                textColor={COLORS.black}
                themeVariant="light"
                style={styles.datePicker}
              />
            </Animated.View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={tempAnniversaryDate || new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setTempAnniversaryDate(date);
          }}
          maximumDate={new Date()}
        />
      )}

      <View style={[styles.buttonRow, { marginTop: 'auto' }]}>
        <Pressable style={styles.cancelButton} onPress={() => setViewMode('main')}>
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSaveAnniversary}>
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderAccountInfo = (isMe: boolean) => {
    const nickname = isMe ? myNickname : partnerNickname;
    const email = isMe ? (user?.email || 'email@example.com') : (partner?.email || '연결된 파트너');
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
              {isMe ? '나' : '파트너'}
            </Text>
          </View>
        </View>

        {/* Info Items */}
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <User color="#666" size={18} />
              <Text style={styles.infoLabel}>닉네임</Text>
            </View>
            <Text style={styles.infoValue}>{nickname}</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <Mail color="#666" size={18} />
              <Text style={styles.infoLabel}>이메일</Text>
            </View>
            <Text style={styles.infoValue}>{email}</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <View style={styles.infoItemLeft}>
              <Clock color="#666" size={18} />
              <Text style={styles.infoLabel}>가입일</Text>
            </View>
            <Text style={styles.infoValue}>
              {createdAt ? formatDate(new Date(createdAt)) : '정보 없음'}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  const getHeaderTitle = () => {
    switch (viewMode) {
      case 'anniversary': return '기념일 변경';
      case 'my-account': return `${myNickname} 계정 정보`;
      case 'partner-account': return `${partnerNickname} 계정 정보`;
      default: return '커플 프로필';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => viewMode === 'main' ? router.back() : setViewMode('main')}
          style={styles.backButton}
        >
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {viewMode === 'main' && renderMainContent()}
      {viewMode === 'anniversary' && renderAnniversaryEdit()}
      {viewMode === 'my-account' && renderAccountInfo(true)}
      {viewMode === 'partner-account' && renderAccountInfo(false)}
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginLeft: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: SPACING.sm,
    height: 20, // Fixed height to prevent layout shift when text changes
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.xl,
  },
  relationshipButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  relationshipButtonActive: {
    backgroundColor: COLORS.black,
  },
  relationshipButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  relationshipButtonTextActive: {
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
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  largeAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4caf50',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  relationshipBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  relationshipBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  infoCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  infoLabel: {
    fontSize: 15,
    color: '#666',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: SPACING.lg,
  },
});
