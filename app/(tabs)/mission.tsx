import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  Animated,
  Image,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { easeGradient } from 'react-native-easing-gradient';
import { MapPin, Bookmark, Sparkles, X } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useMissionStore, MOOD_OPTIONS, type TodayMood, type MissionGenerationAnswers } from '@/stores/missionStore';
import { useBackground } from '@/contexts';
import { BookmarkedMissionsPage } from '@/components/BookmarkedMissionsPage';
import { CircularLoadingAnimation } from '@/components/CircularLoadingAnimation';
import type { Mission, FeaturedMission } from '@/types';
import { db, isDemoMode } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');

const CARD_WIDTH = width * 0.82;
const CARD_HEIGHT = 468;
const CARD_MARGIN = 8;
const SNAP_INTERVAL = CARD_WIDTH + CARD_MARGIN * 2;

// Easing gradient for smooth blur transition
const { colors: blurGradientColors, locations: blurGradientLocations } = easeGradient({
  colorStops: {
    0: { color: 'transparent' },
    0.5: { color: 'rgba(0,0,0,0.99)' },
    1: { color: 'black' },
  },
});

export default function MissionScreen() {
  const router = useRouter();
  const { backgroundImage } = useBackground();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBookmarkedMissions, setShowBookmarkedMissions] = useState(false);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canMeetToday, setCanMeetToday] = useState<boolean | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<TodayMood[]>([]);
  const [featuredMissions, setFeaturedMissions] = useState<Mission[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList<Mission>>(null);

  const {
    keptMissions,
    keepMission,
    isKeptMission,
    canStartMission,
    isTodayCompletedMission,
    hasTodayMissions,
    getTodayMissions,
    generateTodayMissions,
    checkAndResetMissions,
  } = useMissionStore();

  // Get today's missions or empty array
  const todayMissions = getTodayMissions();
  const hasGeneratedMissions = hasTodayMissions();

  // Combine AI-generated missions with featured missions
  const allMissions = [...todayMissions, ...featuredMissions];

  // Load featured missions on mount and focus
  const loadFeaturedMissions = useCallback(async () => {
    if (isDemoMode) return; // Skip in demo mode

    setIsLoadingFeatured(true);
    try {
      const { data, error } = await db.featuredMissions.getActiveForToday();

      if (error) {
        console.error('Error loading featured missions:', error);
        return;
      }

      if (data && data.length > 0) {
        // Convert featured missions to Mission format
        const convertedMissions: Mission[] = data.map((fm) => ({
          id: fm.id,
          title: fm.title,
          description: fm.description,
          category: fm.category as Mission['category'],
          difficulty: fm.difficulty as Mission['difficulty'],
          locationType: fm.location_type as Mission['locationType'],
          tags: fm.tags,
          icon: fm.icon,
          imageUrl: fm.image_url,
          isPremium: false, // Featured missions are free
        }));

        setFeaturedMissions(convertedMissions);
      }
    } catch (error) {
      console.error('Error loading featured missions:', error);
    } finally {
      setIsLoadingFeatured(false);
    }
  }, []);

  // Check for date reset on focus
  useFocusEffect(
    useCallback(() => {
      checkAndResetMissions();
      setShowBookmarkedMissions(false);
      loadFeaturedMissions(); // Load featured missions on focus
    }, [checkAndResetMissions, loadFeaturedMissions])
  );

  // Check location permission
  const checkLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking location permission:', error);
      return false;
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  };

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleGenerateButtonPress = async () => {
    // Check if location permission is granted
    const hasPermission = await checkLocationPermission();

    if (!hasPermission) {
      Alert.alert(
        '위치 권한 필요',
        '미션을 생성하려면 위치 정보 권한이 필요해요.\n위치 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '권한 허용',
            onPress: async () => {
              const granted = await requestLocationPermission();
              if (granted) {
                setShowGenerationModal(true);
              } else {
                Alert.alert(
                  '위치 권한 거부됨',
                  '위치 권한이 거부되었어요. 설정에서 위치 권한을 허용해주세요.',
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '설정으로 이동', onPress: handleOpenSettings },
                  ]
                );
              }
            },
          },
        ]
      );
      return;
    }

    // Permission granted, open modal
    setShowGenerationModal(true);
  };

  // Handle mission generation
  const handleGenerateMissions = useCallback(async () => {
    if (canMeetToday === null || selectedMoods.length === 0) return;

    // Close modal first
    setShowGenerationModal(false);

    // Show loading animation
    setIsGenerating(true);

    // Prepare answers
    const answers: MissionGenerationAnswers = {
      canMeetToday,
      todayMoods: selectedMoods,
    };

    // Generate missions (this calls AI API)
    await generateTodayMissions(answers);

    // Get the newly generated missions
    const newMissions = getTodayMissions();

    // Prefetch all mission images before hiding loading animation
    if (newMissions.length > 0) {
      try {
        const imagePromises = newMissions
          .filter(mission => mission.imageUrl)
          .map(mission => Image.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`));

        // Wait for all images to load (with timeout fallback)
        await Promise.race([
          Promise.all(imagePromises),
          new Promise(resolve => setTimeout(resolve, 5000)), // 5초 타임아웃
        ]);
      } catch (error) {
        console.log('Image prefetch error:', error);
        // Continue even if prefetch fails
      }
    }

    // Reset carousel state before showing
    setCurrentIndex(0);
    scrollX.setValue(0);

    // Hide loading animation after images are loaded
    setIsGenerating(false);

    // Scroll to beginning after a short delay to ensure FlatList is mounted
    setTimeout(() => {
      scrollViewRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 100);

    // Reset form
    setCanMeetToday(null);
    setSelectedMoods([]);
  }, [canMeetToday, selectedMoods, generateTodayMissions, getTodayMissions, scrollX]);

  const toggleMood = (mood: TodayMood) => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else {
      setSelectedMoods([...selectedMoods, mood]);
    }
  };

  const isGenerationFormValid = canMeetToday !== null && selectedMoods.length > 0;

  const handleMissionPress = useCallback((missionId: string) => {
    router.push(`/mission/${missionId}`);
  }, [router]);

  const handleDotPress = (index: number) => {
    scrollViewRef.current?.scrollToIndex({
      index,
      animated: true,
    });
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const renderCard = useCallback(
    ({ item, index }: { item: Mission; index: number }) => {
      const inputRange = [
        (index - 1) * SNAP_INTERVAL,
        index * SNAP_INTERVAL,
        (index + 1) * SNAP_INTERVAL,
      ];

      const scale = scrollX.interpolate({
        inputRange,
        outputRange: [0.9, 1, 0.9],
        extrapolate: 'clamp',
      });

      const opacity = scrollX.interpolate({
        inputRange,
        outputRange: [0, 1, 0],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          <View style={styles.cardInner}>
            <MissionCardContent
              mission={item}
              onStartPress={() => handleMissionPress(item.id)}
              onKeepPress={() => keepMission(item)}
              isKept={isKeptMission(item.id)}
              canStart={canStartMission(item.id)}
              isCompletedToday={isTodayCompletedMission(item.id)}
            />
          </View>
        </Animated.View>
      );
    },
    [scrollX, handleMissionPress, isTodayCompletedMission]
  );

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

      {/* BookmarkedMissionsPage Overlay */}
      {showBookmarkedMissions && (
        <View style={styles.bookmarkedOverlay}>
          <BookmarkedMissionsPage
            onBack={() => setShowBookmarkedMissions(false)}
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>오늘의 미션</Text>
          <Text style={styles.headerSubtitle}>
            오늘은 어떤 순간을 함께할까요?
          </Text>
        </View>
        <Pressable
          style={styles.historyButton}
          onPress={() => setShowBookmarkedMissions(true)}
        >
          <Bookmark color={COLORS.white} size={20} strokeWidth={2} />
          {keptMissions.length > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{keptMissions.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Card Carousel or Empty State */}
      <View style={styles.cardContainer}>
        {hasGeneratedMissions || featuredMissions.length > 0 ? (
          <View style={styles.carouselWrapper}>
            <Animated.FlatList
              key={`mission-list-${allMissions.length}`}
              ref={scrollViewRef}
              data={allMissions}
              keyExtractor={(item) => item.id}
              renderItem={renderCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              disableIntervalMomentum={true}
              contentContainerStyle={styles.carouselContent}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, index) => ({
                length: SNAP_INTERVAL,
                offset: SNAP_INTERVAL * index,
                index,
              })}
              extraData={[hasGeneratedMissions, allMissions.map(m => m.id).join(',')]}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              removeClippedSubviews={false}
            />

            {/* Dots Indicator - Positioned at bottom of carousel */}
            <View style={styles.dotsContainer}>
              {allMissions.map((_, index) => (
                <Pressable
                  key={index}
                  onPress={() => handleDotPress(index)}
                  style={[
                    styles.dot,
                    index === currentIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        ) : (
          /* Empty State - Generate Button or Loading Animation */
          <View style={styles.emptyStateContainer}>
            {isGenerating ? (
              <View style={styles.loadingAnimationWrapper}>
                <CircularLoadingAnimation size={100} strokeWidth={6} color={COLORS.white} />
                <Text style={styles.loadingAnimationText}>미션을 생성하고 있어요</Text>
                <Text style={styles.loadingAnimationSubtext}>잠시만 기다려주세요</Text>
              </View>
            ) : (
              <Pressable
                style={styles.glassGenerateButton}
                onPress={handleGenerateButtonPress}
              >
                <BlurView
                  intensity={30}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.glassGenerateButtonText}>오늘의 미션</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Mission Generation Modal */}
      <Modal
        visible={showGenerationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGenerationModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.whiteModalContainer}>
            {/* Modal Header */}
            <View style={styles.whiteModalHeader}>
              <View style={styles.modalHeaderSpacer} />
              <Text style={styles.whiteModalTitle}>오늘의 미션</Text>
              <Pressable
                style={styles.whiteModalCloseButton}
                onPress={() => {
                  setShowGenerationModal(false);
                  setCanMeetToday(null);
                  setSelectedMoods([]);
                }}
              >
                <X color={COLORS.black} size={24} />
              </Pressable>
            </View>

            {/* Question 1: Can Meet Today */}
            <View style={styles.whiteQuestionSection}>
              <Text style={styles.whiteQuestionLabel}>오늘 만날 수 있나요?</Text>
              <View style={styles.whiteBinaryOptions}>
                <Pressable
                  style={[
                    styles.whiteBinaryOption,
                    canMeetToday === true && styles.whiteBinaryOptionActive,
                  ]}
                  onPress={() => setCanMeetToday(true)}
                >
                  <Text style={[
                    styles.whiteBinaryOptionText,
                    canMeetToday === true && styles.whiteBinaryOptionTextActive,
                  ]}>
                    네, 만나요
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.whiteBinaryOption,
                    canMeetToday === false && styles.whiteBinaryOptionActive,
                  ]}
                  onPress={() => setCanMeetToday(false)}
                >
                  <Text style={[
                    styles.whiteBinaryOptionText,
                    canMeetToday === false && styles.whiteBinaryOptionTextActive,
                  ]}>
                    아니요
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Question 2: Today's Mood */}
            <View style={styles.whiteQuestionSection}>
              <Text style={styles.whiteQuestionLabel}>오늘 원하는 분위기는? (모두 선택)</Text>
              <View style={styles.whiteMoodOptions}>
                {MOOD_OPTIONS.map((mood, index) => {
                  // 2-3-2 layout: first 2 buttons 47%, next 3 buttons 30%, last 2 buttons 47%
                  const buttonWidth = index < 2 || index > 4 ? '47%' : '30%';
                  return (
                    <Pressable
                      key={mood.id}
                      style={[
                        styles.whiteMoodOption,
                        { width: buttonWidth },
                        selectedMoods.includes(mood.id) && styles.whiteMoodOptionActive,
                      ]}
                      onPress={() => toggleMood(mood.id)}
                    >
                      <Text style={styles.whiteMoodOptionIcon}>{mood.icon}</Text>
                      <Text style={[
                        styles.whiteMoodOptionText,
                        selectedMoods.includes(mood.id) && styles.whiteMoodOptionTextActive,
                      ]}>
                        {mood.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Generate Button */}
            <View style={styles.whiteModalButtonContainer}>
              <Pressable
                style={[
                  styles.whiteModalGenerateButton,
                  !isGenerationFormValid && styles.whiteModalGenerateButtonDisabled,
                ]}
                onPress={handleGenerateMissions}
                disabled={!isGenerationFormValid || isGenerating}
              >
                {isGenerating ? (
                  <View style={styles.generatingContent}>
                    <ActivityIndicator color={COLORS.white} size="small" />
                    <Text style={styles.whiteModalGenerateButtonText}>생성 중...</Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.whiteModalGenerateButtonText,
                    !isGenerationFormValid && styles.whiteModalGenerateButtonTextDisabled,
                  ]}>미션 생성하기</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface MissionCardContentProps {
  mission: Mission;
  onStartPress?: () => void;
  onKeepPress?: () => boolean | void;
  isKept?: boolean;
  canStart?: boolean;
  isCompletedToday?: boolean;
}

function MissionCardContent({ mission, onStartPress, onKeepPress, isKept, canStart = true, isCompletedToday = false }: MissionCardContentProps) {
  const locationText =
    mission.locationType === 'indoor'
      ? '실내'
      : mission.locationType === 'outdoor'
        ? '야외'
        : '무관';

  const blurHeight = CARD_HEIGHT * 0.75; // Blur covers bottom 55% of card

  const handleKeepPress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    // Show message if mission is already completed today
    if (isCompletedToday) {
      Alert.alert(
        '보관 불가',
        '이미 완료한 미션은 보관할 수 없어요.',
        [{ text: '확인' }]
      );
      return;
    }

    // Show message if already kept
    if (isKept) {
      return;
    }

    Alert.alert(
      '미션 보관',
      `'${mission.title}' 미션을 보관함에 저장할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '저장',
          onPress: () => {
            const success = onKeepPress?.();
            if (success === false) {
              Alert.alert(
                '보관 제한',
                '미션은 최대 5개까지만 보관할 수 있어요.\n보관된 미션을 삭제한 후 다시 시도해주세요.',
                [{ text: '확인' }]
              );
            }
          },
        },
      ]
    );
  };

  const handleStartPress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    // Show message if can't start (already completed another mission today)
    if (!canStart && !isCompletedToday) {
      Alert.alert(
        '미션 시작 불가',
        '오늘 가능한 미션을 모두 완료했어요.\n내일 다시 도전해보세요!',
        [{ text: '확인' }]
      );
      return;
    }

    onStartPress?.();
  };

  return (
    <View style={styles.cardContentWrapper}>
      {/* Background Image */}
      <Image
        source={{ uri: `${mission.imageUrl}?w=800&h=1000&fit=crop` }}
        style={styles.cardImage}
        resizeMode="cover"
      />

      {/* Blur Container with Masked Gradient */}
      <View style={[styles.blurContainer, { height: blurHeight }]}>
        <MaskedView
          maskElement={
            <LinearGradient
              locations={blurGradientLocations as [number, number, ...number[]]}
              colors={blurGradientColors as [string, string, ...string[]]}
              style={StyleSheet.absoluteFill}
            />
          }
          style={StyleSheet.absoluteFill}
        >
          <BlurView
            intensity={50}
            tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
        {/* Dark Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
          locations={[0, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Location Badge */}
        <View style={styles.locationBadge}>
          <View style={styles.locationIcon}>
            <MapPin color={COLORS.white} size={16} />
          </View>
          <Text style={styles.locationText}>{locationText}</Text>
        </View>

        {/* Title */}
        <Text style={styles.missionTitle}>{mission.title}</Text>

        {/* Description */}
        <Text style={styles.missionDescription}>{mission.description}</Text>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {mission.tags.map((tag, index) => (
            <Text key={index} style={styles.tagText}>
              #{tag}
            </Text>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsRow}>
          {onKeepPress && (
            <Pressable
              style={[
                styles.keepActionButton,
                (isKept || isCompletedToday) && styles.keepActionButtonKept,
              ]}
              onPress={handleKeepPress}
            >
              <BlurView
                intensity={30}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.keepButtonContent}>
                {isKept && (
                  <Bookmark
                    color={COLORS.white}
                    size={16}
                    fill={COLORS.white}
                  />
                )}
                <Text style={styles.keepActionButtonText}>
                  {isKept ? '보관됨' : 'Keep'}
                </Text>
              </View>
            </Pressable>
          )}
          {onStartPress && (
            <Pressable
              style={[
                styles.startActionButton,
                !canStart && !isCompletedToday && styles.startActionButtonDisabled,
              ]}
              onPress={handleStartPress}
            >
              <Text style={[
                styles.startActionButtonText,
                !canStart && !isCompletedToday && styles.startActionButtonTextDisabled,
              ]}>
                {isCompletedToday ? '완료' : '시작하기'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bookmarkedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: 4,
  },
  historyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 120,
  },
  carouselWrapper: {
    height: CARD_HEIGHT + 40,
  },
  carouselContent: {
    paddingHorizontal: (width - CARD_WIDTH) / 2 - CARD_MARGIN,
    alignItems: 'center',
  },
  cardStack: {
    width: '100%',
    maxWidth: 324,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginHorizontal: CARD_MARGIN,
    borderRadius: 45,
    backgroundColor: 'transparent',
  },
  cardInner: {
    flex: 1,
    borderRadius: 45,
    overflow: 'hidden',
  },
  cardPressable: {
    flex: 1,
  },
  cardContentWrapper: {
    flex: 1,
  },
  cardImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  blurContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  cardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
    zIndex: 2,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 12,
  },
  locationIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  locationText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  missionTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 34,
  },
  missionDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keepActionButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  keepActionButtonKept: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  keepButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  keepActionButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  startActionButton: {
    flex: 1,
    height: 52,
    borderRadius: 100,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  startActionButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  startActionButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  startActionButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 32,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: '700',
  },
  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  glassGenerateButton: {
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 100,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  glassGenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  loadingAnimationWrapper: {
    alignItems: 'center',
    gap: 20,
  },
  loadingAnimationText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 8,
  },
  loadingAnimationSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
  },
  // White Modal Styles
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  whiteModalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  whiteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  whiteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  whiteModalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteQuestionSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  whiteQuestionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  whiteBinaryOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  whiteBinaryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: SPACING.md,
    borderRadius: 100,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  whiteBinaryOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteBinaryOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  whiteBinaryOptionTextActive: {
    color: COLORS.black,
  },
  whiteMoodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  whiteMoodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  whiteMoodOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteMoodOptionIcon: {
    fontSize: 16,
  },
  whiteMoodOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  whiteMoodOptionTextActive: {
    color: COLORS.black,
  },
  whiteModalButtonContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  whiteModalGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    backgroundColor: COLORS.black,
  },
  whiteModalGenerateButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  whiteModalGenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  whiteModalGenerateButtonTextDisabled: {
    color: '#999',
  },
  generatingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
