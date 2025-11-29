import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  Modal,
  Image,
  ScrollView,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ImageIcon, X, Edit2, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useBackground } from '@/contexts';

const { width, height } = Dimensions.get('window');

// Anniversary type definition
interface Anniversary {
  id: number;
  label: string;
  targetDate: Date;
  icon: string;
  bgColor: string;
  gradientColors: readonly [string, string];
  isYearly?: boolean; // Whether this anniversary repeats yearly
}

// Swipeable Anniversary Card Component
interface SwipeableCardProps {
  anniversary: Anniversary & { date: string; dDay: string };
  onEdit: () => void;
  onDelete: () => void;
  isCustom: boolean;
}

function SwipeableAnniversaryCard({ anniversary, onEdit, onDelete, isCustom }: SwipeableCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [isOpen, setIsOpen] = useState(false);

  const closeSwipe = () => {
    swipeableRef.current?.close();
  };

  const handleSwipeOpen = () => {
    setIsOpen(true);
  };

  const handleSwipeClose = () => {
    setIsOpen(false);
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!isCustom) return null;

    // Animate opacity based on progress (0 = closed, 1 = fully open)
    const opacity = progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, 1],
      extrapolate: 'clamp',
    });

    // Animate scale for a nice pop effect
    const scale = progress.interpolate({
      inputRange: [0, 0.8, 1],
      outputRange: [0.5, 0.8, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[swipeStyles.actionsContainer, { opacity, transform: [{ scale }] }]}>
        <Pressable
          style={swipeStyles.editButton}
          onPress={() => {
            closeSwipe();
            onEdit();
          }}
        >
          <Edit2 color="#000000" size={20} />
          <Text style={swipeStyles.editActionText}>수정</Text>
        </Pressable>
        <Pressable
          style={swipeStyles.deleteButton}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        >
          <Trash2 color="#FFFFFF" size={20} />
          <Text style={swipeStyles.actionText}>삭제</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const cardContent = (
    <View style={[swipeStyles.card, { backgroundColor: anniversary.bgColor }]}>
      <View style={swipeStyles.cardContent}>
        <View style={swipeStyles.cardLeft}>
          <Text style={swipeStyles.icon}>{anniversary.icon}</Text>
          <View>
            <Text style={swipeStyles.label}>{anniversary.label}</Text>
            <Text style={swipeStyles.date}>{anniversary.date}</Text>
          </View>
        </View>
        <LinearGradient
          colors={anniversary.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={swipeStyles.badge}
        >
          <Text style={swipeStyles.dDay}>{anniversary.dDay}</Text>
        </LinearGradient>
      </View>
    </View>
  );

  // Non-custom anniversaries don't need swipe
  if (!isCustom) {
    return <View style={swipeStyles.container}>{cardContent}</View>;
  }

  return (
    <View style={swipeStyles.container}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={60}
        overshootRight={false}
        friction={1.5}
        onSwipeableOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
        containerStyle={swipeStyles.swipeableContainer}
      >
        {cardContent}
      </Swipeable>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  swipeableContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    gap: 8,
  },
  editButton: {
    width: 50,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editActionText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  deleteButton: {
    width: 50,
    height: 50,
    backgroundColor: '#EF4444',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    width: '100%',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  date: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dDay: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default function HomeScreen() {
  const { backgroundImage, setBackgroundImage, resetToDefault } = useBackground();
  const [showAnniversaryModal, setShowAnniversaryModal] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [showAddAnniversary, setShowAddAnniversary] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newAnniversaryIcon, setNewAnniversaryIcon] = useState('💝');
  const [newAnniversaryName, setNewAnniversaryName] = useState('');
  const [newAnniversaryDate, setNewAnniversaryDate] = useState(new Date());

  // Custom anniversaries added by user (yearly repeating)
  const [customAnniversaries, setCustomAnniversaries] = useState<Anniversary[]>([]);

  // Edit anniversary states
  const [showEditAnniversary, setShowEditAnniversary] = useState(false);
  const [editingAnniversary, setEditingAnniversary] = useState<Anniversary | null>(null);
  const [editAnniversaryIcon, setEditAnniversaryIcon] = useState('💝');
  const [editAnniversaryName, setEditAnniversaryName] = useState('');
  const [editAnniversaryDate, setEditAnniversaryDate] = useState(new Date());
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  // Emoji options for anniversary icons
  const emojiOptions = ['💝', '❤️', '💕', '💗', '🤍', '🎉', '🎂', '🎄', '✨', '🌹', '💐', '💍', '👶', '💋'];

  // Anniversary modal animation
  const anniversaryModalOpacity = useRef(new Animated.Value(0)).current;

  const openAnniversaryModal = () => {
    anniversaryModalOpacity.setValue(0);
    setShowAnniversaryModal(true);
    Animated.timing(anniversaryModalOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeAnniversaryModal = () => {
    Animated.timing(anniversaryModalOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowAnniversaryModal(false);
    });
  };

  // Calculate D-day
  const anniversaryDate = new Date(2022, 3, 15); // April 15, 2022
  const today = new Date();
  const diffTime = today.getTime() - anniversaryDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Helper function to calculate D-day
  const calculateDDay = (targetDate: Date) => {
    const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) return `D-${diff}`;
    if (diff < 0) return `D+${Math.abs(diff)}`;
    return 'D-Day';
  };

  // Helper function to format date in Korean
  const formatDateKorean = (date: Date) => {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  // Helper function to get next occurrence of a yearly anniversary
  const getNextYearlyDate = (originalDate: Date) => {
    const thisYear = today.getFullYear();
    const anniversaryThisYear = new Date(thisYear, originalDate.getMonth(), originalDate.getDate());

    // If this year's anniversary has passed, return next year's date
    if (anniversaryThisYear < today) {
      return new Date(thisYear + 1, originalDate.getMonth(), originalDate.getDate());
    }
    return anniversaryThisYear;
  };

  // Default anniversary list data (will sync with onboarding data in production)
  const defaultAnniversaries: Anniversary[] = [
    {
      id: 1,
      label: '1000일',
      targetDate: new Date(anniversaryDate.getTime() + 999 * 24 * 60 * 60 * 1000),
      icon: '🎉',
      bgColor: 'rgba(236, 72, 153, 0.25)',
      gradientColors: ['#A855F7', '#EC4899'] as const,
    },
    {
      id: 2,
      label: '크리스마스',
      targetDate: new Date(2025, 11, 25),
      icon: '🎄',
      bgColor: 'rgba(239, 68, 68, 0.25)',
      gradientColors: ['#EF4444', '#22C55E'] as const,
      isYearly: true,
    },
    {
      id: 3,
      label: '발렌타인데이',
      targetDate: new Date(2026, 1, 14),
      icon: '💝',
      bgColor: 'rgba(236, 72, 153, 0.25)',
      gradientColors: ['#EC4899', '#F43F5E'] as const,
      isYearly: true,
    },
    {
      id: 4,
      label: '화이트데이',
      targetDate: new Date(2026, 2, 14),
      icon: '🤍',
      bgColor: 'rgba(59, 130, 246, 0.25)',
      gradientColors: ['#3B82F6', '#06B6D4'] as const,
      isYearly: true,
    },
    {
      id: 5,
      label: '4주년',
      targetDate: new Date(2026, 3, 15),
      icon: '💖',
      bgColor: 'rgba(168, 85, 247, 0.25)',
      gradientColors: ['#A855F7', '#EC4899'] as const,
    },
    {
      id: 6,
      label: '1500일',
      targetDate: new Date(anniversaryDate.getTime() + 1499 * 24 * 60 * 60 * 1000),
      icon: '✨',
      bgColor: 'rgba(251, 191, 36, 0.25)',
      gradientColors: ['#FBBF24', '#F59E0B'] as const,
    },
  ];

  // Combine default and custom anniversaries
  const allAnniversaries = [...defaultAnniversaries, ...customAnniversaries];

  // Process anniversaries: apply yearly logic and filter/sort
  const anniversaries = allAnniversaries
    .map((ann) => {
      // For yearly anniversaries, calculate the next occurrence
      const effectiveDate = ann.isYearly ? getNextYearlyDate(ann.targetDate) : ann.targetDate;
      return {
        ...ann,
        targetDate: effectiveDate,
        date: formatDateKorean(effectiveDate),
        dDay: calculateDDay(effectiveDate),
      };
    })
    .filter((ann) => ann.targetDate >= today)
    .sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setBackgroundImage({ uri: result.assets[0].uri });
      setShowImagePickerModal(false);
    }
  };

  const handleResetBackground = () => {
    resetToDefault();
    setShowImagePickerModal(false);
  };

  // Gradient color options for new anniversaries
  const gradientOptions: readonly [string, string][] = [
    ['#A855F7', '#EC4899'],
    ['#EC4899', '#F43F5E'],
    ['#3B82F6', '#06B6D4'],
    ['#22C55E', '#10B981'],
    ['#FBBF24', '#F59E0B'],
    ['#EF4444', '#F97316'],
  ];

  // Handle add anniversary form submission
  const handleAddAnniversary = () => {
    if (newAnniversaryName.trim()) {
      // Create new anniversary with yearly repeat
      const newAnniversary: Anniversary = {
        id: Date.now(), // Unique ID based on timestamp
        label: newAnniversaryName.trim(),
        targetDate: newAnniversaryDate,
        icon: newAnniversaryIcon,
        bgColor: 'rgba(168, 85, 247, 0.25)',
        gradientColors: gradientOptions[Math.floor(Math.random() * gradientOptions.length)],
        isYearly: true, // User-added anniversaries repeat yearly
      };

      // Add to custom anniversaries
      setCustomAnniversaries((prev) => [...prev, newAnniversary]);

      // Reset form and close modal, then open anniversary list
      setNewAnniversaryIcon('💝');
      setNewAnniversaryName('');
      setNewAnniversaryDate(new Date());
      setShowAddAnniversary(false);
      // Show the anniversary modal after adding
      setTimeout(() => openAnniversaryModal(), 100);
    }
  };

  // Handle edit anniversary
  const handleEditAnniversary = (anniversary: Anniversary) => {
    setEditingAnniversary(anniversary);
    setEditAnniversaryIcon(anniversary.icon);
    setEditAnniversaryName(anniversary.label);
    setEditAnniversaryDate(anniversary.targetDate);
    setShowEditEmojiPicker(false);
    setShowEditDatePicker(false);
    setShowAnniversaryModal(false);
    setShowEditAnniversary(true);
  };

  // Handle save edited anniversary
  const handleSaveEditAnniversary = () => {
    if (editingAnniversary && editAnniversaryName.trim()) {
      setCustomAnniversaries((prev) =>
        prev.map((ann) =>
          ann.id === editingAnniversary.id
            ? {
                ...ann,
                label: editAnniversaryName.trim(),
                icon: editAnniversaryIcon,
                targetDate: editAnniversaryDate,
              }
            : ann
        )
      );
      setShowEditAnniversary(false);
      setEditingAnniversary(null);
      setTimeout(() => openAnniversaryModal(), 100);
    }
  };

  // Handle delete anniversary
  const handleDeleteAnniversary = (anniversary: Anniversary) => {
    Alert.alert(
      '기념일 삭제',
      `"${anniversary.label}" 기념일을 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setCustomAnniversaries((prev) =>
              prev.filter((ann) => ann.id !== anniversary.id)
            );
          },
        },
      ]
    );
  };

  // Format date for display in date picker
  const formatDisplayDate = (date: Date) => {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  return (
    <View style={styles.container}>
      {/* Background Image - No blur like Figma */}
      <ImageBackground
        source={backgroundImage}
        style={styles.backgroundImage}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Anniversary Info - Top Section */}
        <View style={styles.anniversarySection}>
          <Text style={styles.coupleNames}>
            <Text>지민 </Text>
            <Text style={styles.heartEmoji}>❤️</Text>
            <Text> 준호</Text>
          </Text>
          <Pressable
            onPress={openAnniversaryModal}
            style={styles.anniversaryButton}
          >
            {/* Day count in row */}
            <View style={styles.dDayRow}>
              <Text style={styles.dDayNumber}>{diffDays}</Text>
              <Text style={styles.dDayUnit}>일째</Text>
            </View>
          </Pressable>
        </View>

        {/* Polaroid centered */}
        <View style={styles.polaroidContainer}>
          <View style={styles.polaroid}>
            {/* Photo area */}
            <View style={styles.polaroidImageContainer}>
              <Image
                source={backgroundImage}
                style={styles.polaroidImage}
                resizeMode="cover"
              />
              {/* Subtle vignette overlay */}
              <View style={styles.vignetteOverlay} />
            </View>

            {/* Bottom text area with highlighter effect */}
            <View style={styles.polaroidBottom}>
              {/* First line - with highlighter, each word tilted differently */}
              <View style={styles.sloganStrip}>
                <View style={styles.highlighterSlogan} />
                <View style={styles.sloganWords}>
                  <Text style={[styles.polaroidSlogan, styles.word1]}>Everyday,</Text>
                  <Text style={[styles.polaroidSlogan, styles.word2]}> a</Text>
                  <Text style={[styles.polaroidSlogan, styles.word3]}> new</Text>
                  <Text style={[styles.polaroidSlogan, styles.word4]}> date</Text>
                </View>
              </View>
              {/* Second line - Daydate with highlighter */}
              <View style={styles.brandRow}>
                <View style={styles.brandStrip}>
                  <View style={styles.highlighter} />
                  <Text style={styles.polaroidBrand}>Daydate</Text>
                </View>
                {/* Image Change Button */}
                <Pressable
                  onPress={() => setShowImagePickerModal(true)}
                  style={styles.imageChangeButton}
                >
                  <ImageIcon color="#333" size={20} />
                </Pressable>
              </View>
            </View>

            {/* Paper texture overlay for realistic matte finish */}
            <View style={styles.paperTexture} pointerEvents="none" />

            {/* Edge highlight for 3D effect */}
            <View style={styles.edgeHighlight} pointerEvents="none" />

            {/* Inner shadow for depth */}
            <View style={styles.innerShadow} pointerEvents="none" />
          </View>
        </View>
      </View>

      {/* Anniversary Modal with Blur */}
      <Modal
        visible={showAnniversaryModal}
        transparent
        animationType="none"
        onRequestClose={closeAnniversaryModal}
      >
        <Animated.View style={[styles.blurContainer, { opacity: anniversaryModalOpacity }]}>
          <BlurView intensity={80} tint="dark" style={styles.blurOverlay}>
            <TouchableWithoutFeedback onPress={closeAnniversaryModal}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.anniversaryModalContent}>
              <View style={styles.anniversaryModalHeader}>
                <Text style={styles.anniversaryModalTitle}>기념일</Text>
                <Pressable
                  onPress={closeAnniversaryModal}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} />
                </Pressable>
              </View>
              <View style={styles.anniversaryHeaderDivider} />
              <ScrollView
                style={styles.anniversaryListContainer}
                contentContainerStyle={styles.anniversaryListContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
              >
                {anniversaries.map((anniversary) => (
                  <SwipeableAnniversaryCard
                    key={anniversary.id}
                    anniversary={anniversary}
                    isCustom={customAnniversaries.some(ca => ca.id === anniversary.id)}
                    onEdit={() => handleEditAnniversary(anniversary)}
                    onDelete={() => handleDeleteAnniversary(anniversary)}
                  />
                ))}
              </ScrollView>
              <View style={styles.anniversaryFooterDivider} />
              <View style={styles.anniversaryFooter}>
                <Pressable
                  style={styles.addAnniversaryButton}
                  onPress={() => {
                    // Reset all form states before opening
                    setNewAnniversaryIcon('💝');
                    setNewAnniversaryName('');
                    setNewAnniversaryDate(new Date());
                    setShowEmojiPicker(false);
                    setShowDatePicker(false);
                    // Simultaneously switch modals for faster transition
                    setShowAnniversaryModal(false);
                    setShowAddAnniversary(true);
                  }}
                >
                  <Text style={styles.addAnniversaryText}>기념일 추가</Text>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </Animated.View>
      </Modal>

      {/* Image Picker Modal with Blur */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowImagePickerModal(false)}
        >
          <BlurView intensity={60} tint="dark" style={styles.blurOverlay}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.imagePickerModal}>
                <View style={styles.imagePickerHeader}>
                  <Text style={styles.imagePickerTitle}>배경사진 변경</Text>
                  <Pressable
                    onPress={() => setShowImagePickerModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <X color={COLORS.white} size={18} />
                  </Pressable>
                </View>

                <Text style={styles.imagePickerDescription}>
                  선택한 이미지가 모든 페이지의 배경으로 적용됩니다
                </Text>

                <View style={styles.imagePickerButtons}>
                  <Pressable
                    style={styles.imagePickerButtonPrimary}
                    onPress={handlePickImage}
                  >
                    <Text style={styles.imagePickerButtonPrimaryText}>
                      갤러리에서 선택
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.imagePickerButtonSecondary}
                    onPress={handleResetBackground}
                  >
                    <Text style={styles.imagePickerButtonSecondaryText}>
                      기본 이미지로 변경
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </BlurView>
        </Pressable>
      </Modal>

      {/* Add Anniversary Modal */}
      <Modal
        visible={showAddAnniversary}
        transparent
        animationType="none"
        onRequestClose={() => setShowAddAnniversary(false)}
      >
        <BlurView intensity={80} tint="dark" style={styles.blurOverlay}>
          <TouchableWithoutFeedback onPress={() => setShowAddAnniversary(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.addAnniversaryModalContent}>
              {/* Header */}
              <View style={styles.addAnniversaryHeader}>
                <Text style={styles.addAnniversaryTitle}>새 기념일 추가</Text>
                <Pressable
                  onPress={() => setShowAddAnniversary(false)}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} />
                </Pressable>
              </View>
              <View style={styles.anniversaryHeaderDivider} />

              {/* Form Content */}
              <ScrollView
                style={styles.addAnniversaryForm}
                contentContainerStyle={styles.addAnniversaryFormContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Icon + Name Input Combined */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>기념일</Text>
                  <View style={styles.iconNameRow}>
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <Text style={styles.selectedIconSmall}>{newAnniversaryIcon}</Text>
                    </Pressable>
                    <TextInput
                      style={styles.nameInput}
                      placeholder="기념일 이름을 입력하세요"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={newAnniversaryName}
                      onChangeText={setNewAnniversaryName}
                    />
                  </View>

                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <View style={styles.emojiPickerContainer}>
                      <View style={styles.emojiGrid}>
                        {emojiOptions.map((emoji, index) => (
                          <Pressable
                            key={index}
                            style={[
                              styles.emojiOption,
                              newAnniversaryIcon === emoji && styles.emojiOptionSelected,
                            ]}
                            onPress={() => {
                              setNewAnniversaryIcon(emoji);
                              setShowEmojiPicker(false);
                            }}
                          >
                            <Text style={styles.emojiOptionText}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Date Picker */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>날짜</Text>
                  <Pressable
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.datePickerButtonText}>
                      {formatDisplayDate(newAnniversaryDate)}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>

              {/* Date Picker */}
              {showDatePicker && (
                <DateTimePicker
                  value={newAnniversaryDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setNewAnniversaryDate(selectedDate);
                    }
                  }}
                  locale="ko"
                />
              )}

              {/* Footer */}
              <View style={styles.anniversaryFooterDivider} />
              <View style={styles.addAnniversaryFooter}>
                <Pressable
                  style={[
                    styles.submitButton,
                    !newAnniversaryName.trim() && styles.submitButtonDisabled,
                  ]}
                  onPress={handleAddAnniversary}
                  disabled={!newAnniversaryName.trim()}
                >
                  <View style={styles.submitButtonInner}>
                    <Text style={styles.submitButtonText}>추가하기</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </BlurView>
      </Modal>

      {/* Edit Anniversary Modal */}
      <Modal
        visible={showEditAnniversary}
        transparent
        animationType="none"
        onRequestClose={() => {
          setShowEditAnniversary(false);
          setEditingAnniversary(null);
        }}
      >
        <BlurView intensity={80} tint="dark" style={styles.blurOverlay}>
          <TouchableWithoutFeedback onPress={() => {
            setShowEditAnniversary(false);
            setEditingAnniversary(null);
          }}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.addAnniversaryModalContent}>
              {/* Header */}
              <View style={styles.addAnniversaryHeader}>
                <Text style={styles.addAnniversaryTitle}>기념일 수정</Text>
                <Pressable
                  onPress={() => {
                    setShowEditAnniversary(false);
                    setEditingAnniversary(null);
                  }}
                  style={styles.modalCloseButton}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} />
                </Pressable>
              </View>
              <View style={styles.anniversaryHeaderDivider} />

              {/* Form Content */}
              <ScrollView
                style={styles.addAnniversaryForm}
                contentContainerStyle={styles.addAnniversaryFormContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Icon + Name Input Combined */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>기념일</Text>
                  <View style={styles.iconNameRow}>
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
                    >
                      <Text style={styles.selectedIconSmall}>{editAnniversaryIcon}</Text>
                    </Pressable>
                    <TextInput
                      style={styles.nameInput}
                      placeholder="기념일 이름을 입력하세요"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={editAnniversaryName}
                      onChangeText={setEditAnniversaryName}
                    />
                  </View>

                  {/* Emoji Picker */}
                  {showEditEmojiPicker && (
                    <View style={styles.emojiPickerContainer}>
                      <View style={styles.emojiGrid}>
                        {emojiOptions.map((emoji, index) => (
                          <Pressable
                            key={index}
                            style={[
                              styles.emojiOption,
                              editAnniversaryIcon === emoji && styles.emojiOptionSelected,
                            ]}
                            onPress={() => {
                              setEditAnniversaryIcon(emoji);
                              setShowEditEmojiPicker(false);
                            }}
                          >
                            <Text style={styles.emojiOptionText}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Date Picker */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>날짜</Text>
                  <Pressable
                    style={styles.datePickerButton}
                    onPress={() => setShowEditDatePicker(true)}
                  >
                    <Text style={styles.datePickerButtonText}>
                      {formatDisplayDate(editAnniversaryDate)}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>

              {/* Date Picker */}
              {showEditDatePicker && (
                <DateTimePicker
                  value={editAnniversaryDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, selectedDate) => {
                    setShowEditDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setEditAnniversaryDate(selectedDate);
                    }
                  }}
                  locale="ko"
                />
              )}

              {/* Footer */}
              <View style={styles.anniversaryFooterDivider} />
              <View style={styles.addAnniversaryFooter}>
                <Pressable
                  style={[
                    styles.submitButton,
                    !editAnniversaryName.trim() && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSaveEditAnniversary}
                  disabled={!editAnniversaryName.trim()}
                >
                  <View style={styles.submitButtonInner}>
                    <Text style={styles.submitButtonText}>확인</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </BlurView>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  anniversarySection: {
    paddingTop: 90,
    paddingBottom: SPACING.lg,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  coupleNames: {
    fontSize: 18,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.fontFamily.display,
    fontWeight: '400',
    letterSpacing: 0.5,
    opacity: 0.95,
    marginBottom: SPACING.xl,
    backgroundColor: 'transparent',
  },
  heartEmoji: {
    fontFamily: 'System',
  },
  anniversaryButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dDayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: 'transparent',
  },
  dDayNumber: {
    fontSize: 56,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.fontFamily.display,
    fontWeight: '400',
    letterSpacing: 1,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  dDayUnit: {
    fontSize: 26,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.fontFamily.display,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginLeft: 8,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  polaroidContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 240,
  },
  polaroid: {
    width: 280,
    backgroundColor: '#F8F6F1',
    padding: 16,
    paddingBottom: 60,
    borderRadius: 2,
    // Multi-layer shadow for realistic depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
    position: 'relative',
    // Subtle border for paper edge effect
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  polaroidImageContainer: {
    aspectRatio: 1 / 1.15,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  polaroidImage: {
    width: '100%',
    height: '100%',
  },
  vignetteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  polaroidBottom: {
    position: 'absolute',
    bottom: -2,
    left: 16,
    right: 12,
    height: 72,
    justifyContent: 'flex-end',
  },
  sloganStrip: {
    position: 'relative',
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: -17,
    marginLeft: 4,
  },
  sloganWords: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  word1: {
    transform: [{ rotate: '-4deg' }],
  },
  word2: {
    transform: [{ rotate: '5deg' }],
  },
  word3: {
    transform: [{ rotate: '3deg' }],
  },
  word4: {
    transform: [{ rotate: '4deg' }],
  },
  highlighterSlogan: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 12,
    backgroundColor: '#DFD3C3',
    opacity: 0.7,
    transform: [{ rotate: '1deg' }],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandStrip: {
    position: 'relative',
    paddingHorizontal: 6,
    paddingVertical: 3,
    transform: [{ rotate: '1deg' }],
    marginLeft: 8,
  },
  highlighter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 12,
    backgroundColor: '#DFD3C3',
    opacity: 0.7,
    transform: [{ rotate: '-1deg' }],
  },
  polaroidSlogan: {
    fontSize: 26,
    color: '#4A4440',
    fontFamily: 'JustMeAgainDownHere',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  polaroidBrand: {
    fontSize: 26,
    color: '#4A4440',
    fontFamily: 'JustMeAgainDownHere',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  imageChangeButton: {
    padding: 6,
    marginRight: -4,
  },
  paperTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
    // Subtle noise/grain effect simulation
    backgroundColor: 'rgba(245, 242, 235, 0.3)',
    opacity: 0.4,
  },
  edgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
    // Top-left light edge (light source simulation)
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    // Bottom-right shadow edge
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    borderRightColor: 'rgba(0, 0, 0, 0.03)',
  },
  innerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
    // Simulate inner shadow with gradient-like border
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.02)',
    borderLeftColor: 'rgba(0, 0, 0, 0.015)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    flex: 1,
    width: '100%',
  },
  blurOverlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  anniversaryModalContent: {
    width: width - 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  anniversaryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  anniversaryHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 24,
  },
  anniversaryModalTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: 28,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anniversaryListContainer: {
    maxHeight: 300,
    overflow: 'hidden',
  },
  anniversaryListContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  anniversaryCard: {
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  anniversaryCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anniversaryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  anniversaryIcon: {
    fontSize: 24,
  },
  anniversaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  anniversaryDate: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  anniversaryBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 100,
  },
  anniversaryDDay: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '600',
  },
  anniversaryFooterDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 24,
  },
  anniversaryFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  addAnniversaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    borderRadius: 100,
  },
  addAnniversaryText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '500',
  },
  imagePickerModal: {
    width: width - 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 32,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imagePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  imagePickerTitle: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '600',
  },
  imagePickerDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: SPACING.lg,
  },
  imagePickerButtons: {
    gap: SPACING.sm,
  },
  imagePickerButtonPrimary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
  },
  imagePickerButtonPrimaryText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  imagePickerButtonSecondary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  imagePickerButtonSecondaryText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
  },
  // Add Anniversary Modal Styles
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  addAnniversaryModalContent: {
    width: width - 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    maxHeight: height * 0.7,
  },
  addAnniversaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  addAnniversaryTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: 28,
  },
  addAnniversaryForm: {
    maxHeight: 320,
  },
  addAnniversaryFormContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  formSection: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
    fontWeight: '500',
  },
  iconSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIcon: {
    fontSize: 32,
  },
  iconSelectorHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emojiPickerContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  emojiOption: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiOptionSelected: {
    backgroundColor: 'rgba(168, 85, 247, 0.4)',
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  emojiOptionText: {
    fontSize: 24,
  },
  iconNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIconSmall: {
    fontSize: 28,
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButtonText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '500',
  },
  addAnniversaryFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  submitButton: {
    borderRadius: 100,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonInner: {
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
});
