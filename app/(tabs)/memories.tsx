import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Animated,
  TextInput,
  Platform,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useConsistentBottomInset } from '@/hooks/useConsistentBottomInset';
import * as ImagePicker from 'expo-image-picker';
import * as Localization from 'expo-localization';
import * as MediaLibrary from 'expo-media-library';
import { Paths, File as ExpoFile } from 'expo-file-system';
import { ChevronDown, MapPin, Clock, X, Plus, MoreHorizontal, Trash2, Check, Download, Copy, Pencil } from 'lucide-react-native';
import ReanimatedModule, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import PagerView from 'react-native-pager-view';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, rs, fp, SCREEN_WIDTH, SCREEN_HEIGHT, isLargeDevice } from '@/constants/design';
import { useMemoryStore, SAMPLE_MEMORIES } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useCoupleSyncStore, AlbumPhoto } from '@/stores/coupleSyncStore';
import { useBackground } from '@/contexts';
import { isDemoMode, db } from '@/lib/supabase';
import { extractPhotoMetadata } from '@/utils/extractExif';

// Use responsive screen dimensions
const width = SCREEN_WIDTH;
const height = SCREEN_HEIGHT;

// Large device detection for layout adjustments (replaces IS_LARGE_DEVICE)
const IS_LARGE_DEVICE = isLargeDevice();

// Device currency based on locale settings
const deviceCurrency = Localization.getLocales()?.[0]?.currencyCode || 'KRW';

type MemoryType = typeof SAMPLE_MEMORIES[0];

interface MonthData {
  year: string;
  month: string;
  monthName: string;
  missions: (MemoryType | AlbumPhoto)[];
}

export default function MemoriesScreen() {
  const { t, i18n } = useTranslation();
  const { backgroundImage } = useBackground();
  const { memories, loadFromDB } = useMemoryStore();
  const { user, partner, couple } = useAuthStore();
  const insets = useConsistentBottomInset();

  // Track if navigation/interaction is complete for deferred operations
  const [isInteractionComplete, setIsInteractionComplete] = useState(false);

  // Defer heavy operations until after navigation completes
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsInteractionComplete(true);
    });
    return () => handle.cancel();
  }, []);

  // Album sync store
  const {
    isInitialized: isSyncInitialized,
    coupleId,
    allCouplePhotos,
    loadAllPhotos,
    getOrCreateDefaultAlbum,
    addPhotos: syncAddPhotos,
    removePhoto: syncRemovePhoto,
    updatePhotoMessage: syncUpdatePhotoMessage,
  } = useCoupleSyncStore();

  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<MemoryType | AlbumPhoto | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Combine store memories with SAMPLE_MEMORIES (store memories take priority)
  // This needs to be defined early for album photo lookups
  const allMemories = React.useMemo(() => {
    // Get IDs of memories from store that are NOT from SAMPLE_MEMORIES
    const storeOnlyMemories = memories.filter(
      (m) => !SAMPLE_MEMORIES.some((s) => s.id === m.id)
    );
    // Combine: store-only memories first, then SAMPLE_MEMORIES
    return [...storeOnlyMemories, ...SAMPLE_MEMORIES];
  }, [memories]);

  // Load memories from database to ensure we have the correct database IDs
  useEffect(() => {
    if (couple?.id && isSyncInitialized) {
      console.log('[Memories] Loading memories from database for couple:', couple.id);
      loadFromDB(couple.id);
    }
  }, [couple?.id, isSyncInitialized, loadFromDB]);

  // Photo upload state
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [selectedPhotoForDetail, setSelectedPhotoForDetail] = useState<AlbumPhoto | null>(null);
  const [singlePhotoMode, setSinglePhotoMode] = useState(false);

  // Photo message edit modal states
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [showMessageEditModal, setShowMessageEditModal] = useState(false);

  // Unified record edit modal states
  const [showRecordEditModal, setShowRecordEditModal] = useState(false);
  const [editingRecordPhotoId, setEditingRecordPhotoId] = useState<string | null>(null);
  const [editingRecordTitle, setEditingRecordTitle] = useState('');
  const [editingRecordLocation, setEditingRecordLocation] = useState('');
  const [editingRecordMessage, setEditingRecordMessage] = useState('');
  const [editingRecordSpending, setEditingRecordSpending] = useState('');
  const [editingMessageSlot, setEditingMessageSlot] = useState<'message' | 'message2'>('message');

  // Animation for month modal
  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selectedMonth) {
      // Slide up + backdrop fade in animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [selectedMonth]);

  // Close month modal with slide down + backdrop fade out animation
  const closeMonthModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedMonth(null);
      setSelectedPhoto(null);
      // Reset animations for next open
      slideAnim.setValue(height);
      backdropOpacityAnim.setValue(0);
    });
  };

  // ─── Header Photo Upload: Add Photos from Device Gallery ───
  const handleAddPhotosFromHeader = async () => {
    if (!coupleId) return;

    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('memories.photo.permissionDenied'));
        return;
      }

      // Launch image picker with crop editing
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      setIsUploadingPhotos(true);
      setUploadProgress(t('memories.photo.uploading', { current: 1, total: result.assets.length }));

      // Get or create the default album
      const defaultAlbum = await getOrCreateDefaultAlbum();
      if (!defaultAlbum) {
        console.error('[HeaderUpload] Failed to get/create default album');
        setIsUploadingPhotos(false);
        setUploadProgress('');
        return;
      }
      const albumId = defaultAlbum;

      const photosToAdd: {
        image_url: string;
        taken_at?: string | null;
        taken_location_name?: string | null;
        taken_latitude?: number | null;
        taken_longitude?: number | null;
      }[] = [];

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        setUploadProgress(t('memories.photo.uploading', { current: i + 1, total: result.assets.length }));

        // Upload to Supabase Storage
        const imageUrl = await db.storage.uploadAlbumPhoto(coupleId, asset.uri);
        if (!imageUrl) {
          console.warn('[HeaderUpload] Failed to upload asset:', asset.uri);
          continue;
        }

        // Extract taken date from EXIF
        let takenAt: string | null = null;

        if (asset.assetId) {
          const meta = await extractPhotoMetadata(asset.assetId);
          if (meta.takenAt) takenAt = meta.takenAt;
        }

        if (!takenAt && asset.exif?.DateTimeOriginal) {
          const exifDate = asset.exif.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          takenAt = new Date(exifDate).toISOString();
        }

        photosToAdd.push({
          image_url: imageUrl,
          taken_at: takenAt,
        });
      }

      // Batch add all photos to the default album
      if (photosToAdd.length > 0) {
        if (isSyncInitialized && !isDemoMode) {
          await syncAddPhotos(albumId, photosToAdd);
          await loadAllPhotos();

          // Auto-open the newly added photo card (find by most recent created_at)
          const latestPhotos = useCoupleSyncStore.getState().allCouplePhotos;
          if (latestPhotos.length > 0) {
            Keyboard.dismiss();
            const newest = latestPhotos.reduce((latest, photo) =>
              new Date(photo.created_at) > new Date(latest.created_at) ? photo : latest
            );
            setSinglePhotoMode(true);
            setSelectedPhotoForDetail(newest);
          }
        }
      }

      setIsUploadingPhotos(false);
      setUploadProgress('');
    } catch (error) {
      console.error('[HeaderUpload] Error:', error);
      setIsUploadingPhotos(false);
      setUploadProgress('');
      Alert.alert(t('common.error'), t('memories.photo.uploadError'));
    }
  };

  // ─── Message Edit Handler ───
  const handleEditPhotoMessage = useCallback((photoId: string, currentMessage: string) => {
    setEditingPhotoId(photoId);
    setEditingMessage(currentMessage);
    setShowMessageEditModal(true);
  }, []);

  const handleSavePhotoMessage = useCallback(async () => {
    if (!editingPhotoId) return;
    const trimmed = editingMessage.trim();
    if (isSyncInitialized && !isDemoMode) {
      await syncUpdatePhotoMessage(editingPhotoId, trimmed);
    }
    setShowMessageEditModal(false);
    setEditingPhotoId(null);
    setEditingMessage('');
  }, [editingPhotoId, editingMessage, isSyncInitialized, isDemoMode, syncUpdatePhotoMessage]);

  // Record edit handlers (unified: title, location, message, spending)
  const handleEditRecord = useCallback((photo: AlbumPhoto) => {
    const currentUserId = user?.id;
    setEditingRecordPhotoId(photo.id);
    setEditingRecordTitle(photo.title || '');
    setEditingRecordLocation(photo.taken_location_name || '');
    setEditingRecordSpending(photo.spending_amount != null && photo.spending_amount > 0 ? String(photo.spending_amount) : '');

    // Determine which message slot belongs to the current user
    if (photo.message_by === currentUserId) {
      // Current user already has message in slot 1
      setEditingMessageSlot('message');
      setEditingRecordMessage(photo.message || '');
    } else if (photo.message2_by === currentUserId) {
      // Current user already has message in slot 2
      setEditingMessageSlot('message2');
      setEditingRecordMessage(photo.message2 || '');
    } else if (!photo.message_by && !photo.message) {
      // No messages at all → use slot 1
      setEditingMessageSlot('message');
      setEditingRecordMessage('');
    } else if (!photo.message_by && photo.message) {
      // Legacy message without message_by → treat as uploader's, current user gets slot 2
      if (photo.uploaded_by === currentUserId) {
        setEditingMessageSlot('message');
        setEditingRecordMessage(photo.message || '');
      } else {
        setEditingMessageSlot('message2');
        setEditingRecordMessage(photo.message2 || '');
      }
    } else {
      // Slot 1 is taken by the other user → current user uses slot 2
      setEditingMessageSlot('message2');
      setEditingRecordMessage(photo.message2 || '');
    }

    setShowRecordEditModal(true);
  }, [user?.id]);

  const handleSaveRecord = useCallback(async () => {
    if (!editingRecordPhotoId) return;
    if (isSyncInitialized && !isDemoMode) {
      const { updatePhotoRecord } = useCoupleSyncStore.getState();
      await updatePhotoRecord(editingRecordPhotoId, {
        title: editingRecordTitle.trim(),
        location: editingRecordLocation.trim(),
        message: editingRecordMessage.trim(),
        spending: editingRecordSpending ? parseInt(editingRecordSpending.replace(/[^0-9]/g, ''), 10) : 0,
        messageSlot: editingMessageSlot,
        userId: user?.id,
      });

      // Sync local state snapshots with the updated store data
      const updatedPhoto = useCoupleSyncStore.getState().allCouplePhotos.find(p => p.id === editingRecordPhotoId);
      if (updatedPhoto) {
        setSelectedPhotoForDetail(prev =>
          prev?.id === editingRecordPhotoId ? updatedPhoto : prev
        );
        setSelectedMonth(prev => {
          if (!prev) return null;
          return {
            ...prev,
            missions: prev.missions.map(m => m.id === editingRecordPhotoId ? updatedPhoto : m),
          };
        });
      }
    }
    setShowRecordEditModal(false);
    setEditingRecordPhotoId(null);
  }, [editingRecordPhotoId, editingRecordTitle, editingRecordLocation, editingRecordMessage, editingRecordSpending, editingMessageSlot, user?.id, isSyncInitialized, isDemoMode]);

  // Group missions by year and month
  const groupByYearMonth = <T extends MemoryType | AlbumPhoto>(items: T[]) => {
    const grouped: {
      [year: string]: { [month: string]: T[] };
    } = {};

    items.forEach((item) => {
      // Handle both MemoryType (completedAt) and AlbumPhoto (created_at/taken_at)
      const dateStr = 'completedAt' in item ? (item as MemoryType).completedAt : ((item as AlbumPhoto).taken_at || (item as AlbumPhoto).created_at);
      const date = new Date(dateStr);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = [];

      grouped[year][month].push(item);
    });

    // Sort items within each month by date (newest first) for consistent cross-user ordering
    Object.values(grouped).forEach(months => {
      Object.keys(months).forEach(month => {
        months[month].sort((a, b) => {
          const dateA = 'completedAt' in a
            ? new Date((a as MemoryType).completedAt).getTime()
            : new Date((a as AlbumPhoto).taken_at || (a as AlbumPhoto).created_at).getTime();
          const dateB = 'completedAt' in b
            ? new Date((b as MemoryType).completedAt).getTime()
            : new Date((b as AlbumPhoto).taken_at || (b as AlbumPhoto).created_at).getTime();
          return dateB - dateA;
        });
      });
    });

    return grouped;
  };

  // Filter only completed missions (both users have written messages)
  const completedMemories = allMemories.filter(
    (memory) => memory.user1Message && memory.user2Message && memory.photoUrl
  );

  // Combine completed mission memories with album photos for unified display
  const allDisplayItems = React.useMemo((): (MemoryType | AlbumPhoto)[] => {
    return [...completedMemories, ...allCouplePhotos];
  }, [completedMemories, allCouplePhotos]);

  const groupedItems = groupByYearMonth(allDisplayItems);
  const years = Object.keys(groupedItems).sort((a, b) => parseInt(b) - parseInt(a));

  // Set initial selectedYear to the newest year, or update if current selection is no longer valid
  useEffect(() => {
    if (years.length > 0) {
      if (!selectedYear || !years.includes(selectedYear)) {
        setSelectedYear(years[0]); // Default to newest year
      }
    }
  }, [years, selectedYear]);

  // Sync selectedMonth with current groupedItems when memories change (real-time sync from partner)
  useEffect(() => {
    if (!selectedMonth) return;

    const currentMissions = groupedItems[selectedMonth.year]?.[selectedMonth.month];

    if (!currentMissions || currentMissions.length === 0) {
      console.log('[RealTimeSync] Month has no photos, closing modal');
      setSelectedMonth(null);
      setSelectedPhoto(null);
      return;
    }

    const currentIds = currentMissions.map((m: MemoryType | AlbumPhoto) => m.id).join(',');
    const selectedIds = selectedMonth.missions.map((m: MemoryType | AlbumPhoto) => m.id).join(',');

    if (currentIds !== selectedIds) {
      console.log('[RealTimeSync] Missions changed, updating selectedMonth');
      console.log('[RealTimeSync] Previous count:', selectedMonth.missions.length, '-> New count:', currentMissions.length);

      setSelectedMonth(prev => prev ? {
        ...prev,
        missions: currentMissions
      } : null);

      if (selectedPhoto && !currentMissions.some((m: MemoryType | AlbumPhoto) => m.id === selectedPhoto.id)) {
        console.log('[RealTimeSync] Selected photo was deleted, clearing selection');
      }
    }
  }, [completedMemories, allCouplePhotos]);

  const getMonthName = (monthNumber: string) => {
    const monthNames = t('memories.monthNames', { returnObjects: true }) as string[];
    return monthNames[parseInt(monthNumber) - 1];
  };

  // Load all couple photos on mount
  useEffect(() => {
    if (isSyncInitialized && coupleId) {
      loadAllPhotos();
    }
  }, [isSyncInitialized, coupleId]);

  // Record edit overlay - rendered INSIDE parent Modals (not as a sibling Modal)
  // to avoid Android Modal stacking issues where a sibling Modal appears behind the active one
  const renderRecordEditOverlay = () => {
    if (!showRecordEditModal) return null;
    return (
      <View style={styles.recordEditOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.recordEditKeyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -120 : -80}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowRecordEditModal(false)}
          />
          <View style={styles.recordEditCard}>
              <Text style={styles.messageEditTitle}>
                {t('memories.photo.editRecord')}
              </Text>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Title */}
                <Text style={styles.recordEditLabel}>
                  {t('memories.photo.recordTitle')}
                </Text>
                <TextInput
                  style={styles.recordEditInput}
                  value={editingRecordTitle}
                  onChangeText={setEditingRecordTitle}
                  placeholder={t('memories.photo.recordTitlePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  maxLength={50}
                />

                {/* Location */}
                <Text style={styles.recordEditLabel}>
                  {t('memories.photo.recordLocation')}
                </Text>
                <TextInput
                  style={styles.recordEditInput}
                  value={editingRecordLocation}
                  onChangeText={setEditingRecordLocation}
                  placeholder={t('memories.photo.recordLocationPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  maxLength={100}
                />

                {/* Message */}
                <Text style={styles.recordEditLabel}>
                  {t('memories.photo.recordMessage')}
                </Text>
                <TextInput
                  style={[styles.recordEditInput, styles.recordEditMultiline]}
                  value={editingRecordMessage}
                  onChangeText={(text) => {
                    if (text.split('\n').length <= 5) setEditingRecordMessage(text);
                  }}
                  placeholder={t('memories.photo.messagePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  numberOfLines={5}
                  maxLength={200}
                />

                {/* Spending */}
                <Text style={styles.recordEditLabel}>
                  {t('memories.photo.spending')}
                </Text>
                <TextInput
                  style={styles.recordEditInput}
                  value={editingRecordSpending}
                  onChangeText={(text) => setEditingRecordSpending(text.replace(/[^0-9]/g, ''))}
                  placeholder={t('memories.photo.spendingPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="number-pad"
                />
              </ScrollView>

              <View style={styles.messageEditButtons}>
                <Pressable
                  style={styles.messageEditCancelButton}
                  onPress={() => setShowRecordEditModal(false)}
                >
                  <Text style={styles.messageEditCancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={styles.messageEditSaveButton}
                  onPress={handleSaveRecord}
                >
                  <Text style={styles.messageEditSaveText}>{t('common.save')}</Text>
                </Pressable>
              </View>
          </View>
        </KeyboardAvoidingView>
      </View>
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
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('memories.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('memories.subtitle')}</Text>
        </View>
        <Pressable style={styles.headerAddButton} onPress={handleAddPhotosFromHeader}>
          <Plus color={COLORS.white} size={rs(22)} strokeWidth={2} />
        </Pressable>
      </View>


      {/* Content */}
      {allDisplayItems.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Pressable style={styles.emptyMissionCard} onPress={handleAddPhotosFromHeader}>
            <View style={styles.emptyIconCircle}>
              <Plus color={COLORS.white} size={rs(28)} strokeWidth={2} />
            </View>
            <Text style={styles.emptyMissionText}>{t('memories.empty')}</Text>
          </Pressable>

          {/* Upload Progress */}
          {isUploadingPhotos && (
            <View style={styles.uploadProgressContainer}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.uploadProgressText}>{uploadProgress}</Text>
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.mainContent}
          contentContainerStyle={styles.mainContentContainer}
        >
          {/* Selected Year Section */}
          {selectedYear && groupedItems[selectedYear] && (
            <View style={styles.yearSection}>
              {/* Year Header with Dropdown */}
              <View style={styles.yearHeader}>
                <Pressable
                  onPress={() => years.length > 1 && setShowYearPicker(!showYearPicker)}
                  style={styles.yearTitleButton}
                >
                  <Text style={styles.yearTitle}>
                    {i18n.language === 'ko' ? `${selectedYear}년` : selectedYear}
                  </Text>
                  {years.length > 1 && (
                    <ChevronDown
                      color={COLORS.white}
                      size={16}
                      style={{
                        marginLeft: 4,
                        transform: [{ rotate: showYearPicker ? '180deg' : '0deg' }],
                      }}
                    />
                  )}
                </Pressable>

                {/* Year Picker Dropdown (Overlay) */}
                {showYearPicker && (
                  <View style={styles.yearPickerDropdown}>
                    {years.map((y) => (
                      <Pressable
                        key={y}
                        onPress={() => {
                          setSelectedYear(y);
                          setShowYearPicker(false);
                        }}
                        style={[
                          styles.yearPickerItem,
                          y === selectedYear && styles.yearPickerItemActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.yearPickerItemText,
                            y === selectedYear && styles.yearPickerItemTextActive,
                          ]}
                        >
                          {i18n.language === 'ko' ? `${y}년` : y}
                        </Text>
                        {y === selectedYear && (
                          <View style={styles.yearPickerCheckCircle}>
                            <Check size={12} color="#FFF" strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Month Cards - 3 column grid */}
              <View style={styles.monthCardsGrid}>
                {Object.keys(groupedItems[selectedYear])
                  .sort((a, b) => parseInt(b) - parseInt(a))
                  .map((month) => {
                    const missions = groupedItems[selectedYear][month];
                    const representativeMission = missions[0];
                    const hasMultiple = missions.length > 1;

                    return (
                      <Pressable
                        key={`${selectedYear}-${month}`}
                        style={styles.monthCard}
                        onPress={() => setSelectedMonth({
                          year: selectedYear,
                          month,
                          monthName: getMonthName(month),
                          missions,
                        })}
                      >
                        <View style={styles.monthCardInner}>
                          <ExpoImage
                            source={{ uri: getPhotoUri(representativeMission) }}
                            style={styles.monthCardImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={100}
                          />

                          {/* Month Badge */}
                          <View style={styles.monthBadge}>
                            <Text style={styles.monthBadgeText}>
                              {getMonthName(month)}
                            </Text>
                          </View>

                          {/* Multiple Photos Icon */}
                          {hasMultiple && (
                            <View style={[styles.multipleIcon, { transform: [{ scaleX: -1 }] }]}>
                              <Copy color={COLORS.white} size={rs(14)} strokeWidth={2} />
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          )}

          {/* Upload Progress */}
          {isUploadingPhotos && (
            <View style={styles.uploadProgressContainer}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.uploadProgressText}>{uploadProgress}</Text>
            </View>
          )}

        </ScrollView>
      )}

      {/* Month Album Modal */}
      <Modal
        visible={!!selectedMonth}
        transparent
        animationType="none"
        statusBarTranslucent={true}
        onRequestClose={() => {
          if (selectedPhoto) {
            setSelectedPhoto(null);
          } else {
            closeMonthModal();
          }
        }}
      >
        <View style={styles.albumDetailFullScreen}>
          {/* Background - same as main page */}
          <View style={styles.backgroundImage}>
            <ExpoImage
              source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              priority="high"
              style={styles.backgroundImageStyle}
            />
            <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
          </View>
          <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />

          {/* Album Grid View */}
          {!selectedPhoto && selectedMonth && (
            <>
              {/* Header */}
              <View style={styles.albumDetailHeader}>
                <Pressable
                  style={styles.albumDetailCloseButton}
                  onPress={() => {
                    closeMonthModal();
                  }}
                >
                  <X color="#FFFFFF" size={24} />
                </Pressable>
                <View style={styles.albumDetailTitleContainer}>
                  <Text style={styles.albumDetailTitle} numberOfLines={1}>
                    {i18n.language === 'ko'
                      ? `${selectedMonth?.year}년 ${selectedMonth?.monthName}`
                      : `${selectedMonth?.monthName} ${selectedMonth?.year}`}
                  </Text>
                </View>
                {/* Empty spacer for alignment */}
                <View style={{ width: rs(40) }} />
              </View>

              <ScrollView
                style={styles.albumDetailScrollView}
                contentContainerStyle={styles.albumDetailScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Photos count header - non-sticky, same background */}
                <View style={styles.monthAlbumSectionHeader}>
                  <Text style={styles.albumPhotosSectionTitle}>
                    {t('memories.dateCount', { count: selectedMonth?.missions.length })}
                  </Text>
                  <Text style={styles.albumTotalSpending}>
                    {t('memories.totalSpending', {
                      amount: new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: deviceCurrency,
                        maximumFractionDigits: 0,
                      }).format(
                        (selectedMonth?.missions || []).reduce((sum, m) => {
                          if ('spending_amount' in m && (m as AlbumPhoto).spending_amount) {
                            return sum + ((m as AlbumPhoto).spending_amount || 0);
                          }
                          return sum;
                        }, 0)
                      ),
                    })}
                  </Text>
                </View>

                {/* Photos Grid */}
                <View style={styles.albumPhotosGridContainer}>
                  <View style={styles.albumMonthPhotosGrid}>
                    {selectedMonth?.missions.map((mission) => (
                      <Pressable
                        key={mission.id}
                        style={styles.missionPhotoItem}
                        onPress={() => setSelectedPhoto(mission)}
                      >
                        <View style={styles.monthModalItemInner}>
                          <ExpoImage
                            source={{ uri: getPhotoUri(mission) }}
                            style={styles.monthModalItemImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={100}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </>
          )}

          {/* Photo Detail View (Overlay) */}
          {selectedPhoto && selectedMonth && (
            <PhotoDetailView
              missions={selectedMonth.missions}
              initialPhoto={selectedPhoto}
              onClose={() => setSelectedPhoto(null)}
              onEditMessage={handleEditPhotoMessage}
              onEditRecord={handleEditRecord}
              onDelete={async (memoryId) => {
                console.log('[Delete] Starting deletion for memoryId:', memoryId);
                const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId);
                const isAlbumPhotoItem = allCouplePhotos.some(p => p.id === memoryId);

                if (isAlbumPhotoItem && isSyncInitialized && !isDemoMode && isValidUUID) {
                  try {
                    await syncRemovePhoto(memoryId);
                    await loadAllPhotos();
                  } catch (error) {
                    console.error('[Delete] Error deleting album photo:', error);
                  }
                }

                setSelectedMonth(prevMonth => {
                  if (!prevMonth) return null;
                  const updatedMissions = prevMonth.missions.filter(m => m.id !== memoryId);
                  return {
                    ...prevMonth,
                    missions: updatedMissions
                  };
                });
              }}
            />
          )}
          {renderRecordEditOverlay()}
        </View>
      </Modal>

      {/* Couple Photo Detail Modal */}
      {selectedPhotoForDetail && (
        <Modal
          visible={!!selectedPhotoForDetail}
          transparent
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => setSelectedPhotoForDetail(null)}
        >
          <View style={styles.albumDetailFullScreen}>
            <View style={styles.backgroundImage}>
              <ExpoImage
                source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                priority="high"
                style={styles.backgroundImageStyle}
              />
              <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
            </View>
            <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />
            <PhotoDetailView
              missions={singlePhotoMode ? [selectedPhotoForDetail] : allCouplePhotos}
              initialPhoto={selectedPhotoForDetail}
              onClose={() => { setSinglePhotoMode(false); setSelectedPhotoForDetail(null); }}
              hideMenu={false}
              onEditMessage={handleEditPhotoMessage}
              onEditRecord={handleEditRecord}
              onDelete={async (photoId) => {
                const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId);
                if (isSyncInitialized && !isDemoMode && isValidUUID) {
                  try {
                    await syncRemovePhoto(photoId);
                  } catch (error) {
                    console.error('[CouplePhotoDelete] Error:', error);
                  }
                }
              }}
            />

            {/* Photo Message Edit Modal (legacy - kept for MemoryType) */}
            <Modal
              visible={showMessageEditModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowMessageEditModal(false)}
            >
              <Pressable
                style={styles.messageEditBackdrop}
                onPress={() => setShowMessageEditModal(false)}
              >
                <View />
              </Pressable>
              <View style={styles.messageEditContainer}>
                <View style={styles.messageEditCard}>
                  <Text style={styles.messageEditTitle}>{t('memories.photo.editMessage')}</Text>
                  <TextInput
                    style={styles.messageEditInput}
                    value={editingMessage}
                    onChangeText={(text) => {
                      if (text.split('\n').length <= 5) setEditingMessage(text);
                    }}
                    placeholder={t('memories.photo.messagePlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    multiline
                    numberOfLines={5}
                    maxLength={200}
                    autoFocus
                  />
                  <View style={styles.messageEditButtons}>
                    <Pressable
                      style={styles.messageEditCancelButton}
                      onPress={() => setShowMessageEditModal(false)}
                    >
                      <Text style={styles.messageEditCancelText}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.messageEditSaveButton}
                      onPress={handleSavePhotoMessage}
                    >
                      <Text style={styles.messageEditSaveText}>{t('common.save')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

            {renderRecordEditOverlay()}
          </View>
        </Modal>
      )}

    </View>
  );
}

// Photo Detail View Component with Flip Card
// Individual flip card item component for FlatList
// Supports both MemoryType (legacy mission-based) and AlbumPhoto (Phase 2 free album)
function FlipCardItem({
  mission,
  isActive,
  onEditMessage,
  onEditRecord,
  flipToBackTrigger,
}: {
  mission: MemoryType | AlbumPhoto;
  isActive: boolean;
  onEditMessage?: (photoId: string, currentMessage: string) => void;
  onEditRecord?: (photo: AlbumPhoto) => void;
  flipToBackTrigger?: number;
}) {
  const { t } = useTranslation();
  const { user, partner, couple } = useAuthStore();
  const { data: onboardingData } = useOnboardingStore();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  // Detect type: AlbumPhoto has image_url, MemoryType has photoUrl
  const isAlbumPhoto = 'image_url' in mission;

  // Reset flip state when card becomes inactive
  useEffect(() => {
    if (!isActive && isFlipped) {
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  }, [isActive]);

  // Flip to back when triggered from parent (edit record button)
  useEffect(() => {
    if (flipToBackTrigger && isActive && !isFlipped) {
      Animated.spring(flipAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 10,
      }).start();
      setIsFlipped(true);
    }
  }, [flipToBackTrigger]);

  // Extract data based on type
  const imageUri = isAlbumPhoto ? (mission as AlbumPhoto).image_url : (mission as MemoryType).photoUrl;

  const dateStr = isAlbumPhoto
    ? ((mission as AlbumPhoto).taken_at || (mission as AlbumPhoto).created_at)
    : (mission as MemoryType).completedAt;
  const date = new Date(dateStr);
  const formattedDate = `${date.getFullYear()}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
  const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;

  const locationText = isAlbumPhoto
    ? ((mission as AlbumPhoto).taken_location_name || '')
    : ((mission as MemoryType).location || '');

  // Determine nicknames based on couple order (user1Message is always from couple.user1)
  // This ensures consistent display order regardless of who's viewing
  const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
  const user1Nickname = isCurrentUserCoupleUser1
    ? (user?.nickname || onboardingData.nickname || t('common.me'))
    : (partner?.nickname || t('common.partner'));
  const user2Nickname = isCurrentUserCoupleUser1
    ? (partner?.nickname || t('common.partner'))
    : (user?.nickname || onboardingData.nickname || t('common.me'));

  // Handle flip
  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
    setIsFlipped(!isFlipped);
  };

  // Flip interpolations
  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  // Opacity interpolations to fix backfaceVisibility issues (especially Android)
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.flatListCardWrapper}>
      <View style={styles.flipCardContainer}>
          {/* Front - Photo: zIndex controls which face is on top (no pointerEvents on Animated.View) */}
          <Animated.View
            style={[
              styles.flipCardFace,
              { transform: [{ perspective: 1000 }, { rotateY: frontInterpolate }], opacity: frontOpacity, zIndex: isFlipped ? 0 : 2 },
            ]}
          >
            <Pressable onPress={handleFlip} style={styles.flipCardPressable} android_ripple={null}>
              <ExpoImage
                source={{ uri: imageUri }}
                style={styles.flipCardImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={100}
              />
            </Pressable>
          </Animated.View>

          {/* Back - Info: zIndex brings this on top when flipped, no nested Pressables */}
          <Animated.View
            style={[
              styles.flipCardFace,
              styles.flipCardBack,
              { transform: [{ perspective: 1000 }, { rotateY: backInterpolate }], opacity: backOpacity, zIndex: isFlipped ? 2 : 0 },
            ]}
          >
            <Pressable onPress={handleFlip} style={styles.flipCardBackContent} android_ripple={null}>
              {isAlbumPhoto ? (() => {
                const photo = mission as AlbumPhoto;
                return (
                  <>
                    {/* Header section */}
                    <View style={styles.flipCardBackTop}>
                      {/* Title - large font above date */}
                      {photo.title ? (
                        <Text
                          style={styles.flipCardTitle}
                          allowFontScaling={false}
                          textBreakStrategy="highQuality"
                        >
                          {photo.title}
                        </Text>
                      ) : null}
                      <View style={styles.flipCardInfoSection}>
                        <View style={styles.flipCardInfoRow}>
                          <Clock color="rgba(255,255,255,0.9)" size={16} />
                          <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                            {formattedDate} {formattedTime}
                          </Text>
                        </View>
                        {/* Location - below date, same font size */}
                        {photo.taken_location_name ? (
                          <View style={styles.flipCardInfoRow}>
                            <MapPin color="rgba(255,255,255,0.9)" size={16} />
                            <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                              {photo.taken_location_name}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.flipCardDivider} />
                    </View>

                    <View style={styles.flipCardMessages}>
                      {/* Per-user messages - left aligned, top aligned */}
                      {(() => {
                          // Determine display order: couple user1 first, then user2
                          const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
                          const coupleUser1Id = isCurrentUserCoupleUser1 ? user?.id : partner?.id;
                          const coupleUser2Id = isCurrentUserCoupleUser1 ? partner?.id : user?.id;

                          // Find which message belongs to which couple user
                          const msg1 = photo.message_by === coupleUser1Id ? photo.message
                            : photo.message2_by === coupleUser1Id ? photo.message2
                            : (!photo.message_by && photo.message) ? photo.message // legacy: no message_by, assume uploader
                            : null;
                          const msg2 = photo.message_by === coupleUser2Id ? photo.message
                            : photo.message2_by === coupleUser2Id ? photo.message2
                            : null;

                          const hasAnyMessage = !!msg1 || !!msg2;

                          if (!hasAnyMessage) {
                            return (
                              <View style={styles.flipCardMessageCenter}>
                                <Pressable
                                  style={styles.flipCardAddMessageButton}
                                  onPress={(e) => { e.stopPropagation(); onEditRecord?.(photo); }}
                                >
                                  <Pencil size={rs(14)} color="rgba(255, 255, 255, 0.8)" style={{ marginRight: rs(6) }} />
                                  <Text style={styles.flipCardAddMessageButtonText} allowFontScaling={false}>
                                    {t('memories.photo.addRecord')}
                                  </Text>
                                </Pressable>
                              </View>
                            );
                          }

                          return (
                            <View style={styles.flipCardMessageTop}>
                              {msg1 ? (
                                <View style={styles.flipCardMessageItem}>
                                  <Text style={styles.flipCardNicknameText} allowFontScaling={false}>
                                    {user1Nickname}
                                  </Text>
                                  <Text style={styles.flipCardMessageText} allowFontScaling={false} numberOfLines={5}>
                                    {msg1}
                                  </Text>
                                </View>
                              ) : null}
                              {msg2 ? (
                                <View style={[styles.flipCardMessageItem, msg1 ? { marginTop: rs(16) } : undefined]}>
                                  <Text style={styles.flipCardNicknameText} allowFontScaling={false}>
                                    {user2Nickname}
                                  </Text>
                                  <Text style={styles.flipCardMessageText} allowFontScaling={false} numberOfLines={5}>
                                    {msg2}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })()}

                      {/* Spending section - only show when any message exists */}
                      {(!!photo.message || !!photo.message2) && (
                        <>
                          <View style={styles.flipCardSpendingGap} />
                          <View style={styles.flipCardDivider} />
                          <View style={styles.flipCardSpendingRow}>
                            <Text style={styles.flipCardSpendingLabel} allowFontScaling={false}>
                              {t('memories.photo.spending')}
                            </Text>
                            <Text style={styles.flipCardSpendingAmount} allowFontScaling={false}>
                              {photo.spending_amount != null && photo.spending_amount > 0
                                ? new Intl.NumberFormat(undefined, { style: 'currency', currency: deviceCurrency, maximumFractionDigits: 0 }).format(photo.spending_amount)
                                : '-'}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </>
                );
              })() : (
                /* MemoryType: content displayed on back face (outer Pressable handles flip) */
                <View style={{ flex: 1 }}>
                  <View style={styles.flipCardBackTop}>
                    <Text
                      style={styles.flipCardTitle}
                      allowFontScaling={false}
                      textBreakStrategy="highQuality"
                    >
                      {(mission as MemoryType).mission?.title || t('memories.togetherMoment')}
                    </Text>
                    <View style={styles.flipCardInfoSection}>
                      {locationText ? (
                        <View style={styles.flipCardInfoRow}>
                          <MapPin color="rgba(255,255,255,0.9)" size={16} />
                          <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                            {locationText}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.flipCardInfoRow}>
                        <Clock color="rgba(255,255,255,0.9)" size={16} />
                        <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                          {formattedDate} {formattedTime}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.flipCardDivider} />
                  </View>
                  {/* MemoryType: show user1/user2 messages in split layout */}
                  <View style={styles.flipCardMessages}>
                    {(mission as MemoryType).user1Message ? (
                      <View style={[styles.flipCardMessageItem, { flex: 1 }]}>
                        <Text style={styles.flipCardMessageLabel} allowFontScaling={false}>
                          {user1Nickname}
                        </Text>
                        <Text style={styles.flipCardMessageText} allowFontScaling={false} numberOfLines={5}>
                          {(mission as MemoryType).user1Message}
                        </Text>
                      </View>
                    ) : null}
                    {(mission as MemoryType).user2Message ? (
                      <View style={[styles.flipCardMessageItem, { flex: 1 }]}>
                        <Text style={styles.flipCardMessageLabel} allowFontScaling={false}>
                          {user2Nickname}
                        </Text>
                        <Text style={styles.flipCardMessageText} allowFontScaling={false} numberOfLines={5}>
                          {(mission as MemoryType).user2Message}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
      </View>
    </View>
  );
}

// Background image component with animated opacity and scale (iOS - uses scrollX in pixels)
function CarouselBackgroundImage({
  image,
  index,
  scrollX,
}: {
  image: string;
  index: number;
  scrollX: { value: number };
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0, 1, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [1.2, 1, 1.2],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <ReanimatedModule.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <ExpoImage
        source={{ uri: image }}
        style={StyleSheet.absoluteFill}
        blurRadius={18}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={100}
        placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
      />
    </ReanimatedModule.View>
  );
}

// Android: Background image component using PagerView position (uses page index)
function AndroidCarouselBackgroundImage({
  image,
  index,
  scrollPosition,
  scrollOffset,
}: {
  image: string;
  index: number;
  scrollPosition: { value: number };
  scrollOffset: { value: number };
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const position = scrollPosition.value;
    const offset = scrollOffset.value;
    const continuousPosition = position + offset;

    const opacity = interpolate(
      continuousPosition,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      continuousPosition,
      [index - 1, index, index + 1],
      [1.2, 1, 1.2],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <ReanimatedModule.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <ExpoImage
        source={{ uri: image }}
        style={StyleSheet.absoluteFill}
        blurRadius={18}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={100}
        placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
      />
    </ReanimatedModule.View>
  );
}

// Carousel card wrapper (no scale to prevent text blur)
function CarouselCardWrapper({
  mission,
  index,
  scrollX,
  currentIndex,
  onEditMessage,
  onEditRecord,
  flipToBackTrigger,
}: {
  mission: MemoryType | AlbumPhoto;
  index: number;
  scrollX: { value: number };
  currentIndex: number;
  onEditMessage?: (photoId: string, currentMessage: string) => void;
  onEditRecord?: (photo: AlbumPhoto) => void;
  flipToBackTrigger?: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.9, 1, 0.9],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <ReanimatedModule.View style={[styles.carouselCardContainer, animatedStyle]}>
      <FlipCardItem mission={mission} isActive={index === currentIndex} onEditMessage={onEditMessage} onEditRecord={onEditRecord} flipToBackTrigger={flipToBackTrigger} />
    </ReanimatedModule.View>
  );
}

// Android: Animated card wrapper for smooth PagerView transitions
interface AndroidPhotoCardWrapperProps {
  index: number;
  scrollPosition: { value: number };
  scrollOffset: { value: number };
  currentIndex: number;
  mission: MemoryType | AlbumPhoto;
  onEditMessage?: (photoId: string, currentMessage: string) => void;
  onEditRecord?: (photo: AlbumPhoto) => void;
  flipToBackTrigger?: number;
}

function AndroidPhotoCardWrapper({ index, scrollPosition, scrollOffset, currentIndex, mission, onEditMessage, onEditRecord, flipToBackTrigger }: AndroidPhotoCardWrapperProps) {
  const springConfig = {
    damping: 50,
    stiffness: 150,
    mass: 0.5,
    overshootClamping: true, // Prevent spring from overshooting (scale > 1.0)
  };

  const animatedStyle = useAnimatedStyle(() => {
    const position = scrollPosition.value;
    const offset = scrollOffset.value;
    const continuousPosition = position + offset;
    const distance = Math.abs(continuousPosition - index);

    // Scale animation - clamp to prevent stretching
    const targetScale = interpolate(
      distance,
      [0, 0.5, 1],
      [1, 0.975, 0.95],
      Extrapolation.CLAMP
    );

    // Opacity animation
    const targetOpacity = interpolate(
      distance,
      [0, 0.5, 1],
      [1, 0.7, 0.3],
      Extrapolation.CLAMP
    );

    // Apply spring only to current card to avoid wobble on neighbors
    // overshootClamping: true prevents scale from exceeding target value
    const isCurrentCard = distance < 0.5;
    const finalScale = isCurrentCard
      ? withSpring(targetScale, springConfig)
      : targetScale;

    return {
      transform: [{ scale: finalScale }],
      opacity: targetOpacity,
    };
  });

  return (
    <ReanimatedModule.View style={[styles.androidPhotoCardWrapper, animatedStyle]}>
      <FlipCardItem mission={mission} isActive={index === currentIndex} onEditMessage={onEditMessage} onEditRecord={onEditRecord} flipToBackTrigger={flipToBackTrigger} />
    </ReanimatedModule.View>
  );
}

// Helper: get photo URL from either MemoryType or AlbumPhoto
function getPhotoUri(m: MemoryType | AlbumPhoto): string {
  return 'image_url' in m ? (m as AlbumPhoto).image_url : (m as MemoryType).photoUrl;
}

function PhotoDetailView({
  missions,
  initialPhoto,
  onClose,
  onDelete,
  hideMenu = false,
  onEditMessage,
  onEditRecord,
}: {
  missions: (MemoryType | AlbumPhoto)[];
  initialPhoto: MemoryType | AlbumPhoto;
  onClose: () => void;
  onDelete: (memoryId: string) => void | Promise<void>;
  hideMenu?: boolean;
  onEditMessage?: (photoId: string, currentMessage: string) => void;
  onEditRecord?: (photo: AlbumPhoto) => void;
}) {
  const { t } = useTranslation();
  const initialIndex = missions.findIndex((m) => m.id === initialPhoto.id);
  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 ? initialIndex : 0
  );
  const [localMissions, setLocalMissions] = useState<(MemoryType | AlbumPhoto)[]>(missions);
  const scrollViewRef = useRef<any>(null);
  const pagerRef = useRef<PagerView>(null);

  // Android: PagerView scroll position tracking
  const androidScrollPosition = useSharedValue(initialIndex >= 0 ? initialIndex : 0);
  const androidScrollOffset = useSharedValue(0);

  // Prefetch all photos for instant display when swiping
  useEffect(() => {
    missions.forEach(mission => {
      const uri = getPhotoUri(mission);
      if (uri) {
        ExpoImage.prefetch(uri).catch(() => { });
      }
    });
  }, [missions]);

  // Update local missions when parent missions change (including external deletions by partner)
  useEffect(() => {
    // Check if the currently viewed photo was deleted externally (by partner)
    const currentPhoto = localMissions[currentIndex];
    const currentPhotoStillExists = currentPhoto ? missions.some(m => m.id === currentPhoto.id) : false;

    // Update local missions to sync with parent
    setLocalMissions(missions);

    // Handle external deletion of the current photo
    if (currentPhoto && !currentPhotoStillExists) {
      console.log('[PhotoDetailView] Current photo was deleted externally');

      if (missions.length === 0) {
        // No photos left - close the view
        console.log('[PhotoDetailView] No photos remaining, closing view');
        onClose();
        return;
      }

      // Navigate to adjacent photo (prefer previous, fallback to next)
      const newIndex = Math.min(currentIndex, missions.length - 1);
      console.log('[PhotoDetailView] Navigating to index:', newIndex);
      setCurrentIndex(newIndex);

      // Scroll to the adjusted position
      setTimeout(() => {
        if (Platform.OS === 'android') {
          pagerRef.current?.setPageWithoutAnimation(newIndex);
          androidScrollPosition.value = newIndex;
          androidScrollOffset.value = 0;
        } else if (scrollViewRef.current) {
          scrollViewRef.current?.scrollTo({
            x: newIndex * width,
            animated: false,
          });
        }
      }, 50);
      return;
    }

    // Adjust currentIndex if it's now out of bounds
    if (currentIndex >= missions.length && missions.length > 0) {
      const newIndex = missions.length - 1;
      setCurrentIndex(newIndex);
      // Scroll to the adjusted position
      setTimeout(() => {
        if (Platform.OS === 'android') {
          pagerRef.current?.setPageWithoutAnimation(newIndex);
          androidScrollPosition.value = newIndex;
          androidScrollOffset.value = 0;
        } else if (scrollViewRef.current) {
          scrollViewRef.current?.scrollTo({
            x: newIndex * width,
            animated: false,
          });
        }
      }, 50);
    }
  }, [missions]);

  // Track current flip state for instruction text
  const [isFlipped, setIsFlipped] = useState(false);

  // Trigger to flip card to back (incremented when edit record is pressed)
  const [flipToBackTrigger, setFlipToBackTrigger] = useState(0);

  // Dropdown menu state
  const [showPhotoDetailMenu, setShowPhotoDetailMenu] = useState(false);

  // Animation values for smooth entrance
  const animProgress = useSharedValue(0);

  // Reanimated scroll value
  const scrollX = useSharedValue(initialIndex >= 0 ? initialIndex * width : 0);

  // Background fade style (simple fade)
  const backgroundFadeStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
  }));

  // Content animated style (fade + scale + slide)
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
    transform: [
      { scale: interpolate(animProgress.value, [0, 1], [0.92, 1]) },
      { translateY: interpolate(animProgress.value, [0, 1], [30, 0]) },
    ],
  }));

  // Handle download photo to gallery
  const handleDownload = useCallback(async () => {
    const currentMission = localMissions[currentIndex];
    const photoUri = currentMission ? getPhotoUri(currentMission) : null;
    if (!photoUri) return;

    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('memories.permission.required'), t('memories.permission.saveAccess'));
        return;
      }

      // Download image using new expo-file-system API
      const filename = `daydate_${Date.now()}.jpg`;
      const destination = new ExpoFile(Paths.cache, filename);

      // Use static method to download
      const downloadedFile = await ExpoFile.downloadFileAsync(photoUri, destination);

      // Save to media library
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      Alert.alert(t('memories.permission.saveSuccess'), t('memories.permission.saveSuccessMessage'));

      // Clean up temp file
      await downloadedFile.delete();
    } catch (error) {
      console.log('Download error:', error);
      Alert.alert(t('memories.permission.saveFailed'), t('memories.permission.saveFailedMessage'));
    }
  }, [currentIndex, localMissions]);

  // Animated scroll handler (direct value without spring for better text rendering)
  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Scroll to initial index after mount and trigger entrance animation
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Android uses PagerView - set initial page
      if (pagerRef.current && initialIndex > 0) {
        pagerRef.current?.setPageWithoutAnimation(initialIndex);
      }
    } else {
      // iOS uses ScrollView
      if (scrollViewRef.current && initialIndex > 0) {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * width,
          animated: false,
        });
      }
    }
    // Start entrance animation with natural easing
    const timer = setTimeout(() => {
      animProgress.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  // Android: Handle PagerView page scroll
  const handleAndroidPageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    androidScrollPosition.value = position;
    androidScrollOffset.value = offset;
  }, []);

  // Android: Handle PagerView page selected
  const handleAndroidPageSelected = useCallback((e: any) => {
    const newIndex = e.nativeEvent.position;
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < localMissions.length) {
      setCurrentIndex(newIndex);
      setIsFlipped(false);
      androidScrollPosition.value = newIndex;
      androidScrollOffset.value = 0;
    }
  }, [currentIndex, localMissions.length]);

  // Handle scroll end to update current index (iOS)
  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / width);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < localMissions.length) {
        setCurrentIndex(newIndex);
        setIsFlipped(false);
      }
    },
    [currentIndex, localMissions.length]
  );

  return (
    <View style={styles.carouselContainer}>
      {/* Solid black background - always visible to prevent flickering */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

      {/* Background with smooth fade animation */}
      <ReanimatedModule.View style={[StyleSheet.absoluteFill, backgroundFadeStyle]}>
        {/* Animated Background Images with Blur - Platform-specific */}
        <View style={StyleSheet.absoluteFill}>
          {Platform.OS === 'android' ? (
            /* Android: Use PagerView position for background animation */
            localMissions.map((mission, index) => (
              <AndroidCarouselBackgroundImage
                key={`background_${mission.id}`}
                image={getPhotoUri(mission)}
                index={index}
                scrollPosition={androidScrollPosition}
                scrollOffset={androidScrollOffset}
              />
            ))
          ) : (
            /* iOS: Use ScrollView scrollX for background animation */
            localMissions.map((mission, index) => (
              <CarouselBackgroundImage
                key={`background_${mission.id}`}
                image={getPhotoUri(mission)}
                index={index}
                scrollX={scrollX}
              />
            ))
          )}
        </View>

        {/* Dark overlay for better card visibility */}
        <View style={styles.carouselOverlay} />
      </ReanimatedModule.View>

      {/* Top Buttons - Close (left) and More Options (right) */}
      <View style={styles.photoDetailTopButtonsContainer}>
        <Pressable style={styles.photoDetailButton} onPress={onClose}>
          <X color={COLORS.white} size={20} />
        </Pressable>
        {!hideMenu && (
          <Pressable
            style={styles.photoDetailButton}
            onPress={() => setShowPhotoDetailMenu(!showPhotoDetailMenu)}
          >
            <MoreHorizontal color={COLORS.white} size={20} />
          </Pressable>
        )}
      </View>

      {/* Photo Detail Dropdown Menu */}
      {showPhotoDetailMenu && (
        <Pressable
          style={styles.photoDetailMenuOverlay}
          onPress={() => setShowPhotoDetailMenu(false)}
        >
          <View style={styles.photoDetailMenuDropdown}>
            {/* Edit Record button - only for AlbumPhoto */}
            {localMissions[currentIndex] && 'image_url' in localMissions[currentIndex] && (
              <Pressable
                style={styles.photoDetailMenuItem}
                onPress={() => {
                  setShowPhotoDetailMenu(false);
                  onEditRecord?.(localMissions[currentIndex] as AlbumPhoto);
                }}
              >
                <Pencil color={COLORS.white} size={18} />
                <Text style={styles.photoDetailMenuItemText}>
                  {t('memories.photo.editRecord')}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.photoDetailMenuItem}
              onPress={() => {
                setShowPhotoDetailMenu(false);
                handleDownload();
              }}
            >
              <Download color={COLORS.white} size={18} />
              <Text style={styles.photoDetailMenuItemText}>{t('memories.photo.save')}</Text>
            </Pressable>
            <Pressable
              style={[styles.photoDetailMenuItem, styles.photoDetailMenuItemDanger]}
              onPress={() => {
                setShowPhotoDetailMenu(false);
                const currentMission = localMissions[currentIndex];
                Alert.alert(
                  t('memories.photo.deleteTitle'),
                  t('memories.photo.deleteSingleConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: async () => {
                        // Calculate remaining photos after deletion
                        const remainingPhotos = localMissions.length - 1;

                        if (remainingPhotos <= 0) {
                          // No photos left after deletion - close the view
                          await onDelete(currentMission.id);
                          onClose();
                        } else {
                          // Calculate the target index BEFORE removing the photo
                          // User requested: show previous photo, or next if no previous
                          const deletedIndex = currentIndex;
                          const targetIndex = deletedIndex > 0 ? deletedIndex - 1 : 0;

                          // Remove photo from local state
                          const newMissions = localMissions.filter(m => m.id !== currentMission.id);
                          setLocalMissions(newMissions);
                          setCurrentIndex(targetIndex);

                          // Scroll to the target position after state update
                          // Use setTimeout to ensure the scroll happens after React re-renders
                          setTimeout(() => {
                            if (scrollViewRef.current) {
                              scrollViewRef.current?.scrollTo({
                                x: targetIndex * width,
                                animated: false, // No animation to prevent visual jumping
                              });
                            }
                          }, 50);

                          // Delete from DB in background
                          await onDelete(currentMission.id);
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Trash2 color="#FF6B6B" size={18} />
              <Text style={[styles.photoDetailMenuItemText, { color: '#FF6B6B' }]}>{t('memories.photo.delete')}</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* Carousel with smooth entrance animation (fade + scale + slide) */}
      <ReanimatedModule.View style={[{ flex: 1 }, contentAnimStyle]}>
        {Platform.OS === 'android' ? (
          /* Android: PagerView for smooth native scrolling */
          <PagerView
            ref={pagerRef}
            style={styles.androidPhotoPagerView}
            initialPage={initialIndex >= 0 ? initialIndex : 0}
            onPageScroll={handleAndroidPageScroll}
            onPageSelected={handleAndroidPageSelected}
            overScrollMode="always"
            offscreenPageLimit={2}
          >
            {localMissions.map((mission, index) => (
              <View key={`android_card_${mission.id}`} style={styles.androidPhotoPageWrapper}>
                <AndroidPhotoCardWrapper
                  index={index}
                  scrollPosition={androidScrollPosition}
                  scrollOffset={androidScrollOffset}
                  currentIndex={currentIndex}
                  mission={mission}
                  onEditMessage={onEditMessage}
                  onEditRecord={onEditRecord}
                  flipToBackTrigger={flipToBackTrigger}
                />
              </View>
            ))}
          </PagerView>
        ) : (
          /* iOS: ScrollView for smooth scrolling */
          <ReanimatedModule.ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScrollHandler}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            scrollEventThrottle={16}
            decelerationRate="fast"
            bounces={true}
            alwaysBounceHorizontal={true}
            contentContainerStyle={styles.carouselScrollContent}
          >
            {localMissions.map((mission, index) => (
              <CarouselCardWrapper
                key={`card_${mission.id}`}
                mission={mission}
                index={index}
                scrollX={scrollX}
                currentIndex={currentIndex}
                onEditMessage={onEditMessage}
                onEditRecord={onEditRecord}
                flipToBackTrigger={flipToBackTrigger}
              />
            ))}
          </ReanimatedModule.ScrollView>
        )}
      </ReanimatedModule.View>

      {/* Photo Counter - No animation */}
      <View style={styles.photoCounterContainer}>
        <View style={styles.photoCounterBadge}>
          <Text style={styles.photoCounterText}>
            {currentIndex + 1} / {localMissions.length}
          </Text>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  inlineBannerContainer: {
    alignItems: 'center',
    paddingVertical: rs(8),
  },
  premiumSpacer: {
    height: rs(16),
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
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topFadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: rs(50),
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: rs(64),
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(SPACING.lg),
    zIndex: 20,
  },
  headerTitle: {
    fontSize: fp(32),
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: fp(38),
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  headerSubtitle: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: rs(4),
  },
  headerAddButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photosSection: {
    paddingTop: rs(SPACING.md),
  },
  uploadProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    paddingHorizontal: rs(SPACING.lg),
    paddingVertical: rs(SPACING.sm),
  },
  uploadProgressText: {
    fontSize: fp(13),
    color: 'rgba(255,255,255,0.7)',
  },
  photoMonthSection: {
    marginBottom: rs(SPACING.lg),
  },
  photoMonthHeader: {
    fontSize: fp(15),
    fontWeight: '600',
    color: COLORS.white,
    paddingHorizontal: rs(SPACING.lg),
    marginBottom: rs(SPACING.sm),
  },
  photoMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: rs(SPACING.lg),
    gap: rs(2),
  },
  photoGridItem: {
    width: (SCREEN_WIDTH - rs(SPACING.lg) * 2 - rs(2)) / 2,
    aspectRatio: 1,
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(SPACING.lg),
  },
  emptyText: {
    fontSize: fp(15),
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: fp(24),
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingHorizontal: rs(SPACING.lg),
    paddingTop: rs(SPACING.xl),
  },
  emptyMissionCard: {
    padding: rs(24),
    borderRadius: rs(20),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: rs(12),
  },
  emptyIconCircle: {
    width: rs(52),
    height: rs(52),
    borderRadius: rs(26),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMissionText: {
    fontSize: fp(14),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
  },
  mainContentContainer: {
    paddingBottom: rs(180),
  },
  yearSection: {
    marginTop: rs(SPACING.md),
    marginBottom: rs(SPACING.xl),
  },
  yearHeader: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(SPACING.lg),
    marginBottom: rs(SPACING.md),
    zIndex: 10,
  },
  yearTitle: {
    fontSize: fp(20),
    color: COLORS.white,
    fontWeight: '700',
  },
  yearPickerButton: {
    width: rs(32),
    height: rs(32),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: rs(SPACING.xs),
  },
  yearTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearPickerDropdown: {
    position: 'absolute',
    top: rs(36),
    left: rs(SPACING.lg),
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    paddingVertical: rs(8),
    paddingHorizontal: rs(6),
    minWidth: rs(160),
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.15,
    shadowRadius: rs(12),
    elevation: 8,
  },
  yearPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    borderRadius: rs(16),
  },
  yearPickerItemActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  yearPickerItemText: {
    fontSize: fp(17),
    color: '#1A1A1A',
  },
  yearPickerItemTextActive: {
    fontWeight: '700',
  },
  yearPickerCheckCircle: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCardsContainer: {
    paddingHorizontal: rs(SPACING.lg),
    gap: rs(12),
  },
  monthCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: rs(SPACING.lg),
    gap: rs(10),
  },
  monthCard: {
    width: (SCREEN_WIDTH - rs(SPACING.lg) * 2 - rs(10)) / 2,
  },
  monthCardInner: {
    borderRadius: rs(16),
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  monthCardImage: {
    width: '100%',
    aspectRatio: 1,
  },
  monthBadge: {
    position: 'absolute',
    bottom: rs(12),
    left: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(6),
    borderRadius: rs(12),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  monthBadgeText: {
    fontSize: fp(13),
    color: COLORS.white,
    fontWeight: '600',
  },
  multipleIcon: {
    position: 'absolute',
    top: rs(12),
    right: rs(12),
  },
  collageSection: {
    paddingHorizontal: rs(SPACING.lg),
    marginTop: rs(SPACING.lg),
    marginBottom: rs(SPACING.lg),
  },
  collageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(SPACING.xs),
  },
  collageSectionTitle: {
    fontSize: fp(20),
    fontWeight: '700',
    color: COLORS.white,
  },
  monthModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  missionPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  monthModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  coverPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  coverPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: rs(20),
    paddingTop: rs(16),
    paddingBottom: rs(8),
  },
  monthModalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '90%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderTopLeftRadius: rs(32),
    borderTopRightRadius: rs(32),
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  monthModalCloseButton: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: rs(SPACING.lg),
    paddingTop: rs(32),
    paddingBottom: rs(SPACING.lg),
  },
  monthModalTitle: {
    fontSize: fp(28),
    color: COLORS.white,
    fontWeight: '700',
  },
  monthModalCount: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    marginTop: rs(8),
  },
  monthAlbumSectionHeader: {
    paddingVertical: rs(14),
    paddingHorizontal: rs(SPACING.lg),
  },
  monthModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: rs(SPACING.lg) - 1,
    gap: rs(2),
  },
  monthModalItem: {
    width: IS_LARGE_DEVICE ? (width - rs(SPACING.lg) * 2 - rs(4)) / 3 : (width - rs(SPACING.lg) * 2 - rs(2)) / 2,
    aspectRatio: 1,
  },
  monthModalItemInner: {
    flex: 1,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  monthModalItemImage: {
    width: '100%',
    height: '100%',
  },
  photoDetailContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rs(SPACING.lg),
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  // Carousel styles
  carouselContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  carouselOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  carouselScrollContent: {
    alignItems: 'center',
  },
  carouselCardContainer: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowRadius: rs(20),
    shadowOpacity: 0.5,
    elevation: 10,
  },
  // Android PagerView styles for photo carousel
  androidPhotoPagerView: {
    flex: 1,
  },
  androidPhotoPageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidPhotoCardWrapper: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowRadius: rs(20),
    shadowOpacity: 0.5,
    elevation: 10,
  },
  photoDetailBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  photoDetailTopButtons: {
    position: 'absolute',
    top: rs(48),
    right: rs(24),
    flexDirection: 'row',
    gap: rs(12),
    zIndex: 10,
  },
  photoDetailTopButtonsContainer: {
    position: 'absolute',
    top: rs(60),
    left: rs(20),
    right: rs(20),
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  photoDetailMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  photoDetailMenuDropdown: {
    position: 'absolute',
    top: rs(100),
    right: rs(20),
    borderRadius: rs(10),
    paddingVertical: rs(5),
    minWidth: rs(95),
    zIndex: 100,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoDetailMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(10),
    paddingHorizontal: rs(13),
    gap: rs(8),
  },
  photoDetailMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  photoDetailMenuItemText: {
    fontSize: fp(14),
    color: COLORS.white,
    fontWeight: '500',
  },
  photoDetailButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDetailCloseButton: {
    position: 'absolute',
    top: rs(60),
    right: rs(20),
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  photoDetailCard: {
    width: IS_LARGE_DEVICE ? '65%' : '95%',
    aspectRatio: 3 / 4,
    borderRadius: rs(16),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity: 0.3,
    shadowRadius: rs(16),
    elevation: 8,
  },
  photoDetailImage: {
    width: '100%',
    height: '100%',
  },
  photoInfoCard: {
    width: IS_LARGE_DEVICE ? '65%' : '95%',
    marginTop: rs(SPACING.lg),
    padding: rs(SPACING.lg),
    borderRadius: rs(16),
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoInfoTitle: {
    fontSize: fp(20),
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: rs(SPACING.md),
  },
  photoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    marginBottom: rs(SPACING.xs),
  },
  photoInfoText: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.9)',
  },
  photoMessages: {
    marginTop: rs(SPACING.md),
    paddingTop: rs(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    gap: rs(SPACING.md),
  },
  photoMessageItem: {},
  photoMessageLabel: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    marginBottom: rs(4),
  },
  photoMessageText: {
    fontSize: fp(15),
    color: COLORS.white,
    lineHeight: fp(22),
  },
  // Flip Card Styles
  flipInstructionContainer: {
    position: 'absolute',
    top: rs(140),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  flipInstructionBadge: {
    paddingHorizontal: rs(16),
    paddingVertical: rs(8),
    borderRadius: rs(20),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  flipInstructionText: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  singleCardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoFlatList: {
    flex: 1,
  },
  flatListCardWrapper: {
    width: width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.025,
  },
  flipCardContainer: {
    width: IS_LARGE_DEVICE ? '65%' : '95%',
    aspectRatio: 3 / 4,
  },
  flipCardPressable: {
    width: '100%',
    height: '100%',
  },
  flipCardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: rs(16),
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity: 0.4,
    shadowRadius: rs(16),
    ...(Platform.OS === 'ios' ? { elevation: 10 } : {}),
  },
  flipCardBack: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  flipCardImage: {
    width: '100%',
    height: '100%',
  },
  flipCardBackGradient: {
    flex: 1,
    borderRadius: rs(16),
  },
  flipCardBackContent: {
    flex: 1,
    padding: rs(24),
    backgroundColor: '#1a1a1a',
    borderRadius: rs(16),
  },
  flipCardBackTop: {
    marginBottom: rs(16),
  },
  flipCardTitle: {
    fontSize: fp(22),
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: rs(16),
    lineHeight: fp(28),
    flexShrink: 1,
  },
  flipCardInfoSection: {
    gap: rs(8),
    marginBottom: rs(16),
  },
  flipCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
  },
  flipCardInfoText: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  flipCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  flipCardMessages: {
    flex: 1,
    justifyContent: 'space-between',
  },
  flipCardMessageCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipCardMessageTop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  flipCardNicknameText: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '700',
    marginBottom: rs(4),
  },
  flipCardAddMessageButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: rs(12),
    paddingHorizontal: rs(24),
    borderRadius: rs(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  flipCardAddMessageButtonText: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
  },
  flipCardMessageItem: {
    gap: rs(4),
  },
  flipCardMessageLabel: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  flipCardMessageText: {
    fontSize: fp(15),
    color: COLORS.white,
    fontWeight: '400',
    lineHeight: fp(22),
  },
  flipCardSpendingGap: {
    height: rs(24),
  },
  flipCardSpendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: rs(10),
  },
  flipCardSpendingLabel: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  flipCardSpendingAmount: {
    fontSize: fp(14),
    color: COLORS.white,
    fontWeight: '600',
  },
  // Message edit modal styles
  messageEditBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  messageEditContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: rs(40),
    paddingHorizontal: rs(20),
  },
  messageEditCard: {
    backgroundColor: 'rgba(40,40,40,0.95)',
    borderRadius: rs(16),
    padding: rs(20),
    gap: rs(16),
  },
  messageEditTitle: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  messageEditInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: rs(12),
    padding: rs(14),
    fontSize: fp(15),
    color: COLORS.white,
    minHeight: rs(100),
    textAlignVertical: 'top',
  },
  messageEditButtons: {
    flexDirection: 'row' as const,
    gap: rs(12),
  },
  messageEditCancelButton: {
    flex: 1,
    paddingVertical: rs(14),
    borderRadius: rs(12),
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center' as const,
  },
  messageEditCancelText: {
    fontSize: fp(15),
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  messageEditSaveButton: {
    flex: 1,
    paddingVertical: rs(14),
    borderRadius: rs(12),
    backgroundColor: COLORS.white,
    alignItems: 'center' as const,
  },
  messageEditSaveText: {
    fontSize: fp(15),
    color: COLORS.black,
    fontWeight: '600',
  },
  // Unified Record Edit styles
  recordEditOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  recordEditKeyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.025,
  },
  recordEditCard: {
    width: IS_LARGE_DEVICE ? '65%' : '95%',
    aspectRatio: 3 / 4,
    backgroundColor: 'rgba(40,40,40,0.95)',
    borderRadius: rs(16),
    padding: rs(20),
    gap: rs(12),
    overflow: 'hidden',
  },
  recordEditLabel: {
    fontSize: fp(13),
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: rs(4),
  },
  recordEditInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: rs(12),
    padding: rs(14),
    fontSize: fp(15),
    color: COLORS.white,
    marginBottom: rs(8),
  },
  recordEditMultiline: {
    minHeight: rs(80),
    textAlignVertical: 'top' as const,
  },
  photoCounterContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? rs(130) : rs(90),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  photoCounterBadge: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(6),
    borderRadius: rs(16),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoCounterText: {
    fontSize: fp(13),
    color: COLORS.white,
    fontWeight: '600',
  },
  wordContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: rs(1),
    maxWidth: '100%',
  },
  wordContainerTiny: {
    flexDirection: 'row',
    flexWrap: 'nowrap', // Keep word characters together, prevent mid-word breaks
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  // Album Detail Full Screen Styles
  albumDetailFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  albumDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(20),
    paddingTop: rs(60),
    paddingBottom: rs(16),
    position: 'relative',
  },
  albumDetailCloseButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumDetailTitle: {
    fontSize: fp(18),
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  albumDetailTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumDetailScrollView: {
    flex: 1,
  },
  albumDetailScrollContent: {
    flexGrow: 1,
    paddingBottom: rs(100),
  },
  albumPhotosGridContainer: {
    paddingHorizontal: rs(SPACING.lg),
    paddingTop: rs(SPACING.md),
  },
  albumPhotosSectionTitle: {
    fontSize: fp(24),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumTotalSpending: {
    fontSize: fp(15),
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: rs(10),
  },
  albumMonthPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(10),
  },
  addPhotoButton: {
    width: (SCREEN_WIDTH - rs(SPACING.lg) * 2 - rs(10)) / 2,
    aspectRatio: 1,
    borderRadius: rs(12),
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddPhotoButton: {
    width: (SCREEN_WIDTH - rs(SPACING.lg) * 2 - rs(10)) / 2,
    aspectRatio: 1,
    borderRadius: rs(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(12),
  },
  emptyAddPhotoButtonText: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: rs(8),
  },
  addPhotoButtonText: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: rs(8),
  },
  missionPhotoItem: {
    width: (SCREEN_WIDTH - rs(SPACING.lg) * 2 - rs(10)) / 2,
    aspectRatio: 1,
    borderRadius: rs(12),
    overflow: 'hidden',
    position: 'relative',
  },
  missionPhotoImage: {
    width: '100%',
    height: '100%',
  },
  photoSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Photo Selection Overlay
  photoSelectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: rs(12),
  },
  photoSelectionOverlaySelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  photoSelectionCheck: {
    position: 'absolute',
    bottom: rs(8),
    right: rs(8),
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mission Photos Picker Header (reused in month modal style)
  missionPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(SPACING.lg),
    paddingTop: rs(32),
    paddingBottom: rs(SPACING.lg),
  },
  missionPickerTitle: {
    fontSize: fp(20),
    fontWeight: '700',
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  missionPickerItemDisabled: {
    opacity: 0.4,
  },
  missionPickerItemOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionPickerSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  missionPickerCheckBadge: {
    position: 'absolute',
    bottom: rs(8),
    right: rs(8),
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionPickerEmpty: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(60),
  },
  missionPickerEmptyText: {
    fontSize: fp(15),
    color: 'rgba(255, 255, 255, 0.5)',
  },
  missionPickerHeaderButton: {
    paddingHorizontal: rs(16),
    paddingVertical: rs(8),
    minWidth: rs(50),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: rs(100),
  },
  missionPickerHeaderButtonText: {
    fontSize: fp(15),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  missionPickerDoneButton: {
    color: '#007AFF',
    fontWeight: '600',
  },
  missionPickerDoneButtonDisabled: {
    color: 'rgba(0, 122, 255, 0.4)',
  },
  missionPickerItemSelected: {
    backgroundColor: 'rgba(236, 72, 153, 0.7)',
    borderWidth: rs(3),
    borderColor: '#EC4899',
  },

});
